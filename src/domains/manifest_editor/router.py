"""Source-pinned manifest editing with Safe PR and audited direct apply choices."""

from __future__ import annotations

import hashlib
import inspect
import json
import re
from collections.abc import Mapping
from copy import deepcopy
from dataclasses import asdict
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from domains.command.events import CommandRequestedBody
from domains.command.router import (
    COMMAND_PRIORITY_HIGH,
    accept_command_with_receipt_stage,
    announce_staged_operation_event,
    command_accepted_response,
    publish_accepted_operation,
)
from domains.gitops.events import Diff
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
    flattened_resources,
    manifest_identity,
    manifest_sha256,
    parse_documents,
    validate_manifest_edit,
    validate_manifest_source,
)
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256
from packages.config.constants import Command, Sandbox
from packages.config.control import control_namespace_allowed
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ResourceManifestApproveRequest,
    ResourceManifestDirectApplyRequest,
    ResourceManifestPreviewRequest,
)
from packages.contracts.gateway.responses import (
    ResourceManifestApproveResponse,
    ResourceManifestImpact,
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
from packages.contracts.parity import CommandReceipt, ResourceRef
from packages.runtime.dependencies import get_db, get_events, get_operation_events
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()
SAFE_PR_MANIFEST_EDIT_KIND = "safe_pr_manifest_edit"
UNSUPPORTED_SOURCE = "Only a single raw YAML GitHub source can be edited safely."
STALE_SOURCE = "The Git source changed after it was loaded. Reload before approving."
SOURCE_NOT_FOUND = "No exact GitOps source binding was found for this live resource."
DIRECT_APPLY_AGENT_UNAVAILABLE = "agent_unavailable"
DIRECT_APPLY_UID_UNAVAILABLE = "resource_uid_unavailable"
DIRECT_APPLY_NAMESPACE_UNRESOLVED = "namespace_unresolved"
DIRECT_APPLY_NAMESPACE_DENIED = "namespace_not_allowed"
DIRECT_APPLY_UNAVAILABLE = "Direct manifest apply is unavailable for this exact target."
DIRECT_APPLY_PREVIEW_STALE = "The confirmed manifest differs from the validated preview."
IDEMPOTENCY_KEY_REUSED = "idempotency_key_reused"
IDEMPOTENCY_KEY_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")


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
    impact = manifest_impacts(payload.edited_yaml, context["identity"]) if validation.valid else []
    reason_codes = direct_apply_reason_codes(db, context, impact)
    return ResourceManifestPreviewResponse(
        **asdict(validation),
        base_sha=base_sha,
        apply_availability="available" if not reason_codes else "unavailable",
        apply_reason_codes=reason_codes,
        impact=impact,
    )


@router.post(
    gateway_routes.RESOURCE_MANIFEST_APPLY_PATH,
    response_model=CommandReceipt,
    response_model_exclude_none=True,
    status_code=202,
)
async def apply_resource_manifest_now(
    resource_id: str,
    payload: ResourceManifestDirectApplyRequest,
    idempotency_key: Annotated[
        str,
        Header(alias="Idempotency-Key", min_length=8, max_length=128),
    ],
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
    operation_events: Any = Depends(get_operation_events),
    fallback_service: RepositoryDiscoveryService = Depends(discovery_service),
) -> CommandReceipt:
    """Queue one confirmed, source-pinned manifest apply through the shared agent command path."""

    if IDEMPOTENCY_KEY_PATTERN.fullmatch(idempotency_key) is None:
        raise HTTPException(status_code=422, detail="invalid Idempotency-Key")
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
    if payload.expected_desired_sha256 != validation.desired_sha256:
        raise HTTPException(
            status_code=409,
            detail={"code": "manifest_preview_stale", "detail": DIRECT_APPLY_PREVIEW_STALE},
        )

    documents, impact = direct_apply_documents(payload.edited_yaml, context["identity"])
    reason_codes = direct_apply_reason_codes(db, context, impact)
    if reason_codes:
        policy_failure = any(
            reason in {"namespace_unresolved", "namespace_not_allowed"} for reason in reason_codes
        )
        raise HTTPException(
            status_code=422 if policy_failure else 409,
            detail={
                "code": "manifest_apply_unavailable",
                "detail": DIRECT_APPLY_UNAVAILABLE,
                "reason_codes": reason_codes,
            },
        )
    resource_ref = exact_resource_ref(context)
    request_fingerprint = manifest_apply_request_fingerprint(
        resource_id=resource_id,
        base_sha=base_sha,
        source_sha256=validation.source_sha256,
        desired_sha256=validation.desired_sha256,
        impact=impact,
    )
    command_id = manifest_apply_command_id(
        context["workspace_id"], str(current.user_id), idempotency_key
    )
    replay = await replay_manifest_apply_receipt(
        db,
        workspace_id=context["workspace_id"],
        command_id=command_id,
        request_fingerprint=request_fingerprint,
    )
    if replay is not None:
        return replay

    selected_document = next(
        item for item, item_impact in zip(documents, impact, strict=True) if item_impact.selected
    )
    workflow_run_id = edit_workflow_id(
        context["workspace_id"],
        resource_id,
        source,
        base_sha,
        validation.desired_sha256,
    )
    diff = Diff(
        workspace_id=context["workspace_id"],
        cluster_id=context["cluster_id"],
        repository_id=str(source["repository_id"]),
        binding_id=str(source["binding_id"]),
        application_id=str(source["application_id"]),
        workflow_run_id=workflow_run_id,
        environment=str(source["environment"]),
        manifest_path=str(source["manifest_path"]),
        resource=f"{resource_ref.kind}/{resource_ref.name}",
        namespace=resource_ref.namespace or "",
        desired_image="",
        actual_image="resource-observed",
        risk=Sandbox.RISK_TAG,
        desired_manifest=selected_document,
        status="manifest_direct_apply",
        has_changes=True,
        changes=[item.model_dump() for item in impact],
        basis={
            "resource_ref": resource_ref.model_dump(),
            "base_sha": base_sha,
            "source_sha256": validation.source_sha256,
            "desired_sha256": validation.desired_sha256,
        },
    )
    command = CommandRequestedBody(
        cluster_id=context["cluster_id"],
        action=Command.APPLY_MANIFEST_ACTION,
        namespace=resource_ref.namespace or "",
        reason=payload.reason,
        diff=diff,
        command_id=command_id,
        payload={
            "request_fingerprint": request_fingerprint,
            "resource_ref": resource_ref.model_dump(),
            "source": {
                "repository_id": str(source["repository_id"]),
                "repo_ref": str(source["repo_ref"]),
                "branch": str(source["branch"]),
                "manifest_path": str(source["manifest_path"]),
                "base_sha": base_sha,
                "source_sha256": validation.source_sha256,
                "desired_sha256": validation.desired_sha256,
            },
            "desired_documents": documents,
        },
        workspace_id=context["workspace_id"],
        application_id=str(source["application_id"]),
        workflow_run_id=workflow_run_id,
        binding_id=str(source["binding_id"]),
        environment=str(source["environment"]),
        priority=COMMAND_PRIORITY_HIGH,
        requested_by=str(current.user_id),
        direct_execution=True,
        direct_execution_confirmed=True,
    )
    accepted, receipt_event = await accept_command_with_receipt_stage(
        events,
        command,
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    response = command_accepted_response(command, accepted)
    if not await announce_staged_operation_event(
        operation_events,
        receipt_event,
        workspace_id=command.workspace_id,
    ):
        await publish_accepted_operation(operation_events, command, response)
    return response


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


def manifest_impacts(
    desired_yaml: str,
    selected_identity: ManifestIdentity,
) -> list[ResourceManifestImpact]:
    errors, parsed = parse_documents(desired_yaml, label="edited")
    if errors or parsed is None:
        return []
    impacts: list[ResourceManifestImpact] = []
    for document in parsed:
        for resource in flattened_resources(document):
            identity = manifest_identity(resource)
            if identity is None:
                continue
            selected = identity_matches_selected(identity, selected_identity)
            namespace = identity.namespace
            if selected and namespace is None:
                namespace = selected_identity.namespace
            impacts.append(
                ResourceManifestImpact(
                    api_version=identity.api_version,
                    kind=identity.kind,
                    namespace=namespace,
                    name=identity.name,
                    selected=selected,
                )
            )
    return impacts


def direct_apply_documents(
    desired_yaml: str,
    selected_identity: ManifestIdentity,
) -> tuple[list[dict[str, Any]], list[ResourceManifestImpact]]:
    errors, parsed = parse_documents(desired_yaml, label="edited")
    if errors or parsed is None:
        raise HTTPException(
            status_code=422,
            detail={"code": "manifest_invalid", "detail": errors[0]},
        )
    documents: list[dict[str, Any]] = []
    impacts: list[ResourceManifestImpact] = []
    for document in parsed:
        for resource in flattened_resources(document):
            identity = manifest_identity(resource)
            if identity is None:
                raise HTTPException(status_code=422, detail="manifest identity is invalid")
            selected = identity_matches_selected(identity, selected_identity)
            normalized = deepcopy(dict(resource))
            namespace = identity.namespace
            if namespace is None and selected and selected_identity.namespace is not None:
                metadata = normalized.get("metadata")
                if not isinstance(metadata, dict):
                    raise HTTPException(status_code=422, detail="manifest metadata is invalid")
                metadata["namespace"] = selected_identity.namespace
                namespace = selected_identity.namespace
            documents.append(normalized)
            impacts.append(
                ResourceManifestImpact(
                    api_version=identity.api_version,
                    kind=identity.kind,
                    namespace=namespace,
                    name=identity.name,
                    selected=selected,
                )
            )
    return documents, impacts


def identity_matches_selected(identity: ManifestIdentity, selected: ManifestIdentity) -> bool:
    return (
        identity.api_version == selected.api_version
        and identity.kind.casefold() == selected.kind.casefold()
        and identity.name == selected.name
        and identity.namespace in {selected.namespace, None}
    )


def direct_apply_reason_codes(
    db: Any,
    context: dict[str, Any],
    impact: list[ResourceManifestImpact],
) -> list[str]:
    reasons: list[str] = []
    if not str(context["resource"].get("uid") or "").strip():
        reasons.append(DIRECT_APPLY_UID_UNAVAILABLE)
    statuses_reader = getattr(db, "list_cluster_agent_statuses", None)
    statuses = (
        statuses_reader(context["workspace_id"], context["cluster_id"])
        if callable(statuses_reader)
        else []
    )
    if not any(
        isinstance(item, Mapping)
        and str(item.get("status") or "").casefold() == "connected"
        and "command_receiver" in set(item.get("capabilities") or ())
        for item in statuses
    ):
        reasons.append(DIRECT_APPLY_AGENT_UNAVAILABLE)
    if any(item.namespace is None for item in impact):
        reasons.append(DIRECT_APPLY_NAMESPACE_UNRESOLVED)
    if any(
        item.namespace is not None and not control_namespace_allowed(item.namespace)
        for item in impact
    ):
        reasons.append(DIRECT_APPLY_NAMESPACE_DENIED)
    return list(dict.fromkeys(reasons))


def exact_resource_ref(context: dict[str, Any]) -> ResourceRef:
    resource = context["resource"]
    uid = str(resource.get("uid") or "").strip()
    if not uid:
        raise HTTPException(status_code=409, detail=DIRECT_APPLY_UNAVAILABLE)
    api_version = str(resource["api_version"])
    api_group, separator, version = api_version.rpartition("/")
    if not separator:
        api_group, version = "", api_version
    return ResourceRef(
        api_group=api_group,
        version=version,
        kind=str(resource["kind"]),
        namespace=(str(resource["namespace"]) if resource.get("namespace") is not None else None),
        name=str(resource["name"]),
        uid=uid,
    )


def manifest_apply_request_fingerprint(
    *,
    resource_id: str,
    base_sha: str,
    source_sha256: str,
    desired_sha256: str,
    impact: list[ResourceManifestImpact],
) -> str:
    encoded = json.dumps(
        {
            "resource_id": resource_id,
            "base_sha": base_sha,
            "source_sha256": source_sha256,
            "desired_sha256": desired_sha256,
            "impact": [item.model_dump() for item in impact],
        },
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(encoded.encode()).hexdigest()


def manifest_apply_command_id(workspace_id: str, user_id: str, idempotency_key: str) -> str:
    authority = "\0".join((workspace_id, user_id, idempotency_key))
    return f"cmd-manifest-{hashlib.sha256(authority.encode()).hexdigest()[:24]}"


async def replay_manifest_apply_receipt(
    db: Any,
    *,
    workspace_id: str,
    command_id: str,
    request_fingerprint: str,
) -> CommandReceipt | None:
    reader = getattr(db, "get_agent_command", None)
    if not callable(reader):
        return None
    existing = reader(command_id, workspace_id)
    if inspect.isawaitable(existing):
        existing = await existing
    if not isinstance(existing, Mapping):
        return None
    plan = existing.get("payload")
    command_payload = plan.get("payload") if isinstance(plan, Mapping) else None
    if (
        not isinstance(command_payload, Mapping)
        or command_payload.get("request_fingerprint") != request_fingerprint
    ):
        raise HTTPException(
            status_code=409,
            detail={
                "code": IDEMPOTENCY_KEY_REUSED,
                "detail": "Idempotency-Key was already used for another manifest apply.",
            },
        )
    event_id = str(existing.get("confirmation_event_id") or "")
    correlation_id = str(existing.get("correlation_id") or "")
    if not event_id or not correlation_id:
        raise HTTPException(status_code=409, detail="manifest apply receipt is incomplete")
    return CommandReceipt(
        command_id=command_id,
        event_id=event_id,
        audit_event_id=event_id,
        correlation_id=correlation_id,
        status=str(existing.get("status") or "queued"),
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
