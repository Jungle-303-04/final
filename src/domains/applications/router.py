"""애플리케이션·deployment binding API 라우트"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.application_filter.query import ApplicationFilters, parse_application_filters
from domains.applications.product_projection import (
    APPLICATION_TOPOLOGY_NODE_LIMIT,
    application_card,
    application_detail,
    deployment_history_projection,
    detail_scope_projection,
    drift_projection,
    workload_scope_projection,
)
from domains.applications.source_validation import (
    persist_repository_connect_validation,
    validated_manifest_resources,
)
from domains.gitops.repository import (
    derive_application_id,
    derive_repository_id,
    repository_credential_scope,
)
from domains.gitops.repository_discovery import (
    GitHubRepositoryClient,
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    normalize_github_repo_ref,
    normalize_source_type,
    source_type_from_path,
)
from domains.identity.dependencies import (
    require_cluster_access,
    require_resource_access,
    require_session,
    resolve_allowed_application_ids,
    resolve_allowed_cluster_ids,
)
from domains.scm.github_app_credentials import make_app_installation_ref
from domains.target.connectivity import (
    AGENT_STATUS_ONLINE,
    AGENT_STATUS_STALE,
    cluster_connection_status,
)
from domains.target.management_guard import (
    is_management_registration,
    management_readonly_detail,
)
from packages.contracts.gateway import limits as gateway_limits
from packages.contracts.gateway import params as gateway_params
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ApplicationConnectRequest,
    ApplicationUpsertRequest,
    DeploymentBindingUpsertRequest,
    RepositoryDisconnectRequest,
    RepositoryManifestValidationRequest,
)
from packages.contracts.gateway.responses import (
    ApplicationDeploymentHistoryResponse,
    ApplicationDriftResponse,
    ApplicationProductDetailResponse,
    ApplicationProductListResponse,
    ApplicationResponse,
    DeploymentBindingResponse,
    RepositoryConnectionStatusResponse,
    WorkflowRunListResponse,
)
from packages.contracts.gitops import DEFAULT_REPO_BRANCH, PUBLIC_GITHUB_CREDENTIAL_REF
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
    ServiceRole,
)
from packages.contracts.security import SecretRef
from packages.runtime.dependencies import get_db
from packages.security import SecretNotFound, SecretProviderUnavailable, build_token_vault
from packages.security.credentials import (
    CredentialEncryptionError,
    credential_ref,
    decrypt_credential,
    encrypt_credential,
    parse_credential_ref,
)
from packages.storage.engine import unit_of_work_or_null
from packages.storage.retry import to_thread_db_retry

router = APIRouter()
# 글로벌 서비스 선언 — cluster_id 자리에 쓰는 특수값(등록된 전 클러스터로 확장).
GLOBAL_CLUSTER_SELECTOR = "*"
GLOBAL_BINDING_KEY = "global"
NO_CLUSTERS_FOR_GLOBAL_BINDING = "no registered clusters to expand global binding"
HTTP_NOT_FOUND = 404
HTTP_UNPROCESSABLE_ENTITY = 422
APPLICATION_NOT_FOUND = "application not found"
REPOSITORY_NOT_FOUND = "repository not found"
EXPLICIT_REPOSITORY_ID_NOT_ALLOWED = (
    "repository_id must not be provided when creating an application"
)
MANIFEST_VALIDATION_FAILED = "manifest validation failed"
CLUSTER_NOT_CONNECTED_CODE = "cluster_not_connected"
CLUSTER_NOT_CONNECTED_DETAIL = "에이전트가 연결되지 않은 클러스터입니다"
REPOSITORY_CREDENTIAL_UNAVAILABLE = "repository credential is unavailable"
APPLICATION_FILTER_INVALID = "application filter request is invalid"
APPLICATION_LABEL_PROJECTION_UNAVAILABLE = "application label projection is unavailable"


def repository_discovery_service() -> RepositoryDiscoveryService:
    return RepositoryDiscoveryService()


def require_application_access(
    db: Any,
    current: Any,
    workspace_id: str,
    application_id: str,
    permission: str,
) -> None:
    require_resource_access(
        db,
        current,
        workspace_id,
        AccessResourceType.APPLICATION.value,
        application_id,
        permission,
    )


def get_application_or_404(db: Any, workspace_id: str, application_id: str) -> dict[str, Any]:
    application = db.get_application(workspace_id, application_id)
    if application is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=APPLICATION_NOT_FOUND)
    return application


def register_repository_or_404(db: Any, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return db.register_repository(body)
    except LookupError as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=REPOSITORY_NOT_FOUND) from exc


def upsert_application_or_404(db: Any, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return db.upsert_application(body)
    except LookupError as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=APPLICATION_NOT_FOUND) from exc


def require_repository_manage_if_registered(
    db: Any,
    current: Any,
    workspace_id: str,
    repo_ref: str,
) -> dict[str, Any] | None:
    get_repository = getattr(db, "get_repository_by_ref", None)
    if not callable(get_repository):
        raise HTTPException(status_code=403, detail="resource access denied")
    repository = get_repository(workspace_id, repo_ref)
    if repository is None:
        return None
    repository_id = str(repository.get("repository_id") or "")
    if not repository_id:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=REPOSITORY_NOT_FOUND)
    if ServiceRole.SERVICE_ADMIN.value not in tuple(getattr(current, "roles", ()) or ()):
        list_applications = getattr(db, "list_repository_applications", None)
        if not callable(list_applications):
            raise HTTPException(status_code=403, detail="resource access denied")
        applications = list_applications(workspace_id, repository_id)
        if not applications:
            raise HTTPException(status_code=403, detail="resource access denied")
        for application in applications:
            require_application_access(
                db,
                current,
                workspace_id,
                str(application["application_id"]),
                Permission.APPLICATION_MANAGE.value,
            )
    return repository


def require_application_manage_if_registered(
    db: Any,
    current: Any,
    workspace_id: str,
    body: dict[str, Any],
) -> dict[str, Any] | None:
    repository_id = str(body.get("repository_id") or derive_repository_id(body))
    name = str(body.get("name") or "")
    get_by_identity = getattr(db, "get_application_by_identity", None)
    if callable(get_by_identity):
        application = get_by_identity(workspace_id, repository_id, name)
    else:
        get_application = getattr(db, "get_application", None)
        application = (
            get_application(workspace_id, derive_application_id(body))
            if callable(get_application)
            else None
        )
    if application is None:
        return None
    require_application_access(
        db,
        current,
        workspace_id,
        str(application["application_id"]),
        Permission.APPLICATION_MANAGE.value,
    )
    return application


def latest_agents_for_clusters(
    db: Any,
    workspace_id: str,
    cluster_ids: list[str],
) -> dict[str, dict[str, Any]]:
    getter = getattr(db, "latest_cluster_agent_statuses", None)
    if callable(getter):
        return getter(workspace_id, set(cluster_ids))
    lister = getattr(db, "list_cluster_agent_statuses", None)
    if not callable(lister):
        return {}
    latest: dict[str, dict[str, Any]] = {}
    for cluster_id in cluster_ids:
        rows = lister(workspace_id, cluster_id)
        if rows:
            latest[cluster_id] = rows[0]
    return latest


def require_connected_clusters(db: Any, workspace_id: str, cluster_ids: list[str]) -> None:
    latest_agents = latest_agents_for_clusters(db, workspace_id, cluster_ids)
    disconnected = [
        cluster_id
        for cluster_id in cluster_ids
        if cluster_connection_status(latest_agents.get(cluster_id)) != "online"
    ]
    if disconnected:
        raise HTTPException(
            status_code=400,
            detail={
                "code": CLUSTER_NOT_CONNECTED_CODE,
                "detail": CLUSTER_NOT_CONNECTED_DETAIL,
                "clusters": disconnected,
            },
        )


def cluster_registration(db: Any, workspace_id: str, cluster_id: str) -> dict[str, Any] | None:
    getter = getattr(db, "get_cluster_registration", None)
    if callable(getter):
        return getter(workspace_id, cluster_id)
    lister = getattr(db, "list_cluster_registrations", None)
    if not callable(lister):
        return None
    return next(
        (
            registration
            for registration in lister(workspace_id)
            if str(registration.get("cluster_id")) == cluster_id
        ),
        None,
    )


def require_deployment_target_cluster(db: Any, workspace_id: str, cluster_id: str) -> None:
    """deployment binding은 target 역할 클러스터만 허용한다."""
    registration = cluster_registration(db, workspace_id, cluster_id)
    if is_management_registration(registration):
        raise HTTPException(status_code=400, detail=management_readonly_detail())


def store_repo_token_if_present(
    db: Any,
    workspace_id: str,
    repository_id: str,
    token: str | None,
) -> str | None:
    """레포 연결 토큰을 워크스페이스 credential vault에 저장하고 ref만 반환."""
    if not token:
        return None
    scope = repository_credential_scope(repository_id)
    ref = credential_ref("github", scope)
    upsert = getattr(db, "upsert_workspace_credential", None)
    if callable(upsert):
        upsert(
            {
                "workspace_id": workspace_id,
                "provider": "github",
                "scope": scope,
                "encrypted_value": encrypt_credential(token),
                "metadata": {"credential_ref": ref, "repository_id": repository_id},
            }
        )
    return ref


def stored_repo_credential_ref(
    db: Any,
    workspace_id: str,
    repository_id: str,
) -> str | None:
    """Resolve only the active credential bound to this workspace and repository."""
    getter = getattr(db, "get_workspace_credential", None)
    if not callable(getter):
        return None
    scope = repository_credential_scope(repository_id)
    stored = getter(workspace_id, "github", scope)
    if not stored:
        return None
    if (
        str(stored.get("workspace_id") or "") != workspace_id
        or str(stored.get("provider") or "") != "github"
        or str(stored.get("scope") or "") != scope
    ):
        return None
    return credential_ref("github", scope)


def database_credential_token(db: Any, workspace_id: str, ref: str | None) -> str | None:
    if not ref:
        return None
    if ref == PUBLIC_GITHUB_CREDENTIAL_REF:
        return None
    if not ref.startswith("db:"):
        try:
            return build_token_vault().read_token(SecretRef(ref))
        except (SecretNotFound, SecretProviderUnavailable, ValueError) as exc:
            raise HTTPException(status_code=422, detail=REPOSITORY_CREDENTIAL_UNAVAILABLE) from exc
    getter = getattr(db, "get_workspace_credential", None)
    if not callable(getter):
        raise HTTPException(status_code=422, detail=REPOSITORY_CREDENTIAL_UNAVAILABLE)
    try:
        provider, scope = parse_credential_ref(ref)
        stored = getter(workspace_id, provider, scope)
        if (
            not stored
            or str(stored.get("workspace_id") or "") != workspace_id
            or str(stored.get("provider") or "") != provider
            or str(stored.get("scope") or "") != scope
        ):
            raise CredentialEncryptionError("credential scope mismatch")
        return decrypt_credential(str(stored.get("encrypted_value") or ""))
    except CredentialEncryptionError as exc:
        raise HTTPException(status_code=422, detail=REPOSITORY_CREDENTIAL_UNAVAILABLE) from exc


def discovery_with_token(discovery: Any, token: str | None) -> Any:
    scoped_token = token or ""
    factory = getattr(discovery, "with_token", None)
    if callable(factory):
        return factory(scoped_token)
    if isinstance(discovery, RepositoryDiscoveryService):
        return RepositoryDiscoveryService(
            GitHubRepositoryClient(token=scoped_token),
            render_executor=discovery.render_executor,
        )
    return discovery


def is_service_admin_session(current: Any) -> bool:
    return ServiceRole.SERVICE_ADMIN.value in tuple(getattr(current, "roles", ()) or ())


def lock_repository_identity_if_supported(db: Any, workspace_id: str, repo_ref: str) -> None:
    locker = getattr(db, "lock_repository_identity", None)
    if callable(locker):
        locker(workspace_id, repo_ref)


def lock_repository_credential_if_supported(
    db: Any,
    workspace_id: str,
    repository_id: str,
) -> None:
    locker = getattr(db, "lock_workspace_credential_scope", None)
    if callable(locker):
        locker(workspace_id, "github", repository_credential_scope(repository_id))


def authorized_stored_repo_credential_ref(
    db: Any,
    current: Any,
    workspace_id: str,
    repository_id: str,
    existing_repository: dict[str, Any] | None,
) -> str | None:
    stored_ref = stored_repo_credential_ref(db, workspace_id, repository_id)
    if (
        stored_ref is not None
        and existing_repository is None
        and not is_service_admin_session(current)
    ):
        raise HTTPException(status_code=409, detail="repository credential is already reserved")
    return stored_ref


def _parse_product_filters(
    *,
    clusters: str | None,
    namespaces: str | None,
    applications: str | None,
    labels: str | None,
    environments: str | None,
    statuses: str | None,
    pending_promotion: str | None,
    query: str | None,
) -> ApplicationFilters:
    try:
        return parse_application_filters(
            clusters=clusters,
            namespaces=namespaces,
            applications=applications,
            environments=environments,
            statuses=statuses,
            pending_promotion=pending_promotion,
            labels=labels,
            query=query,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=APPLICATION_FILTER_INVALID) from exc


async def _product_scope(
    db: Any,
    current: Any,
    workspace_id: str,
) -> tuple[set[str], set[str]]:
    cluster_task = asyncio.to_thread(
        resolve_allowed_cluster_ids,
        db,
        current,
        workspace_id,
        Permission.INVENTORY_READ.value,
    )
    application_task = asyncio.to_thread(
        resolve_allowed_application_ids,
        db,
        current,
        workspace_id,
        Permission.APPLICATION_READ.value,
    )
    clusters, applications = await asyncio.gather(cluster_task, application_task)
    return set(clusters), set(applications)


async def _allowed_product_cluster_ids(
    db: Any,
    current: Any,
    workspace_id: str,
) -> set[str]:
    return set(
        await asyncio.to_thread(
            resolve_allowed_cluster_ids,
            db,
            current,
            workspace_id,
            Permission.INVENTORY_READ.value,
        )
    )


def _require_product_filter_scope(
    filters: ApplicationFilters,
    *,
    allowed_cluster_ids: set[str],
    allowed_application_ids: set[str],
) -> None:
    requested_clusters = set(filters.clusters) | {
        cluster_id for cluster_id, _namespace in filters.namespaces
    }
    if not requested_clusters.issubset(allowed_cluster_ids):
        raise HTTPException(status_code=404, detail=APPLICATION_NOT_FOUND)
    if not set(filters.applications).issubset(allowed_application_ids):
        raise HTTPException(status_code=404, detail=APPLICATION_NOT_FOUND)


async def _visible_application_runs(
    db: Any,
    *,
    workspace_id: str,
    application_id: str,
    allowed_cluster_ids: set[str],
    limit: int,
) -> list[dict[str, Any]]:
    if not allowed_cluster_ids:
        return []
    rows = await asyncio.to_thread(
        db.list_application_workflow_runs,
        workspace_id,
        application_id,
        limit=limit,
    )
    return [dict(row) for row in rows if str(row.get("cluster_id") or "") in allowed_cluster_ids]


async def _visible_application_bindings(
    db: Any,
    *,
    workspace_id: str,
    application_id: str,
    allowed_cluster_ids: set[str],
) -> list[dict[str, Any]]:
    raw_bindings = await asyncio.to_thread(
        db.list_application_deployment_bindings,
        workspace_id,
        application_id,
        limit=500,
    )
    return [
        dict(binding)
        for binding in raw_bindings
        if str(binding.get("cluster_id") or "") in allowed_cluster_ids
    ]


async def _detail_scope_state(
    db: Any,
    *,
    workspace_id: str,
    application: Mapping[str, Any],
    allowed_cluster_ids: set[str],
    requested_instance_id: str | None,
) -> tuple[list[dict[str, Any]], dict[str, Any], dict[str, Any] | None]:
    application_id = str(application.get("application_id") or "")
    bindings = await _visible_application_bindings(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
    )
    bound_cluster_ids = {
        str(binding.get("cluster_id") or "")
        for binding in bindings
        if str(binding.get("cluster_id") or "")
    }
    latest_agents = await asyncio.to_thread(
        latest_agents_for_clusters,
        db,
        workspace_id,
        sorted(bound_cluster_ids),
    )
    freshness_by_cluster = {
        cluster_id: _scope_freshness(latest_agents.get(cluster_id))
        for cluster_id in bound_cluster_ids
    }
    scope = detail_scope_projection(
        application,
        bindings,
        requested_instance_id=requested_instance_id,
        freshness_by_cluster=freshness_by_cluster,
    )
    selected_instance_id = str(scope.get("selected_instance_id") or "")
    if requested_instance_id is not None and selected_instance_id != requested_instance_id:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=APPLICATION_NOT_FOUND)
    selected_binding = next(
        (
            binding
            for binding in bindings
            if str(binding.get("binding_id") or "") == selected_instance_id
        ),
        None,
    )
    return bindings, scope, selected_binding


def _scope_freshness(agent: Mapping[str, Any] | None) -> str:
    connection = cluster_connection_status(agent)
    if connection == AGENT_STATUS_ONLINE:
        return "live"
    if connection == AGENT_STATUS_STALE:
        return "stale"
    return "disconnected"


def _runs_for_instance(
    runs: list[dict[str, Any]],
    binding: Mapping[str, Any] | None,
) -> list[dict[str, Any]]:
    if binding is None:
        return runs
    binding_id = str(binding.get("binding_id") or "")
    if not binding_id:
        return []
    return [run for run in runs if str(run.get("binding_id") or "") == binding_id]


def _inventory_for_instance(
    rows: list[dict[str, Any]],
    binding: Mapping[str, Any] | None,
) -> list[dict[str, Any]]:
    if binding is None:
        return rows
    cluster_id = str(binding.get("cluster_id") or "")
    namespace = str(binding.get("namespace") or "").strip()
    return [
        row
        for row in rows
        if str(row.get("cluster_id") or "") == cluster_id
        and (
            namespace == ""
            or row.get("namespace") is None
            or str(row.get("namespace") or "") == namespace
        )
    ]


async def _product_state(
    db: Any,
    *,
    workspace_id: str,
    application: Mapping[str, Any],
    allowed_cluster_ids: set[str],
    requested_instance_id: str | None = None,
    requested_workload_key: str | None = None,
    select_instance: bool = False,
) -> dict[str, Any]:
    application_id = str(application.get("application_id") or "")
    if select_instance:
        bindings, scope, selected_binding = await _detail_scope_state(
            db,
            workspace_id=workspace_id,
            application=application,
            allowed_cluster_ids=allowed_cluster_ids,
            requested_instance_id=requested_instance_id,
        )
    else:
        bindings = await _visible_application_bindings(
            db,
            workspace_id=workspace_id,
            application_id=application_id,
            allowed_cluster_ids=allowed_cluster_ids,
        )
        scope = None
        selected_binding = None
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=100,
    )
    if select_instance:
        runs = _runs_for_instance(runs, selected_binding)
    bound_cluster_ids = {
        str(binding.get("cluster_id") or "")
        for binding in bindings
        if str(binding.get("cluster_id") or "")
    }
    evidence_cluster_ids = (
        {str(selected_binding.get("cluster_id") or "")}
        if select_instance and selected_binding is not None
        else bound_cluster_ids or allowed_cluster_ids
    )
    evidence_cluster_ids.discard("")
    inventory_rows, inventory_context, incident_evidence = await asyncio.gather(
        asyncio.to_thread(
            db.get_application_inventory_evidence,
            workspace_id=workspace_id,
            application_id=application_id,
            allowed_cluster_ids=evidence_cluster_ids,
        ),
        asyncio.to_thread(
            db.filter_snapshot_context,
            workspace_id,
            evidence_cluster_ids,
        ),
        asyncio.to_thread(
            db.get_application_incident_evidence,
            workspace_id=workspace_id,
            application_id=application_id,
            allowed_cluster_ids=evidence_cluster_ids,
            limit=3,
        ),
    )
    inventory = [dict(row) for row in inventory_rows]
    if select_instance:
        inventory = _inventory_for_instance(inventory, selected_binding)
        # Incident rows are linked to the application, not an immutable
        # deployment binding. Never present an app-wide incident as proof for
        # one selected instance.
        incident_evidence = {
            "complete": False,
            "open_count": None,
            "items": [],
            "scope_partial_reason_codes": ["instance_incident_scope_unavailable"],
        }
        workload_scope = workload_scope_projection(
            application,
            inventory,
            inventory_context=inventory_context,
            scope=scope,
            requested_workload_key=requested_workload_key,
        )
        selected_workload_key = str(workload_scope.get("selected_workload_key") or "")
        workload_runtime_rows: list[dict[str, Any]] = []
        workload_cost_evidence: list[dict[str, Any]] = []
        workload_runtime_truncated = False
        if selected_workload_key:
            root = next(
                (row for row in inventory if str(row.get("id") or "") == selected_workload_key),
                None,
            )
            if root is not None:
                root_cluster_id = str(root.get("cluster_id") or "")
                runtime, workload_cost_evidence = await asyncio.gather(
                    asyncio.to_thread(
                        db.get_application_workload_runtime_evidence,
                        workspace_id=workspace_id,
                        cluster_id=root_cluster_id,
                        namespace=(
                            str(root.get("namespace"))
                            if root.get("namespace") is not None
                            else None
                        ),
                        # One root occupies the same bounded topology response.
                        pod_limit=max(1, APPLICATION_TOPOLOGY_NODE_LIMIT - 1),
                    ),
                    asyncio.to_thread(
                        db.list_cost_evidence_windows,
                        workspace_id,
                        (root_cluster_id,),
                        since=datetime.now(tz=UTC) - timedelta(hours=24),
                    ),
                )
                by_id = {str(root.get("id") or ""): dict(root)}
                for row in runtime.get("rows") or []:
                    if isinstance(row, Mapping) and str(row.get("id") or ""):
                        by_id[str(row["id"])] = dict(row)
                workload_runtime_rows = list(by_id.values())
                workload_runtime_truncated = bool(runtime.get("truncated"))
    return {
        "bindings": bindings,
        "runs": runs,
        "inventory_rows": inventory,
        "inventory_context": inventory_context,
        "incident_evidence": incident_evidence,
        **({"scope": scope} if scope is not None else {}),
        **({"workload_scope": workload_scope} if select_instance else {}),
        **({"workload_runtime_rows": workload_runtime_rows} if select_instance else {}),
        **({"workload_runtime_truncated": workload_runtime_truncated} if select_instance else {}),
        **({"workload_cost_evidence": workload_cost_evidence} if select_instance else {}),
    }


def _application_problem_sort(card: Mapping[str, Any]) -> tuple[int, int, int, str, str]:
    incidents = card.get("open_incidents")
    health = str(_mapping(card.get("health")).get("status") or "unknown")
    return (
        0 if isinstance(incidents, int) and incidents > 0 else 1,
        0 if card.get("has_drift") is True else 1,
        0 if health == "degraded" else 1 if health == "unknown" else 2,
        str(card.get("name") or "").casefold(),
        str(card.get("id") or ""),
    )


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


@router.get(
    gateway_routes.REPOSITORY_CONNECTION_STATUS_PATH,
    response_model=RepositoryConnectionStatusResponse,
)
async def get_repository_connection_status(
    repo_ref: Annotated[str, Query(min_length=1, max_length=240)],
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RepositoryConnectionStatusResponse:
    """Return persisted registration progress so the wizard never advances on a timer."""

    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    try:
        normalized_repo_ref = normalize_github_repo_ref(repo_ref)
    except RepositoryDiscoveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    repository = db.get_repository_by_ref(workspace_id, normalized_repo_ref)
    if repository is None:
        return RepositoryConnectionStatusResponse(
            repo_ref=normalized_repo_ref,
            repository_status="unregistered",
            connection_stage="awaiting_validation",
            terminal=False,
            refresh_after_seconds=1,
        )
    require_repository_manage_if_registered(
        db,
        current,
        workspace_id,
        normalized_repo_ref,
    )
    repository_status = str(repository.get("status") or "unknown")
    known_statuses = {
        "active",
        "invalid_credential",
        "disabled",
        "source_unreachable",
        "disconnected",
    }
    if repository_status not in known_statuses:
        repository_status = "unknown"
    connection_stage = "ready" if repository_status == "active" else "error"
    # 상태→사용자 노출 사유 매핑(단일 라이브 상태에서 '왜' 를 UI 로 전달).
    degraded_reason = {
        "invalid_credential": "credential_invalid",
        "source_unreachable": "source_unreachable",
        "disabled": "disabled",
        "disconnected": "disconnected",
    }.get(repository_status)
    return RepositoryConnectionStatusResponse(
        repo_ref=normalized_repo_ref,
        repository_id=str(repository.get("repository_id") or ""),
        repository_status=repository_status,
        connection_stage=connection_stage,
        terminal=True,
        refresh_after_seconds=None,
        degraded_reason=degraded_reason,
    )


@router.post(
    gateway_routes.REPOSITORY_DISCONNECT_PATH,
    response_model=RepositoryConnectionStatusResponse,
)
async def disconnect_repository_connection(
    payload: RepositoryDisconnectRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RepositoryConnectionStatusResponse:
    """저장소 연결을 명시적으로 해제한다(고아 없이 종단 상태로 수렴).

    관리 권한이 있는 사용자만 호출 가능하며, 저장소·watch·binding·application 을
    한 트랜잭션에서 비활성으로 내리고 저장된 repo-scope 자격증명을 삭제한다.
    미등록 저장소는 404, 이미 해제됨은 멱등하게 disconnected 를 다시 돌려준다.
    """
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    try:
        normalized_repo_ref = normalize_github_repo_ref(payload.repo_ref)
    except RepositoryDiscoveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # 권한 게이트: 미등록이면 None → 404, 관리 불가면 내부에서 403.
    manageable = require_repository_manage_if_registered(
        db,
        current,
        workspace_id,
        normalized_repo_ref,
    )
    if manageable is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=REPOSITORY_NOT_FOUND)
    result = await to_thread_db_retry(
        db.disconnect_repository,
        workspace_id,
        normalized_repo_ref,
    )
    if result is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=REPOSITORY_NOT_FOUND)
    return RepositoryConnectionStatusResponse(
        repo_ref=normalized_repo_ref,
        repository_id=str(result.get("repository_id") or ""),
        repository_status="disconnected",
        connection_stage="error",
        terminal=True,
        refresh_after_seconds=None,
        degraded_reason="disconnected",
    )


@router.get(gateway_routes.APPLICATIONS_PATH, response_model=ApplicationProductListResponse)
async def list_applications(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    labels: str | None = Query(default=None),
    applications_environment: str | None = Query(
        default=None,
        alias=gateway_params.APPLICATIONS_ENVIRONMENT_QUERY,
    ),
    applications_status: str | None = Query(
        default=None,
        alias=gateway_params.APPLICATIONS_STATUS_QUERY,
    ),
    applications_pending_promotion: str | None = Query(
        default=None,
        alias=gateway_params.APPLICATIONS_PENDING_PROMOTION_QUERY,
    ),
    applications_q: str | None = Query(
        default=None,
        alias=gateway_params.APPLICATIONS_SEARCH_QUERY,
    ),
    limit: int = Query(
        default=gateway_limits.APPLICATION_LIST_DEFAULT_LIMIT,
        ge=1,
        le=gateway_limits.APPLICATION_LIST_MAX_LIMIT,
    ),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationProductListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    filters = _parse_product_filters(
        clusters=clusters,
        namespaces=namespaces,
        applications=applications,
        labels=labels,
        environments=applications_environment,
        statuses=applications_status,
        pending_promotion=applications_pending_promotion,
        query=applications_q,
    )
    allowed_cluster_ids, allowed_application_ids = await _product_scope(
        db,
        current,
        workspace_id,
    )
    _require_product_filter_scope(
        filters,
        allowed_cluster_ids=allowed_cluster_ids,
        allowed_application_ids=allowed_application_ids,
    )
    if filters.labels:
        raise HTTPException(status_code=503, detail=APPLICATION_LABEL_PROJECTION_UNAVAILABLE)
    filtered = await asyncio.to_thread(
        db.list_filtered_applications,
        workspace_id=workspace_id,
        allowed_cluster_ids=allowed_cluster_ids,
        allowed_application_ids=allowed_application_ids,
        filters=filters,
        position=None,
        limit=limit,
    )
    filtered_ids = [str(item.get("application_id") or "") for item in filtered.get("items", [])]
    raw_applications = await to_thread_db_retry(
        db.list_applications,
        workspace_id,
        application_ids=set(filtered_ids),
        limit=limit,
    )
    by_id = {str(item.get("application_id") or ""): item for item in raw_applications}
    states = await to_thread_db_retry(
        db.get_application_catalog_states,
        workspace_id=workspace_id,
        application_ids=filtered_ids,
        allowed_cluster_ids=allowed_cluster_ids,
    )
    cards = []
    for application_id in filtered_ids:
        application = by_id.get(application_id)
        if application is None:
            continue
        state = states.get(application_id, {})
        cards.append(application_card(application, **state))
    cards.sort(key=_application_problem_sort)
    return ApplicationProductListResponse(applications=cards)


@router.post(gateway_routes.APPLICATIONS_PATH, response_model=ApplicationResponse)
async def upsert_application(
    payload: ApplicationUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationResponse:
    if payload.repository_id != "":
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=EXPLICIT_REPOSITORY_ID_NOT_ALLOWED,
        )
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {
        **payload.model_dump(),
        "workspace_id": workspace_id,
        "user_id": current.user_id,
    }
    with unit_of_work_or_null(db):
        if payload.repo_ref:
            try:
                normalized_repo_ref = normalize_github_repo_ref(payload.repo_ref)
            except RepositoryDiscoveryError as exc:
                raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            body["repo_ref"] = normalized_repo_ref
            lock_repository_identity_if_supported(db, workspace_id, normalized_repo_ref)
            existing_repository = require_repository_manage_if_registered(
                db,
                current,
                workspace_id,
                normalized_repo_ref,
            )
            if existing_repository is None and not is_service_admin_session(current):
                raise HTTPException(
                    status_code=403,
                    detail="new repositories must be registered through validated connect",
                )
            repository_id = str(
                (existing_repository or {}).get("repository_id")
                or derive_repository_id(
                    {"workspace_id": workspace_id, "repo_ref": normalized_repo_ref}
                )
            )
            stored_credential = authorized_stored_repo_credential_ref(
                db,
                current,
                workspace_id,
                repository_id,
                existing_repository,
            )
            if stored_credential is not None:
                body["credential_ref"] = stored_credential
            elif existing_repository is not None and existing_repository.get("credential_ref"):
                body["credential_ref"] = existing_repository["credential_ref"]
            elif existing_repository is None:
                body["credential_ref"] = PUBLIC_GITHUB_CREDENTIAL_REF
            repository = register_repository_or_404(db, body)
            body["repository_id"] = repository["repository_id"]
        require_application_manage_if_registered(db, current, workspace_id, body)
        stored = upsert_application_or_404(db, body)
    application = db.get_application(workspace_id, stored["application_id"]) or stored
    return ApplicationResponse(application=application)


@router.post(gateway_routes.APPLICATION_CONNECT_PATH, response_model=ApplicationResponse)
async def connect_application(
    payload: ApplicationConnectRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    discovery: RepositoryDiscoveryService = Depends(repository_discovery_service),
) -> ApplicationResponse:
    """Repo scan 결과를 서버에서 재검증한 뒤 app + watch + binding 을 원자 등록."""
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_deployment_target_cluster(db, workspace_id, payload.cluster_id)
    require_cluster_access(
        db,
        current,
        workspace_id,
        payload.cluster_id,
        Permission.DEPLOY_RUN.value,
    )
    require_connected_clusters(db, workspace_id, [payload.cluster_id])
    try:
        normalized_repo_ref = normalize_github_repo_ref(payload.repo_ref)
    except RepositoryDiscoveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    preflight_repository = require_repository_manage_if_registered(
        db,
        current,
        workspace_id,
        normalized_repo_ref,
    )
    preflight_repository_id = str(
        (preflight_repository or {}).get("repository_id")
        or derive_repository_id({"workspace_id": workspace_id, "repo_ref": normalized_repo_ref})
    )
    preflight_stored_ref = authorized_stored_repo_credential_ref(
        db,
        current,
        workspace_id,
        preflight_repository_id,
        preflight_repository,
    )
    validation_credential_ref = preflight_stored_ref or str(
        (preflight_repository or {}).get("credential_ref") or ""
    )
    validation_token = payload.token or database_credential_token(
        db,
        workspace_id,
        validation_credential_ref,
    )
    validation_discovery = discovery_with_token(discovery, validation_token)
    validation_request = RepositoryManifestValidationRequest(
        repo_ref=normalized_repo_ref,
        branch=payload.branch,
        manifest_path=payload.manifest_path,
        source_type=payload.source_type,
    )
    try:
        revision = await validation_discovery.resolve_branch_revision(
            normalized_repo_ref,
            payload.branch,
        )
        validation_batch = await validation_discovery.validate_manifests_at_revision(
            (validation_request,),
            expected_revision=revision,
        )
    except RepositoryDiscoveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if validation_batch.revision != revision:
        raise HTTPException(status_code=409, detail="repository revision changed during validation")
    if len(validation_batch.validations) != 1:
        raise HTTPException(status_code=422, detail=MANIFEST_VALIDATION_FAILED)
    validation = validation_batch.validations[0]
    if not validation.valid:
        detail = validation.errors[0] if validation.errors else MANIFEST_VALIDATION_FAILED
        raise HTTPException(status_code=422, detail=detail)
    try:
        validated_manifest_resources(validation)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    try:
        validated_repo_ref = normalize_github_repo_ref(validation.repo_ref)
    except (RepositoryDiscoveryError, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail="validated repository identity is invalid"
        ) from exc
    if validated_repo_ref != normalized_repo_ref:
        raise HTTPException(status_code=422, detail="validated repository identity changed")

    try:
        source_type = normalize_source_type(payload.source_type) or source_type_from_path(
            validation.manifest_path
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    metadata = {
        **payload.metadata,
        "branch": validation.branch,
        "source_type": source_type,
        "validation_mode": validation.validation_mode,
        "validated_resource_count": validation.resource_count,
        "validation_warnings": validation.warnings,
        "repository_revision": revision,
    }
    deploy_policy = {
        **payload.deploy_policy,
        "manifest_source": source_type,
        "validation_mode": validation.validation_mode,
    }
    settings = {"source_type": source_type}
    body = {
        "workspace_id": workspace_id,
        "user_id": current.user_id,
        "name": payload.name,
        "repo_ref": normalized_repo_ref,
        "default_branch": validation.branch,
        "branch": validation.branch,
        "manifest_path": validation.manifest_path,
        "metadata": metadata,
        "cluster_id": payload.cluster_id,
        "namespace": payload.namespace,
        "environment": payload.environment,
        "deploy_policy": deploy_policy,
        "settings": settings,
        "access_policy": payload.access_policy,
    }
    with unit_of_work_or_null(db):
        lock_repository_identity_if_supported(db, workspace_id, normalized_repo_ref)
        existing_repository = require_repository_manage_if_registered(
            db,
            current,
            workspace_id,
            normalized_repo_ref,
        )
        repository_id = str(
            (existing_repository or {}).get("repository_id")
            or derive_repository_id({"workspace_id": workspace_id, "repo_ref": normalized_repo_ref})
        )
        lock_repository_credential_if_supported(db, workspace_id, repository_id)
        stored_credential = authorized_stored_repo_credential_ref(
            db,
            current,
            workspace_id,
            repository_id,
            existing_repository,
        )
        credential = store_repo_token_if_present(
            db,
            workspace_id,
            repository_id,
            payload.token,
        )
        if credential is not None:
            body["credential_ref"] = credential
        elif stored_credential:
            body["credential_ref"] = stored_credential
        elif existing_repository is not None and existing_repository.get("credential_ref"):
            body["credential_ref"] = existing_repository["credential_ref"]
        else:
            body["credential_ref"] = PUBLIC_GITHUB_CREDENTIAL_REF
        # GitHub App 원클릭 연결이면 설치 참조가 최우선(PAT/public 대체). 폴러가
        # 이 참조로 단명 설치 토큰을 발급한다. App 흐름은 토큰을 보내지 않는다.
        if payload.installation_id and payload.installation_id.strip():
            body["credential_ref"] = make_app_installation_ref(payload.installation_id.strip())
        repository = register_repository_or_404(db, body)
        body["repository_id"] = repository["repository_id"]
        require_application_manage_if_registered(db, current, workspace_id, body)
        stored = upsert_application_or_404(db, body)
        application_id = str(stored["application_id"])
        application = db.get_application(workspace_id, application_id) or stored
        binding_body = {
            **body,
            "application_id": application_id,
            "repository_id": application["repository_id"],
            "app_name": application["name"],
        }
        watch_target = db.register_watch_target(binding_body)
        binding = db.register_deployment_binding(binding_body)
        persist_repository_connect_validation(
            db,
            workspace_id=workspace_id,
            repo_ref=normalized_repo_ref,
            branch=validation.branch,
            revision=revision,
            source_type=source_type,
            validation=validation,
            application=application,
            watch_target=watch_target,
            binding=binding,
        )
    return ApplicationResponse(application=application)


@router.get(gateway_routes.APPLICATION_PATH, response_model=ApplicationProductDetailResponse)
async def get_application(
    application_id: str,
    instance_id: Annotated[
        str | None,
        Query(alias="instance", min_length=1, max_length=200),
    ] = None,
    workload_key: Annotated[
        str | None,
        Query(alias="workload", min_length=1, max_length=128),
    ] = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationProductDetailResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.APPLICATION_READ.value,
    )
    application = get_application_or_404(db, workspace_id, application_id)
    allowed_cluster_ids = await _allowed_product_cluster_ids(db, current, workspace_id)
    state = await _product_state(
        db,
        workspace_id=workspace_id,
        application=application,
        allowed_cluster_ids=allowed_cluster_ids,
        requested_instance_id=instance_id,
        requested_workload_key=workload_key,
        select_instance=True,
    )
    return ApplicationProductDetailResponse(application=application_detail(application, **state))


@router.get(
    gateway_routes.APPLICATION_DRIFT_PATH,
    response_model=ApplicationDriftResponse,
)
async def get_application_drift(
    application_id: str,
    instance_id: Annotated[
        str | None,
        Query(alias="instance", min_length=1, max_length=200),
    ] = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationDriftResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.APPLICATION_READ.value,
    )
    allowed_cluster_ids = await _allowed_product_cluster_ids(db, current, workspace_id)
    application = get_application_or_404(db, workspace_id, application_id)
    selected_binding = None
    if instance_id is not None:
        _bindings, _scope, selected_binding = await _detail_scope_state(
            db,
            workspace_id=workspace_id,
            application=application,
            allowed_cluster_ids=allowed_cluster_ids,
            requested_instance_id=instance_id,
        )
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=gateway_limits.APPLICATION_WORKFLOW_RUN_DEFAULT_LIMIT,
    )
    return ApplicationDriftResponse.model_validate(
        drift_projection(_runs_for_instance(runs, selected_binding))
    )


@router.get(
    gateway_routes.APPLICATION_DEPLOYMENTS_PATH,
    response_model=ApplicationDeploymentHistoryResponse,
)
async def list_application_deployments(
    application_id: str,
    limit: int = Query(
        default=gateway_limits.APPLICATION_DEPLOYMENT_DEFAULT_LIMIT,
        ge=1,
        le=gateway_limits.APPLICATION_DEPLOYMENT_MAX_LIMIT,
    ),
    instance_id: Annotated[
        str | None,
        Query(alias="instance", min_length=1, max_length=200),
    ] = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationDeploymentHistoryResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.DEPLOYMENT_READ.value,
    )
    application = get_application_or_404(db, workspace_id, application_id)
    allowed_cluster_ids = await _allowed_product_cluster_ids(db, current, workspace_id)
    selected_binding = None
    if instance_id is not None:
        _bindings, _scope, selected_binding = await _detail_scope_state(
            db,
            workspace_id=workspace_id,
            application=application,
            allowed_cluster_ids=allowed_cluster_ids,
            requested_instance_id=instance_id,
        )
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=limit,
    )
    return ApplicationDeploymentHistoryResponse(
        deployments=deployment_history_projection(_runs_for_instance(runs, selected_binding))
    )


@router.post(
    gateway_routes.APPLICATION_DEPLOYMENTS_PATH,
    response_model=DeploymentBindingResponse,
)
async def upsert_application_deployment(
    application_id: str,
    payload: DeploymentBindingUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> DeploymentBindingResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.APPLICATION_MANAGE.value,
    )
    if payload.cluster_id != GLOBAL_CLUSTER_SELECTOR:
        require_deployment_target_cluster(db, workspace_id, payload.cluster_id)
        require_cluster_access(
            db,
            current,
            workspace_id,
            payload.cluster_id,
            Permission.DEPLOY_RUN.value,
        )
    application = get_application_or_404(db, workspace_id, application_id)
    body = {
        **payload.model_dump(),
        "workspace_id": workspace_id,
        "user_id": current.user_id,
        "repository_id": application["repository_id"],
        "app_name": application["name"],
        "branch": application.get("default_branch") or DEFAULT_REPO_BRANCH,
        "manifest_path": payload.manifest_path or application["manifest_path"],
    }
    # 글로벌 서비스 — cluster_id "*" 는 등록된 모든 클러스터로 확장 생성한다.
    # 각 바인딩에 deploy_policy.global 이 남아 (a) 웹훅 fan-out 대상이 되고
    # (b) 신규 클러스터 등록 시 workflow-controller 가 자동으로 합류시킨다.
    if payload.cluster_id == GLOBAL_CLUSTER_SELECTOR:
        clusters = [
            cluster
            for cluster in db.list_cluster_registrations(workspace_id)
            if not is_management_registration(cluster)
        ]
        if not clusters:
            raise HTTPException(status_code=422, detail=NO_CLUSTERS_FOR_GLOBAL_BINDING)
        # 전 대상 클러스터 deploy 권한을 먼저 검증 — 하나라도 없으면 아무것도 만들지 않음.
        for cluster in clusters:
            require_cluster_access(
                db,
                current,
                workspace_id,
                str(cluster["cluster_id"]),
                Permission.DEPLOY_RUN.value,
            )
        require_connected_clusters(
            db,
            workspace_id,
            [str(cluster["cluster_id"]) for cluster in clusters],
        )
        stored_list = []
        for cluster in clusters:
            cluster_body = {
                **body,
                "cluster_id": str(cluster["cluster_id"]),
                "deploy_policy": {**payload.deploy_policy, GLOBAL_BINDING_KEY: True},
            }
            db.register_watch_target(cluster_body)
            stored_list.append(db.register_deployment_binding(cluster_body))
        return DeploymentBindingResponse(deployment=stored_list[0])
    require_connected_clusters(db, workspace_id, [payload.cluster_id])
    db.register_watch_target(body)
    stored = db.register_deployment_binding(body)
    return DeploymentBindingResponse(deployment=stored)


@router.get(gateway_routes.APPLICATION_RUNS_PATH, response_model=WorkflowRunListResponse)
async def list_application_runs(
    application_id: str,
    limit: int = Query(
        default=gateway_limits.APPLICATION_WORKFLOW_RUN_DEFAULT_LIMIT,
        ge=1,
        le=gateway_limits.APPLICATION_WORKFLOW_RUN_MAX_LIMIT,
    ),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> WorkflowRunListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.DEPLOYMENT_READ.value,
    )
    runs = db.list_application_workflow_runs(workspace_id, application_id, limit=limit)
    return WorkflowRunListResponse(runs=runs)
