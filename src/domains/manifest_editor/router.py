"""Resource-detail YAML editor backed exclusively by the Safe PR GitOps writer."""

from __future__ import annotations

import hashlib
from dataclasses import asdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.gitops.repository_discovery import (
    RepositoryDiscoveryError,
    RepositoryDiscoveryService,
    source_type_from_path,
)
from domains.gitops.repository_discovery_router import (
    discovery_http_error,
    discovery_service,
    wizard_discovery_service,
)
from domains.identity.dependencies import (
    require_cluster_access,
    require_resource_access,
    require_session,
)
from domains.manifest_editor.validation import (
    ManifestIdentity,
    manifest_sha256,
    validate_manifest_edit,
    validate_manifest_source,
)
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ResourceManifestApproveRequest,
    ResourceManifestPreviewRequest,
)
from packages.contracts.gateway.responses import (
    ResourceManifestApproveResponse,
    ResourceManifestPreviewResponse,
    ResourceManifestSourceChoice,
    ResourceManifestSourceResponse,
)
from packages.contracts.gitops import ApprovalStatus
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
    ResourceRole,
)
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()
SAFE_PR_MANIFEST_EDIT_KIND = "safe_pr_manifest_edit"
UNSUPPORTED_SOURCE = "Only a single raw YAML GitHub source can be edited safely."
STALE_SOURCE = "The Git source changed after it was loaded. Reload before approving."
SOURCE_NOT_FOUND = "No exact GitOps source binding was found for this live resource."


@router.get(
    gateway_routes.RESOURCE_MANIFEST_SOURCE_PATH,
    response_model=ResourceManifestSourceResponse,
)
async def get_resource_manifest_source(
    resource_id: str,
    application_id: str | None = Query(default=None, max_length=200),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    fallback_service: RepositoryDiscoveryService = Depends(discovery_service),
) -> ResourceManifestSourceResponse:
    context = resource_context(db, current, resource_id, write=False)
    sources = authorized_sources(db, current, context, application_id=application_id)
    choices = [source_choice(source) for source in sources]
    if not sources:
        return ResourceManifestSourceResponse(
            resource_id=resource_id,
            status="unsupported",
            choices=[],
            reason=SOURCE_NOT_FOUND,
        )
    if application_id is None and len(sources) > 1:
        return ResourceManifestSourceResponse(
            resource_id=resource_id,
            status="ambiguous",
            choices=choices,
            reason="Choose the application source that owns this resource.",
        )
    source = sources[0]
    if not editable_source(source):
        return ResourceManifestSourceResponse(
            resource_id=resource_id,
            status="unsupported",
            choices=choices,
            selected=source_choice(source),
            reason=UNSUPPORTED_SOURCE,
        )
    base_sha, content = await read_pinned_source(db, current, source, fallback_service)
    safety_errors = validate_manifest_source(
        content,
        selected_identity=context["identity"],
    )
    if safety_errors:
        return ResourceManifestSourceResponse(
            resource_id=resource_id,
            status="unsupported",
            choices=choices,
            selected=source_choice(source),
            reason=safety_errors[0],
        )
    return ResourceManifestSourceResponse(
        resource_id=resource_id,
        status="available",
        choices=choices,
        selected=source_choice(source),
        base_sha=base_sha,
        source_sha256=manifest_sha256(content),
        content=content,
    )


@router.post(
    gateway_routes.RESOURCE_MANIFEST_PREVIEW_PATH,
    response_model=ResourceManifestPreviewResponse,
)
async def preview_resource_manifest_edit(
    resource_id: str,
    payload: ResourceManifestPreviewRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    fallback_service: RepositoryDiscoveryService = Depends(discovery_service),
) -> ResourceManifestPreviewResponse:
    context = resource_context(db, current, resource_id, write=True)
    source = exact_source(db, current, context, payload.application_id)
    base_sha, content = await read_pinned_source(db, current, source, fallback_service)
    ensure_source_is_current(payload.base_sha, payload.source_sha256, base_sha, content)
    validation = validate_manifest_edit(
        content,
        payload.edited_yaml,
        selected_identity=context["identity"],
    )
    return ResourceManifestPreviewResponse(**asdict(validation), base_sha=base_sha)


@router.post(
    gateway_routes.RESOURCE_MANIFEST_APPROVE_PATH,
    response_model=ResourceManifestApproveResponse,
)
async def approve_resource_manifest_edit(
    resource_id: str,
    payload: ResourceManifestApproveRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
    fallback_service: RepositoryDiscoveryService = Depends(discovery_service),
) -> ResourceManifestApproveResponse:
    context = resource_context(db, current, resource_id, write=True)
    source = exact_source(db, current, context, payload.application_id)
    base_sha, content = await read_pinned_source(db, current, source, fallback_service)
    ensure_source_is_current(payload.base_sha, payload.source_sha256, base_sha, content)
    validation = validate_manifest_edit(
        content,
        payload.edited_yaml,
        selected_identity=context["identity"],
    )
    if not validation.valid:
        raise HTTPException(
            status_code=422,
            detail={"code": "manifest_invalid", "detail": validation.errors[0]},
        )
    workflow_run_id = edit_workflow_id(
        context["workspace_id"], resource_id, source, base_sha, validation.desired_sha256
    )
    approval_id = f"approval-{workflow_run_id.removeprefix('workflow-')}"
    patch = SafePrFilePatch(
        path=str(source["manifest_path"]),
        content=payload.edited_yaml,
        description=f"Approved YAML edit for {context['identity'].kind}/{context['identity'].name}",
    )
    patch_sha256 = safe_pr_patch_sha256([patch])
    approval_details = {
        "authority": SAFE_PR_MANIFEST_EDIT_KIND,
        "resource_id": resource_id,
        "repository_id": str(source["repository_id"]),
        "repo_ref": str(source["repo_ref"]),
        "branch": str(source["branch"]),
        "manifest_path": str(source["manifest_path"]),
        "base_sha": base_sha,
        "source_sha256": validation.source_sha256,
        "desired_sha256": validation.desired_sha256,
        "patch_sha256": patch_sha256,
        "decision_reason": payload.reason,
    }
    request = SafePrRequestedBody(
        title=f"Update {context['identity'].kind} {context['identity'].name}",
        body=(
            f"Human-approved Opsia manifest edit. Reason: {payload.reason}\n\n"
            "The cluster remains unchanged until this Safe PR is reviewed and merged."
        ),
        provider="github",
        patches=[patch],
        pr_kind=SAFE_PR_MANIFEST_EDIT_KIND,
        workspace_id=context["workspace_id"],
        repository_id=str(source["repository_id"]),
        binding_id=str(source["binding_id"]),
        application_id=str(source["application_id"]),
        workflow_run_id=workflow_run_id,
        environment=str(source["environment"]),
        manifest_path=str(source["manifest_path"]),
        repo_ref=str(source["repo_ref"]),
        base_branch=str(source["branch"]),
        commit_sha=base_sha,
        patch_sha256=patch_sha256,
        approval_ref=approval_id,
        policy_decision_ref=f"manifest-editor:{approval_id}:granted",
    )
    with unit_of_work_or_null(db):
        db.request_workflow_approval(
            {
                "approval_id": approval_id,
                "workflow_run_id": workflow_run_id,
                "workspace_id": context["workspace_id"],
                "application_id": source["application_id"],
                "binding_id": source["binding_id"],
                "environment": source["environment"],
                "status": ApprovalStatus.GRANTED.value,
                "reason": payload.reason,
                "requested_role": ResourceRole.RELEASE_OPERATOR.value,
                "requested_by": current.user_id,
                "decided_by": current.user_id,
                "decision": "granted",
                "details": approval_details,
            }
        )
        accepted = await events.accept_body(
            request,
            actor=Actor(current.user_id, tuple(current.roles)),
        )
    return ResourceManifestApproveResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        workflow_run_id=workflow_run_id,
        approval_id=approval_id,
    )


def resource_context(db: Any, current: Any, resource_id: str, *, write: bool) -> dict[str, Any]:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    resource = db.get_inventory_resource_by_key(
        workspace_id=workspace_id,
        inventory_key=resource_id,
    )
    if resource is None:
        raise HTTPException(status_code=404, detail="inventory resource not found")
    cluster_id = str(resource["cluster_id"])
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.INVENTORY_READ.value,
    )
    if write:
        require_cluster_access(
            db,
            current,
            workspace_id,
            cluster_id,
            Permission.DEPLOY_RUN.value,
        )
    return {
        "workspace_id": workspace_id,
        "cluster_id": cluster_id,
        "resource": resource,
        "identity": ManifestIdentity(
            api_version=str(resource["api_version"]),
            kind=str(resource["kind"]),
            namespace=(
                str(resource["namespace"]) if resource.get("namespace") is not None else None
            ),
            name=str(resource["name"]),
        ),
    }


def authorized_sources(
    db: Any,
    current: Any,
    context: dict[str, Any],
    *,
    application_id: str | None,
) -> list[dict[str, Any]]:
    rows = db.list_resource_manifest_sources(
        workspace_id=context["workspace_id"],
        resource_id=str(context["resource"]["inventory_key"]),
        cluster_id=context["cluster_id"],
    )
    sources: list[dict[str, Any]] = []
    for row in rows:
        source = dict(row)
        if application_id is not None and source.get("application_id") != application_id:
            continue
        try:
            require_resource_access(
                db,
                current,
                context["workspace_id"],
                AccessResourceType.APPLICATION.value,
                str(source["application_id"]),
                Permission.MANIFEST_READ.value,
            )
        except HTTPException as exc:
            if exc.status_code == 403:
                continue
            raise
        sources.append(source)
    return sources


def exact_source(
    db: Any,
    current: Any,
    context: dict[str, Any],
    application_id: str,
) -> dict[str, Any]:
    sources = authorized_sources(db, current, context, application_id=application_id)
    if len(sources) != 1:
        raise HTTPException(status_code=409, detail=SOURCE_NOT_FOUND)
    source = sources[0]
    require_resource_access(
        db,
        current,
        context["workspace_id"],
        AccessResourceType.APPLICATION.value,
        application_id,
        Permission.CONFIG_UPDATE.value,
    )
    if not editable_source(source):
        raise HTTPException(status_code=422, detail=UNSUPPORTED_SOURCE)
    return source


def editable_source(source: dict[str, Any]) -> bool:
    source_type = str(source.get("source_type") or "")
    inferred = source_type or source_type_from_path(str(source.get("manifest_path") or ""))
    return (
        str(source.get("provider") or "") == "github"
        and inferred == "raw-yaml"
        and str(source.get("manifest_path") or "").lower().endswith((".yaml", ".yml"))
    )


def source_choice(source: dict[str, Any]) -> ResourceManifestSourceChoice:
    return ResourceManifestSourceChoice(
        application_id=str(source["application_id"]),
        application_name=str(source["application_name"]),
        repository_ref=str(source["repo_ref"]),
        branch=str(source["branch"]),
        manifest_path=str(source["manifest_path"]),
        environment=str(source["environment"]),
    )


async def read_pinned_source(
    db: Any,
    current: Any,
    source: dict[str, Any],
    fallback: RepositoryDiscoveryService,
) -> tuple[str, str]:
    try:
        service = wizard_discovery_service(db, current, str(source["repo_ref"]), fallback)
        base_sha = await service.client.branch_sha(str(source["repo_ref"]), str(source["branch"]))
        content = await service.client.content(
            str(source["repo_ref"]), base_sha, str(source["manifest_path"])
        )
        return base_sha, content.decode("utf-8")
    except (RepositoryDiscoveryError, ValueError, UnicodeDecodeError) as exc:
        raise discovery_http_error(exc) from exc


def ensure_source_is_current(
    approved_base_sha: str,
    approved_source_sha256: str,
    current_base_sha: str,
    current_source: str,
) -> None:
    if approved_base_sha != current_base_sha or approved_source_sha256 != manifest_sha256(
        current_source
    ):
        raise HTTPException(
            status_code=409,
            detail={"code": "manifest_source_stale", "detail": STALE_SOURCE},
        )


def edit_workflow_id(
    workspace_id: str,
    resource_id: str,
    source: dict[str, Any],
    base_sha: str,
    desired_sha256: str,
) -> str:
    authority = "\0".join(
        (
            workspace_id,
            resource_id,
            str(source["application_id"]),
            str(source["binding_id"]),
            base_sha,
            desired_sha256,
        )
    )
    return f"workflow-manifest-edit-{hashlib.sha256(authority.encode()).hexdigest()[:32]}"
