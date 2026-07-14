"""애플리케이션·deployment binding API 라우트"""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.application_filter.query import ApplicationFilters, parse_application_filters
from domains.applications.product_projection import (
    application_card,
    application_detail,
    deployment_history_projection,
    drift_projection,
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
    resolve_allowed_cluster_ids,
)
from domains.target.management_guard import (
    is_management_registration,
    management_readonly_detail,
)
from domains.target.router import cluster_connection_status
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ApplicationConnectRequest,
    ApplicationUpsertRequest,
    DeploymentBindingUpsertRequest,
    RepositoryManifestValidationRequest,
)
from packages.contracts.gateway.responses import (
    ApplicationDeploymentHistoryResponse,
    ApplicationDriftResponse,
    ApplicationProductDetailResponse,
    ApplicationProductListResponse,
    ApplicationResponse,
    DeploymentBindingResponse,
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
        db.accessible_resource_ids,
        current.user_id,
        workspace_id,
        AccessResourceType.APPLICATION.value,
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


async def _product_state(
    db: Any,
    *,
    workspace_id: str,
    application: Mapping[str, Any],
    allowed_cluster_ids: set[str],
) -> dict[str, Any]:
    application_id = str(application.get("application_id") or "")
    raw_bindings = await asyncio.to_thread(
        db.list_application_deployment_bindings,
        workspace_id,
        application_id,
        limit=500,
    )
    bindings = [
        dict(binding)
        for binding in raw_bindings
        if str(binding.get("cluster_id") or "") in allowed_cluster_ids
    ]
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=100,
    )
    bound_cluster_ids = {
        str(binding.get("cluster_id") or "")
        for binding in bindings
        if str(binding.get("cluster_id") or "")
    }
    evidence_cluster_ids = bound_cluster_ids or allowed_cluster_ids
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
    return {
        "bindings": bindings,
        "runs": runs,
        "inventory_rows": inventory_rows,
        "inventory_context": inventory_context,
        "incident_evidence": incident_evidence,
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


@router.get(gateway_routes.APPLICATIONS_PATH, response_model=ApplicationProductListResponse)
async def list_applications(
    clusters: str | None = Query(default=None),
    namespaces: str | None = Query(default=None),
    applications: str | None = Query(default=None),
    labels: str | None = Query(default=None),
    applications_environment: str | None = Query(
        default=None,
        alias="applications.environment",
    ),
    applications_status: str | None = Query(default=None, alias="applications.status"),
    applications_pending_promotion: str | None = Query(
        default=None,
        alias="applications.pendingPromotion",
    ),
    applications_q: str | None = Query(default=None, alias="applications.q"),
    limit: int = Query(default=100, ge=1, le=200),
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
    cards = []
    for application_id in filtered_ids:
        application = by_id.get(application_id)
        if application is None:
            continue
        state = await _product_state(
            db,
            workspace_id=workspace_id,
            application=application,
            allowed_cluster_ids=allowed_cluster_ids,
        )
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
    try:
        validation = await validation_discovery.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref=normalized_repo_ref,
                branch=payload.branch,
                manifest_path=payload.manifest_path,
                source_type=payload.source_type,
            )
        )
    except RepositoryDiscoveryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not validation.valid:
        detail = validation.errors[0] if validation.errors else MANIFEST_VALIDATION_FAILED
        raise HTTPException(status_code=422, detail=detail)
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
        db.register_watch_target(binding_body)
        db.register_deployment_binding(binding_body)
    return ApplicationResponse(application=application)


@router.get(gateway_routes.APPLICATION_PATH, response_model=ApplicationProductDetailResponse)
async def get_application(
    application_id: str,
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
    )
    return ApplicationProductDetailResponse(application=application_detail(application, **state))


@router.get(
    gateway_routes.APPLICATION_DRIFT_PATH,
    response_model=ApplicationDriftResponse,
)
async def get_application_drift(
    application_id: str,
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
    get_application_or_404(db, workspace_id, application_id)
    allowed_cluster_ids = await _allowed_product_cluster_ids(db, current, workspace_id)
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=100,
    )
    return ApplicationDriftResponse.model_validate(drift_projection(runs))


@router.get(
    gateway_routes.APPLICATION_DEPLOYMENTS_PATH,
    response_model=ApplicationDeploymentHistoryResponse,
)
async def list_application_deployments(
    application_id: str,
    limit: int = Query(default=100, ge=1, le=500),
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
    get_application_or_404(db, workspace_id, application_id)
    allowed_cluster_ids = await _allowed_product_cluster_ids(db, current, workspace_id)
    runs = await _visible_application_runs(
        db,
        workspace_id=workspace_id,
        application_id=application_id,
        allowed_cluster_ids=allowed_cluster_ids,
        limit=limit,
    )
    return ApplicationDeploymentHistoryResponse(deployments=deployment_history_projection(runs))


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
    limit: int = Query(default=100, ge=1, le=500),
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
