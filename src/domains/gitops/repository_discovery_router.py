"""Session-protected repository discovery endpoints for registration UX."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.gitops.repository import derive_repository_id, repository_credential_scope
from domains.gitops.repository_discovery import (
    GitHubRepositoryClient,
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    normalize_github_repo_ref,
)
from domains.identity.dependencies import require_admin_session, require_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    RepositoryManifestValidationRequest,
    RepositoryProbeRequest,
    RepoValidateRequest,
)
from packages.contracts.gateway.responses import (
    RepoManifestFileListResponse,
    RepositoryBranchListResponse,
    RepositoryManifestCandidateListResponse,
    RepositoryManifestValidationResponse,
    RepositoryProbeResponse,
    RepoValidateResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.runtime.dependencies import get_db
from packages.security.credentials import (
    CredentialEncryptionError,
    credential_ref,
    decrypt_credential,
    encrypt_credential,
)
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()


def discovery_service() -> RepositoryDiscoveryService:
    # Session-scoped discovery must never borrow the process-wide GitHub token.
    return RepositoryDiscoveryService(GitHubRepositoryClient(token=""))


def wizard_discovery_service(
    db: Any,
    current: Any,
    repo_ref: str,
    fallback: RepositoryDiscoveryService,
) -> RepositoryDiscoveryService:
    """Reuse only the admin wizard credential scoped to this repository."""
    normalized = normalize_github_repo_ref(repo_ref)
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    get_repository = getattr(db, "get_repository_by_ref", None)
    existing_repository = (
        get_repository(workspace_id, normalized) if callable(get_repository) else None
    )
    repository_id = str(
        (existing_repository or {}).get("repository_id")
        or derive_repository_id({"workspace_id": workspace_id, "repo_ref": normalized})
    )
    scope = repository_credential_scope(repository_id)
    get_credential = getattr(db, "get_workspace_credential", None)
    stored = get_credential(workspace_id, "github", scope) if callable(get_credential) else None
    if stored is None:
        return fallback
    try:
        if (
            str(stored.get("workspace_id") or "") != workspace_id
            or str(stored.get("provider") or "") != "github"
            or str(stored.get("scope") or "") != scope
        ):
            raise CredentialEncryptionError("credential scope mismatch")
        token = decrypt_credential(str(stored.get("encrypted_value") or ""))
    except CredentialEncryptionError as exc:
        raise RepositoryDiscoveryError(422, "credential_unavailable") from exc
    return RepositoryDiscoveryService(
        GitHubRepositoryClient(token=token),
        render_executor=fallback.render_executor,
    )


def discovery_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, RepositoryDiscoveryError):
        return HTTPException(status_code=exc.status_code, detail=exc.detail)
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    return HTTPException(status_code=502, detail="repository discovery failed")


def wizard_http_error(code: str, detail: str, status_code: int = 422) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "detail": detail})


def repo_validate_failure(normalized: str, code: str, detail: str) -> RepoValidateResponse:
    return RepoValidateResponse(
        accessible=False,
        normalized=normalized,
        code=code,
        reason=detail,
    )


def store_github_token(
    db: Any,
    workspace_id: str,
    repository_id: str,
    token: str,
) -> str:
    encrypted = encrypt_credential(token)
    scope = repository_credential_scope(repository_id)
    ref = credential_ref("github", scope)
    with unit_of_work_or_null(db):
        locker = getattr(db, "lock_workspace_credential_scope", None)
        if callable(locker):
            locker(workspace_id, "github", scope)
        if hasattr(db, "upsert_workspace_credential"):
            db.upsert_workspace_credential(
                {
                    "workspace_id": workspace_id,
                    "provider": "github",
                    "scope": scope,
                    "encrypted_value": encrypted,
                    "metadata": {"credential_ref": ref, "repository_id": repository_id},
                }
            )
    return ref


@router.post(gateway_routes.REPOS_VALIDATE_PATH, response_model=RepoValidateResponse)
async def validate_repo_for_wizard(
    payload: RepoValidateRequest,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> RepoValidateResponse:
    try:
        normalized = normalize_github_repo_ref(payload.url)
    except RepositoryDiscoveryError as exc:
        return repo_validate_failure("", str(exc.detail), "GitHub 저장소만 지원합니다.")
    except ValueError as exc:
        return repo_validate_failure("", "invalid_repo", str(exc))

    service = RepositoryDiscoveryService(GitHubRepositoryClient(token=payload.token))
    probe = await service.probe_repository(RepositoryProbeRequest(repo_ref=normalized))
    if not probe.reachable:
        code = "token_required" if not payload.token else "not_accessible"
        detail = (
            "토큰이 필요하거나 접근 권한이 없습니다."
            if not payload.token
            else "저장소에 접근할 수 없습니다."
        )
        return repo_validate_failure(normalized, code, detail)

    credential = None
    if payload.token:
        workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
        get_repository = getattr(db, "get_repository_by_ref", None)
        existing_repository = (
            get_repository(workspace_id, normalized) if callable(get_repository) else None
        )
        repository_id = str(
            (existing_repository or {}).get("repository_id")
            or derive_repository_id({"workspace_id": workspace_id, "repo_ref": normalized})
        )
        try:
            credential = store_github_token(db, workspace_id, repository_id, payload.token)
        except CredentialEncryptionError as exc:
            return repo_validate_failure(normalized, "credential_store_failed", str(exc))

    return RepoValidateResponse(
        accessible=True,
        private=probe.private,
        default_branch=probe.default_branch,
        normalized=normalized,
        credential_ref=credential,
    )


@router.get(gateway_routes.REPOS_BRANCHES_PATH, response_model=RepositoryBranchListResponse)
async def list_repo_branches_for_wizard(
    repo: str = Query(min_length=1, max_length=240),
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepositoryBranchListResponse:
    try:
        normalized = normalize_github_repo_ref(repo)
        scoped_service = wizard_discovery_service(db, current, normalized, service)
        return await scoped_service.list_branches(normalized)
    except RepositoryDiscoveryError as exc:
        raise wizard_http_error(
            str(exc.detail), "브랜치 목록을 가져올 수 없습니다.", exc.status_code
        ) from exc
    except ValueError as exc:
        raise wizard_http_error("invalid_repo", str(exc)) from exc


@router.get(gateway_routes.REPOS_MANIFESTS_PATH, response_model=RepoManifestFileListResponse)
async def list_repo_manifests_for_wizard(
    repo: str = Query(min_length=1, max_length=240),
    branch: str = Query(default="main", min_length=1, max_length=200),
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
    service: RepositoryDiscoveryService = Depends(discovery_service),
) -> RepoManifestFileListResponse:
    try:
        normalized = normalize_github_repo_ref(repo)
        scoped_service = wizard_discovery_service(db, current, normalized, service)
        return await scoped_service.list_attachable_manifest_files(normalized, branch)
    except RepositoryDiscoveryError as exc:
        raise wizard_http_error(
            str(exc.detail), "매니페스트 목록을 가져올 수 없습니다.", exc.status_code
        ) from exc
    except ValueError as exc:
        raise wizard_http_error("invalid_repo", str(exc)) from exc


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
