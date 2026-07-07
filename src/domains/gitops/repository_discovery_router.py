"""Session-protected repository discovery endpoints for registration UX."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.gitops.repository_discovery import (
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
)
from domains.identity.dependencies import require_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
)
from packages.contracts.gateway.responses import (
    RepositoryBranchListResponse,
    RepositoryManifestCandidateListResponse,
    RepositoryManifestValidationResponse,
    RepositoryProbeResponse,
)

router = APIRouter()


def discovery_service() -> RepositoryDiscoveryService:
    return RepositoryDiscoveryService()


def discovery_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, RepositoryDiscoveryError):
        return HTTPException(status_code=exc.status_code, detail=exc.detail)
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=502, detail="repository discovery failed")


@router.post(
    gateway_routes.REPOSITORY_DISCOVERY_PROBE_PATH,
    response_model=RepositoryProbeResponse,
)
async def probe_repository(
    payload: RepositoryProbeRequest,
    _current: Any = Depends(require_session),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepositoryProbeResponse:
    return await service.probe_repository(payload)


@router.get(
    gateway_routes.REPOSITORY_DISCOVERY_BRANCHES_PATH,
    response_model=RepositoryBranchListResponse,
)
async def list_repository_branches(
    repo_ref: str = Query(min_length=1, max_length=240),
    _current: Any = Depends(require_session),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepositoryBranchListResponse:
    try:
        return await service.list_branches(repo_ref)
    except (RepositoryDiscoveryError, ValueError) as exc:
        raise discovery_http_error(exc) from exc


@router.get(
    gateway_routes.REPOSITORY_DISCOVERY_MANIFESTS_PATH,
    response_model=RepositoryManifestCandidateListResponse,
)
async def list_repository_manifest_candidates(
    repo_ref: str = Query(min_length=1, max_length=240),
    branch: str = Query(default="main", min_length=1, max_length=200),
    _current: Any = Depends(require_session),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepositoryManifestCandidateListResponse:
    try:
        return await service.list_manifest_candidates(repo_ref, branch)
    except (RepositoryDiscoveryError, ValueError) as exc:
        raise discovery_http_error(exc) from exc


@router.post(
    gateway_routes.REPOSITORY_DISCOVERY_VALIDATE_PATH,
    response_model=RepositoryManifestValidationResponse,
)
async def validate_repository_manifest(
    payload: RepositoryManifestValidationRequest,
    _current: Any = Depends(require_session),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepositoryManifestValidationResponse:
    try:
        return await service.validate_manifest(payload)
    except (RepositoryDiscoveryError, ValueError) as exc:
        raise discovery_http_error(exc) from exc
