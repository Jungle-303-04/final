"""애플리케이션·deployment binding API 라우트"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.gitops.repository_discovery import (
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    normalize_source_type,
    source_type_from_path,
)
from domains.identity.dependencies import (
    require_cluster_access,
    require_resource_access,
    require_session,
)
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ApplicationConnectRequest,
    ApplicationUpsertRequest,
    DeploymentBindingUpsertRequest,
    RepositoryManifestValidationRequest,
)
from packages.contracts.gateway.responses import (
    ApplicationListResponse,
    ApplicationResponse,
    DeploymentBindingListResponse,
    DeploymentBindingResponse,
    WorkflowRunListResponse,
)
from packages.contracts.gitops import DEFAULT_REPO_BRANCH
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
)
from packages.runtime.dependencies import get_db
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()
# 글로벌 서비스 선언 — cluster_id 자리에 쓰는 특수값(등록된 전 클러스터로 확장).
GLOBAL_CLUSTER_SELECTOR = "*"
GLOBAL_BINDING_KEY = "global"
NO_CLUSTERS_FOR_GLOBAL_BINDING = "no registered clusters to expand global binding"
HTTP_NOT_FOUND = 404
APPLICATION_NOT_FOUND = "application not found"
MANIFEST_VALIDATION_FAILED = "manifest validation failed"


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


@router.get(gateway_routes.APPLICATIONS_PATH, response_model=ApplicationListResponse)
async def list_applications(
    limit: int = Query(default=100, ge=1, le=500),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    accessible_ids = db.accessible_resource_ids(
        current.user_id,
        workspace_id,
        AccessResourceType.APPLICATION.value,
        Permission.APPLICATION_READ.value,
    )
    applications = db.list_applications(workspace_id, application_ids=accessible_ids, limit=limit)
    return ApplicationListResponse(applications=applications)


@router.post(gateway_routes.APPLICATIONS_PATH, response_model=ApplicationResponse)
async def upsert_application(
    payload: ApplicationUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {
        **payload.model_dump(),
        "workspace_id": workspace_id,
        "user_id": current.user_id,
    }
    with unit_of_work_or_null(db):
        if payload.repo_ref:
            db.register_repository(body)
        stored = db.upsert_application(body)
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
    require_cluster_access(
        db,
        current,
        workspace_id,
        payload.cluster_id,
        Permission.DEPLOY_RUN.value,
    )
    try:
        validation = await discovery.validate_manifest(
            RepositoryManifestValidationRequest(
                repo_ref=payload.repo_ref,
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
        "repo_ref": validation.repo_ref,
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
        db.register_repository(body)
        stored = db.upsert_application(body)
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


@router.get(gateway_routes.APPLICATION_PATH, response_model=ApplicationResponse)
async def get_application(
    application_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ApplicationResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.APPLICATION_READ.value,
    )
    return ApplicationResponse(application=get_application_or_404(db, workspace_id, application_id))


@router.get(
    gateway_routes.APPLICATION_DEPLOYMENTS_PATH,
    response_model=DeploymentBindingListResponse,
)
async def list_application_deployments(
    application_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> DeploymentBindingListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_application_access(
        db,
        current,
        workspace_id,
        application_id,
        Permission.DEPLOYMENT_READ.value,
    )
    deployments = db.list_application_deployment_bindings(
        workspace_id,
        application_id,
        limit=limit,
    )
    return DeploymentBindingListResponse(deployments=deployments)


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
        clusters = db.list_cluster_registrations(workspace_id)
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
