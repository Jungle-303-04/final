"""Release-flow management API."""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.exc import IntegrityError

from domains.alert.events import AlertRequestedBody
from domains.alert.repository import severity_matches
from domains.diagnostics.router import release_plan_diagnostics
from domains.gitops.events import GitWebhookReceivedBody
from domains.gitops.repository import (
    derive_deployment_binding_id,
    derive_repository_id,
    derive_workflow_run_id,
)
from domains.identity.dependencies import (
    require_cluster_access,
    require_resource_access,
    require_session,
)
from domains.release_flow.execution import (
    PRODUCTION_ENVIRONMENTS,
    approval_granted,
    dry_run_correlation_id,
    dry_run_event_id,
    execution_profile,
    has_change_ticket,
    placeholder_change_ticket,
)
from domains.release_flow.execution import (
    release_execution_blockers as base_release_execution_blockers,
)
from domains.release_flow.manifest import render_release_step_manifest
from domains.release_flow.preview import build_release_plan_preview
from domains.release_flow.redaction import redact_release_value
from domains.release_flow.repository import (
    ReleasePlanWorkspaceMismatchError,
    derive_release_plan_id,
)
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256
from packages.config.constants import GitHub, Sandbox, Target
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    ReleaseManifestRenderRequest,
    ReleaseManifestSafePrRequest,
    ReleasePlanArchiveRequest,
    ReleasePlanUpsertRequest,
    ReleaseRunActionRequest,
)
from packages.contracts.gateway.responses import (
    ReleaseAuditListResponse,
    ReleaseManifestRenderResponse,
    ReleaseManifestSafePrResponse,
    ReleasePlanDispatchResponse,
    ReleasePlanListResponse,
    ReleasePlanPreviewResponse,
    ReleasePlanResponse,
    ReleaseReadinessResponse,
    ReleaseRunAlertResponse,
    ReleaseRunHandoffResponse,
    ReleaseRunListResponse,
    ReleaseRunReportResponse,
    ReleaseRunResponse,
    ReleaseRunSummaryResponse,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    Permission,
    ServiceRole,
)
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null

router = APIRouter()
HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409
HTTP_UNPROCESSABLE_ENTITY = 422
RELEASE_PLAN_NOT_FOUND = "release plan not found"
EXPLICIT_RELEASE_PLAN_ID_NOT_ALLOWED = "plan_id must not be provided when creating a release plan"
EMPTY_RELEASE_PLAN_NOT_ALLOWED = "release plan must contain at least one application step"
RELEASE_PLAN_WORKSPACE_MUTATION_LOCK = "\x00workspace-mutation"
RELEASE_RUN_NOT_FOUND = "release run not found"
RELEASE_PLAN_BLOCKED = "release plan has blockers"
RELEASE_RUN_BLOCKED = "release run cannot advance"
TERMINAL_RELEASE_RUN_STATUSES = {"succeeded", "failed", "cancelled", "rollback_requested"}
BLOCKING_RUN_STATUSES = {"running", "paused", "rollback_requested", "waiting_for_approval"}
DEFAULT_RELEASE_VERIFICATION_TIMEOUT_MINUTES = 15
VERIFICATION_JOB_FAILED_STATUSES = {"failed", "error", "timeout", "unhealthy"}
VERIFICATION_JOB_PENDING_STATUSES = {"", "pending", "queued", "running"}
RELEASE_NOTIFY_COOLDOWN_MINUTES_ENV = "RELEASE_FLOW_NOTIFY_COOLDOWN_MINUTES"
DEFAULT_RELEASE_NOTIFY_COOLDOWN_MINUTES = 10
ALERT_CHANNEL_VALIDATION_MAX_AGE_HOURS_ENV = "RELEASE_FLOW_ALERT_TEST_MAX_AGE_HOURS"
DEFAULT_ALERT_CHANNEL_VALIDATION_MAX_AGE_HOURS = 24
APPROVAL_MAX_AGE_HOURS_ENV = "RELEASE_FLOW_APPROVAL_MAX_AGE_HOURS"
DEFAULT_APPROVAL_MAX_AGE_HOURS = 24
SAFE_PR_EVIDENCE_MAX_AGE_HOURS_ENV = "RELEASE_FLOW_SAFE_PR_EVIDENCE_MAX_AGE_HOURS"
DEFAULT_SAFE_PR_EVIDENCE_MAX_AGE_HOURS = 24
APPROVAL_CLOCK_SKEW_MINUTES = 5
SAFE_PR_EVIDENCE_LOOKUP_LIMIT = 20
PLACEHOLDER_EVIDENCE_HOSTS = {"example.com", "example.test", "localhost", "127.0.0.1", "::1"}


@router.get(gateway_routes.RELEASE_PLANS_PATH, response_model=ReleasePlanListResponse)
async def list_release_plans(
    limit: int = Query(default=100, ge=1, le=500),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    return ReleasePlanListResponse(plans=db.list_release_plans(workspace_id, limit=limit))


@router.get(gateway_routes.RELEASE_RUNS_PATH, response_model=ReleaseRunListResponse)
async def list_release_runs(
    plan_id: str | None = Query(default=None),
    status: str | None = Query(default=None, max_length=80),
    attention_only: bool = Query(default=False),
    stale_only: bool = Query(default=False),
    active_only: bool = Query(default=False),
    live_only: bool = Query(default=False),
    unhealthy_only: bool = Query(default=False),
    verification_failed_only: bool = Query(default=False),
    verification_pending_timeout_only: bool = Query(default=False),
    policy_override_only: bool = Query(default=False),
    policy_override_source: str | None = Query(default=None, max_length=120),
    active_change_freeze_only: bool = Query(default=False),
    change_freeze_override_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    runs = db.list_release_runs(workspace_id, plan_id=plan_id, limit=limit)
    for run in runs:
        require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    runs = filter_release_runs(
        runs,
        status=status,
        attention_only=attention_only,
        stale_only=stale_only,
        active_only=active_only,
        live_only=live_only,
        unhealthy_only=unhealthy_only,
        verification_failed_only=verification_failed_only,
        verification_pending_timeout_only=verification_pending_timeout_only,
        policy_override_only=policy_override_only,
        policy_override_source=policy_override_source,
        active_change_freeze_only=active_change_freeze_only,
        change_freeze_override_only=change_freeze_override_only,
    )
    return ReleaseRunListResponse(runs=runs)


@router.get(gateway_routes.RELEASE_RUN_SUMMARY_PATH, response_model=ReleaseRunSummaryResponse)
async def summarize_release_runs(
    plan_id: str | None = Query(default=None),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunSummaryResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    runs = db.list_release_runs(workspace_id, plan_id=plan_id, limit=200)
    for run in runs:
        require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    return ReleaseRunSummaryResponse(**release_run_summary_from_runs(runs))


@router.get(gateway_routes.RELEASE_AUDIT_PATH, response_model=ReleaseAuditListResponse)
async def list_release_audit(
    plan_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseAuditListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    events = release_audit_events_for_current(
        db,
        current,
        workspace_id,
        plan_id=plan_id,
        run_id=run_id,
        event_type=event_type,
        limit=limit,
    )
    return ReleaseAuditListResponse(events=[public_release_audit_event(event) for event in events])


@router.get(gateway_routes.RELEASE_AUDIT_EXPORT_PATH)
async def export_release_audit(
    plan_id: str | None = Query(default=None),
    run_id: str | None = Query(default=None),
    event_type: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> Response:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    events = release_audit_events_for_current(
        db,
        current,
        workspace_id,
        plan_id=plan_id,
        run_id=run_id,
        event_type=event_type,
        limit=limit,
    )
    csv_body = release_audit_csv(public_release_audit_event(event) for event in events)
    return Response(
        content=csv_body,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="release-audit.csv"'},
    )


@router.get(gateway_routes.RELEASE_RUN_PATH, response_model=ReleaseRunResponse)
async def get_release_run(
    run_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    return ReleaseRunResponse(run=run)


@router.get(gateway_routes.RELEASE_RUN_HANDOFF_PATH, response_model=ReleaseRunHandoffResponse)
async def get_release_run_handoff(
    run_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunHandoffResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    return ReleaseRunHandoffResponse(handoff=release_run_handoff(run))


@router.get(gateway_routes.RELEASE_RUN_REPORT_PATH, response_model=ReleaseRunReportResponse)
async def get_release_run_report(
    run_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunReportResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    audit_events = release_audit_events_for_current(
        db,
        current,
        workspace_id,
        plan_id=None,
        run_id=run_id,
        event_type=None,
        limit=50,
    )
    public_events = [public_release_audit_event(event) for event in audit_events]
    return ReleaseRunReportResponse(report=release_run_report(run, public_events))


@router.get(gateway_routes.RELEASE_RUN_REPORT_EXPORT_PATH)
async def export_release_run_report(
    run_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> Response:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_read_access(db, current, workspace_id, run.get("steps", []))
    audit_events = release_audit_events_for_current(
        db,
        current,
        workspace_id,
        plan_id=None,
        run_id=run_id,
        event_type=None,
        limit=50,
    )
    report = release_run_report(run, [public_release_audit_event(event) for event in audit_events])
    filename = f"release-run-{safe_release_report_filename(run_id)}.md"
    return Response(
        content=str(report.get("markdown") or ""),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(gateway_routes.RELEASE_PLAN_PATH, response_model=ReleasePlanResponse)
async def get_release_plan(
    plan_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    plan = db.get_release_plan(workspace_id, plan_id)
    if plan is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
    require_plan_application_read_access(db, current, workspace_id, plan.get("steps", []))
    return ReleasePlanResponse(plan=plan)


@router.post(gateway_routes.RELEASE_PLAN_PREVIEW_PATH, response_model=ReleasePlanPreviewResponse)
async def preview_release_plan(
    payload: ReleasePlanUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanPreviewResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.model_dump(), "workspace_id": workspace_id}
    require_plan_application_read_access(db, current, workspace_id, body["steps"])
    return ReleasePlanPreviewResponse(preview=build_release_plan_preview(body))


@router.post(gateway_routes.RELEASE_READINESS_PATH, response_model=ReleaseReadinessResponse)
async def check_release_readiness(
    payload: ReleasePlanUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseReadinessResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.model_dump(), "workspace_id": workspace_id}
    require_plan_application_read_access(db, current, workspace_id, body["steps"])
    preview = build_release_plan_preview(body)
    return ReleaseReadinessResponse(
        **release_readiness_from_plan(body, preview, workspace_id=workspace_id, db=db)
    )


@router.post(
    gateway_routes.RELEASE_MANIFEST_RENDER_PATH,
    response_model=ReleaseManifestRenderResponse,
)
async def render_release_manifest(
    payload: ReleaseManifestRenderRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseManifestRenderResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.plan.model_dump(), "workspace_id": workspace_id}
    require_plan_application_read_access(db, current, workspace_id, body["steps"])
    steps = [step for step in body.get("steps", []) if isinstance(step, dict)]
    application = release_step_application(db, workspace_id, steps, payload.step_index)
    return ReleaseManifestRenderResponse(
        **render_release_step_manifest(body, payload.step_index, application)
    )


@router.post(
    gateway_routes.RELEASE_MANIFEST_SAFE_PR_PATH,
    response_model=ReleaseManifestSafePrResponse,
)
async def submit_release_manifest_safe_pr(
    payload: ReleaseManifestSafePrRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleaseManifestSafePrResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.plan.model_dump(), "workspace_id": workspace_id}
    require_plan_application_manage_access(db, current, workspace_id, body["steps"])
    steps = [step for step in body.get("steps", []) if isinstance(step, dict)]
    if payload.step_index < 0 or payload.step_index >= len(steps):
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_PLAN_BLOCKED,
                "blockers": ["selected release step is invalid"],
            },
        )
    step = steps[payload.step_index]
    context_blockers = release_dispatch_context_blockers(body, [step], db, workspace_id)
    if context_blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": context_blockers},
        )
    application = release_step_application(db, workspace_id, steps, payload.step_index)
    rendered = render_release_step_manifest(body, payload.step_index, application)
    errors = [
        diagnostic.message
        for diagnostic in rendered["diagnostics"]
        if getattr(diagnostic, "severity", "") == "error"
    ]
    if errors:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": errors},
        )
    files = [file for file in rendered["files"] if file.get("content")]
    if not files:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_PLAN_BLOCKED,
                "blockers": ["generated manifest has no file content to submit"],
            },
        )

    safe_pr = generated_manifest_safe_pr_body(
        body,
        step,
        application,
        rendered,
        payload.title,
        payload.body,
        workspace_id,
    )
    safe_pr_blockers = generated_manifest_safe_pr_blockers(body, step, safe_pr)
    if safe_pr_blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": safe_pr_blockers},
        )
    accepted = await events.accept_body(safe_pr, actor=Actor(current.user_id, tuple(current.roles)))
    return ReleaseManifestSafePrResponse(
        **rendered,
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        workflow_run_id=safe_pr.workflow_run_id,
        application_id=safe_pr.application_id,
        repo_ref=safe_pr.repo_ref,
        base_branch=safe_pr.base_branch,
        manifest_path=safe_pr.manifest_path,
        commit_sha=safe_pr.commit_sha,
        patch_sha256=safe_pr.patch_sha256,
    )


@router.post(
    gateway_routes.RELEASE_PLAN_DISPATCH_PATH,
    response_model=ReleasePlanDispatchResponse,
)
async def dispatch_release_plan(
    payload: ReleasePlanUpsertRequest,
    wave: int = Query(default=1, ge=1, le=50),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleasePlanDispatchResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.model_dump(), "workspace_id": workspace_id}
    require_plan_application_manage_access(db, current, workspace_id, body["steps"])
    require_no_active_release_run(db, workspace_id, body)
    preview = build_release_plan_preview(body)
    dispatch_plan = plan_with_safe_pr_evidence(
        body, preview, wave, workspace_id=workspace_id, db=db
    )
    blockers = list(preview.get("blockers", []))
    blockers.extend(
        release_dispatch_context_blockers(
            dispatch_plan,
            steps_for_wave(dispatch_plan, preview, wave),
            db,
            workspace_id,
        )
    )
    blockers.extend(
        release_execution_blockers(dispatch_plan, preview, wave, workspace_id=workspace_id, db=db)
    )
    blockers.extend(release_production_approval_evidence_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_change_ticket_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_window_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_freeze_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_runbook_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_owner_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_verification_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_abort_criteria_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_diagnostics_blockers(dispatch_plan))
    blockers.extend(release_rollback_policy_blockers(dispatch_plan))
    blockers.extend(release_live_alert_channel_blockers(dispatch_plan, db, workspace_id))
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": blockers},
        )
    accepted_events, run = await _create_and_dispatch_release_run(
        db,
        workspace_id,
        current,
        events,
        dispatch_plan,
        preview,
        wave,
    )
    return ReleasePlanDispatchResponse(
        accepted=True,
        wave=wave,
        events=accepted_events,
        run=run,
    )


@router.post(gateway_routes.RELEASE_PLAN_START_PATH, response_model=ReleaseRunResponse)
async def start_release_plan(
    payload: ReleasePlanUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.model_dump(), "workspace_id": workspace_id}
    require_plan_application_manage_access(db, current, workspace_id, body["steps"])
    require_no_active_release_run(db, workspace_id, body)
    preview = build_release_plan_preview(body)
    first_wave = first_preview_wave(preview)
    dispatch_plan = plan_with_safe_pr_evidence(
        body, preview, first_wave, workspace_id=workspace_id, db=db
    )
    blockers = list(preview.get("blockers", []))
    blockers.extend(
        release_dispatch_context_blockers(
            dispatch_plan,
            steps_for_wave(dispatch_plan, preview, first_wave),
            db,
            workspace_id,
        )
    )
    blockers.extend(
        release_execution_blockers(
            dispatch_plan, preview, first_wave, workspace_id=workspace_id, db=db
        )
    )
    blockers.extend(
        release_production_approval_evidence_blockers(dispatch_plan, preview, first_wave)
    )
    blockers.extend(release_production_change_ticket_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_window_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_freeze_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_runbook_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_owner_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_verification_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_production_abort_criteria_blockers(dispatch_plan, preview, first_wave))
    blockers.extend(release_diagnostics_blockers(dispatch_plan))
    blockers.extend(release_rollback_policy_blockers(dispatch_plan))
    blockers.extend(release_live_alert_channel_blockers(dispatch_plan, db, workspace_id))
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": blockers},
        )
    _, run = await _create_and_dispatch_release_run(
        db,
        workspace_id,
        current,
        events,
        dispatch_plan,
        preview,
        first_wave,
    )
    return ReleaseRunResponse(run=run)


async def _create_and_dispatch_release_run(
    db: Any,
    workspace_id: str,
    current: Any,
    events: Any,
    body: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    run = db.create_release_run(
        {
            "workspace_id": workspace_id,
            "plan": body,
            "preview": preview,
            "started_by": current.user_id,
        }
    )
    if run is None:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": "release run could not be created"},
        )
    run_id = str(run["run_id"])
    accepted_events: list[dict[str, Any]] = []
    try:
        accepted_events = await dispatch_wave_steps(
            body,
            preview,
            wave,
            workspace_id,
            current,
            db,
            events,
            run_id=run_id,
        )
    except HTTPException:
        if not accepted_events:
            db.delete_release_run(workspace_id, run_id)
        else:
            db.update_release_run_status(
                workspace_id,
                run_id,
                "failed",
                actor=current.user_id,
                message="Release run failed while dispatching",
            )
        raise
    except Exception as exc:
        if not accepted_events:
            db.delete_release_run(workspace_id, run_id)
        else:
            db.update_release_run_status(
                workspace_id,
                run_id,
                "failed",
                actor=current.user_id,
                message="Release run failed while dispatching",
            )
        raise HTTPException(
            status_code=500,
            detail={"message": f"release run dispatch failed: {str(exc)}"},
        ) from exc
    return accepted_events, db.get_release_run(workspace_id, run_id) or run


@router.post(gateway_routes.RELEASE_PLAN_ARCHIVE_PATH, response_model=ReleasePlanResponse)
async def archive_release_plan(
    plan_id: str,
    payload: ReleasePlanArchiveRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    plan = db.get_release_plan(workspace_id, plan_id)
    if plan is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
    require_plan_application_plan_manage_access(db, current, workspace_id, plan.get("steps", []))
    archived = db.archive_release_plan(workspace_id, plan_id, reason=payload.reason)
    if archived is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
    return ReleasePlanResponse(plan=archived)


@router.delete(gateway_routes.RELEASE_PLAN_PATH)
async def delete_release_plan(
    plan_id: str,
    force: bool = Query(default=False),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> Response:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    plan = db.get_release_plan(workspace_id, plan_id)
    if plan is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
    require_plan_application_plan_manage_access(db, current, workspace_id, plan.get("steps", []))
    if not force and db.has_active_release_runs(workspace_id, plan_id):
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": "release plan has active runs",
                "can_force_delete": True,
            },
        )
    if not db.delete_release_plan(workspace_id, plan_id):
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
    return Response(status_code=204)


@router.delete(gateway_routes.RELEASE_RUN_PATH)
async def delete_release_run(
    run_id: str,
    force: bool = Query(default=False),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> Response:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_cancel_access(db, current, workspace_id, run.get("steps", []))
    if str(run.get("status") or "") in BLOCKING_RUN_STATUSES and not force:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": "release run is still active",
                "can_force_delete": True,
            },
        )
    if not db.delete_release_run(workspace_id, run_id):
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    return Response(status_code=204)


@router.post(gateway_routes.RELEASE_RUN_ADVANCE_PATH, response_model=ReleaseRunResponse)
async def advance_release_run(
    run_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_manage_access(db, current, workspace_id, run.get("steps", []))
    if str(run.get("status")) == "paused":
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": ["release run is paused"]},
        )
    current_wave = int_field(run, "current_wave", 1)
    current_steps = [step for step in run.get("steps", []) if step.get("wave") == current_wave]
    current_wave_blockers = release_current_wave_health_blockers(current_steps, current_wave)
    if current_wave_blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_RUN_BLOCKED,
                "blockers": current_wave_blockers,
            },
        )
    next_wave = current_wave + 1
    pending_steps = [step for step in run.get("steps", []) if step.get("wave") == next_wave]
    if not pending_steps:
        completed = db.update_release_run_status(
            workspace_id,
            run_id,
            "succeeded",
            actor=current.user_id,
            message="All release waves completed.",
        )
        return ReleaseRunResponse(run=completed or run)
    plan = release_plan_from_run(run, pending_steps)
    preview = {
        "steps": [
            {"application_id": step["application_id"], "wave": next_wave} for step in pending_steps
        ]
    }
    blockers = release_execution_blockers(
        plan, preview, next_wave, workspace_id=workspace_id, db=db
    )
    blockers.extend(release_production_approval_evidence_blockers(plan, preview, next_wave))
    blockers.extend(release_production_change_ticket_blockers(plan, preview, next_wave))
    blockers.extend(release_production_window_blockers(plan, preview, next_wave))
    blockers.extend(release_production_freeze_blockers(plan, preview, next_wave))
    blockers.extend(release_production_runbook_blockers(plan, preview, next_wave))
    blockers.extend(release_production_owner_blockers(plan, preview, next_wave))
    blockers.extend(release_production_verification_blockers(plan, preview, next_wave))
    blockers.extend(release_production_abort_criteria_blockers(plan, preview, next_wave))
    blockers.extend(release_diagnostics_blockers(plan))
    blockers.extend(release_rollback_policy_blockers(plan))
    blockers.extend(release_live_alert_channel_blockers(plan, db, workspace_id))
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": blockers},
        )
    await dispatch_wave_steps(
        plan,
        preview,
        next_wave,
        workspace_id,
        current,
        db,
        events,
        run_id=run_id,
    )
    advanced = db.update_release_run_status(
        workspace_id,
        run_id,
        "running",
        current_wave=next_wave,
        actor=current.user_id,
        message=f"Release run advanced to wave {next_wave}.",
    )
    return ReleaseRunResponse(run=advanced or db.get_release_run(workspace_id, run_id) or run)


@router.post(gateway_routes.RELEASE_RUN_PAUSE_PATH, response_model=ReleaseRunResponse)
async def pause_release_run(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunResponse:
    return release_run_status_action(
        run_id,
        payload,
        current,
        db,
        "paused",
        "Release run paused.",
        "release run is already terminal",
    )


@router.post(gateway_routes.RELEASE_RUN_RESUME_PATH, response_model=ReleaseRunResponse)
async def resume_release_run(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunResponse:
    return release_run_status_action(
        run_id,
        payload,
        current,
        db,
        "running",
        "Release run resumed.",
        "release run is already terminal",
    )


@router.post(gateway_routes.RELEASE_RUN_RETRY_PATH, response_model=ReleaseRunResponse)
async def retry_release_run(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    existing = db.get_release_run(workspace_id, run_id)
    if existing is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_manage_access(db, current, workspace_id, existing.get("steps", []))
    run_status = str(existing.get("derived_status") or existing.get("status") or "")
    if run_status in {"succeeded", "cancelled", "rollback_requested"}:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": ["release run cannot be retried"]},
        )
    retry_wave = int_field(existing, "current_wave", 1)
    retry_steps = retryable_steps_for_wave(existing, retry_wave)
    if not retry_steps:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_RUN_BLOCKED,
                "blockers": [f"wave {retry_wave} has no failed or unhealthy steps to retry"],
            },
        )
    retry_limit = retry_limit_for_steps(existing, retry_steps)
    previous_attempts = retry_attempts_for_wave(existing, retry_wave)
    if previous_attempts >= retry_limit:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_RUN_BLOCKED,
                "blockers": [f"wave {retry_wave} retry budget exhausted ({retry_limit})"],
            },
        )
    attempt = previous_attempts + 1
    plan = release_plan_from_run(existing, retry_steps)
    preview = {
        "steps": [
            {"application_id": step["application_id"], "wave": retry_wave} for step in retry_steps
        ]
    }
    blockers = release_execution_blockers(
        plan, preview, retry_wave, workspace_id=workspace_id, db=db
    )
    blockers.extend(release_production_approval_evidence_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_change_ticket_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_window_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_freeze_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_runbook_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_owner_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_verification_blockers(plan, preview, retry_wave))
    blockers.extend(release_production_abort_criteria_blockers(plan, preview, retry_wave))
    blockers.extend(release_diagnostics_blockers(plan))
    blockers.extend(release_rollback_policy_blockers(plan))
    blockers.extend(release_live_alert_channel_blockers(plan, db, workspace_id))
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": blockers},
        )
    db.mark_release_run_retry(
        workspace_id,
        run_id,
        retry_wave,
        attempt,
        "running",
        actor=current.user_id,
        reason=payload.reason or "operator requested retry",
    )
    try:
        await dispatch_wave_steps(
            plan,
            preview,
            retry_wave,
            workspace_id,
            current,
            db,
            events,
            run_id=run_id,
        )
    except Exception:
        db.mark_release_run_retry(
            workspace_id,
            run_id,
            retry_wave,
            attempt,
            "failed",
            actor=current.user_id,
            reason="retry dispatch failed",
        )
        raise
    run = db.get_release_run(workspace_id, run_id) or existing
    return ReleaseRunResponse(run=run)


@router.post(gateway_routes.RELEASE_RUN_ROLLBACK_PATH, response_model=ReleaseRunResponse)
async def rollback_release_run(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    existing = db.get_release_run(workspace_id, run_id)
    if existing is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    run_status = str(existing.get("status") or "")
    if run_status in TERMINAL_RELEASE_RUN_STATUSES:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_RUN_BLOCKED,
                "blockers": ["release run is already terminal"],
            },
        )
    require_plan_application_rollback_access(db, current, workspace_id, existing.get("steps", []))
    rollback_policy = release_run_rollback_policy(existing)
    if rollback_policy == "disabled":
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_RUN_BLOCKED,
                "blockers": ["rollback is disabled for this release run"],
            },
        )
    run = db.request_release_run_rollback(
        workspace_id,
        run_id,
        actor=current.user_id,
        reason=operator_action_reason(payload, "operator requested rollback"),
    )
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    return ReleaseRunResponse(run=run)


@router.post(gateway_routes.RELEASE_RUN_CANCEL_PATH, response_model=ReleaseRunResponse)
async def cancel_release_run(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleaseRunResponse:
    return release_run_status_action(
        run_id,
        payload,
        current,
        db,
        "cancelled",
        "Release run cancelled.",
        "release run is already terminal",
        permission=Permission.RUNNER_JOB_CANCEL.value,
    )


@router.post(gateway_routes.RELEASE_RUN_NOTIFY_PATH, response_model=ReleaseRunAlertResponse)
async def notify_release_run_attention(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> ReleaseRunAlertResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    run = db.get_release_run(workspace_id, run_id)
    if run is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    require_plan_application_manage_access(db, current, workspace_id, run.get("steps", []))
    blocker = release_notify_cooldown_blocker(run)
    if blocker:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": [blocker]},
        )
    reason = operator_action_reason(payload, "operator requested release run notification")
    alert = release_run_attention_alert_body(
        run,
        workspace_id,
        reason=reason,
    )
    accepted = await events.accept_body(
        alert,
        actor=Actor(current.user_id, tuple(current.roles)),
    )
    event_type = f"release.notify.{release_window_bound_label(datetime.now(UTC))}"
    recorded = record_release_notify_event(
        db,
        workspace_id,
        run_id,
        event_type,
        alert,
        actor=current.user_id,
        reason=reason,
        accepted_event=accepted.event.to_dict(),
    )
    return ReleaseRunAlertResponse(
        accepted=True,
        event=accepted.event.to_dict(),
        run=recorded or run,
    )


@router.post(gateway_routes.RELEASE_PLANS_PATH, response_model=ReleasePlanResponse)
async def create_release_plan(
    payload: ReleasePlanUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanResponse:
    if payload.plan_id is not None:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE_ENTITY,
            detail=EXPLICIT_RELEASE_PLAN_ID_NOT_ALLOWED,
        )
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    body = {**payload.model_dump(), "workspace_id": workspace_id, "user_id": current.user_id}
    with unit_of_work_or_null(db):
        lock_identity = getattr(db, "lock_release_plan_identity", None)
        if not callable(lock_identity):
            raise HTTPException(status_code=503, detail="release plan storage unavailable")
        lock_identity(workspace_id, RELEASE_PLAN_WORKSPACE_MUTATION_LOCK)
        lock_identity(workspace_id, str(body["name"]))
        get_by_name = getattr(db, "get_release_plan_by_name", None)
        if callable(get_by_name):
            existing = get_by_name(
                workspace_id,
                str(body["name"]),
                for_update=True,
            )
        else:
            existing_plan_id = derive_release_plan_id(body)
            existing = db.get_release_plan(workspace_id, existing_plan_id, for_update=True)
        if existing is not None:
            require_plan_application_plan_manage_access(
                db,
                current,
                workspace_id,
                existing.get("steps", []),
            )
            body["plan_id"] = str(existing["plan_id"])
        elif not body["steps"]:
            raise HTTPException(
                status_code=HTTP_UNPROCESSABLE_ENTITY,
                detail=EMPTY_RELEASE_PLAN_NOT_ALLOWED,
            )
        if body["steps"]:
            require_plan_application_plan_manage_access(db, current, workspace_id, body["steps"])
        plan = upsert_release_plan_or_404(db, body)
    return ReleasePlanResponse(plan=plan)


@router.put(gateway_routes.RELEASE_PLAN_PATH, response_model=ReleasePlanResponse)
async def update_release_plan(
    plan_id: str,
    payload: ReleasePlanUpsertRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ReleasePlanResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    with unit_of_work_or_null(db):
        lock_identity = getattr(db, "lock_release_plan_identity", None)
        if not callable(lock_identity):
            raise HTTPException(status_code=503, detail="release plan storage unavailable")
        lock_identity(workspace_id, RELEASE_PLAN_WORKSPACE_MUTATION_LOCK)
        existing = db.get_release_plan(workspace_id, plan_id, for_update=True)
        if existing is None:
            raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND)
        require_plan_application_plan_manage_access(
            db,
            current,
            workspace_id,
            existing.get("steps", []),
        )
        body = {**payload.model_dump(), "plan_id": plan_id, "workspace_id": workspace_id}
        if str(body["name"]) != str(existing.get("name") or ""):
            get_by_name = getattr(db, "get_release_plan_by_name", None)
            if not callable(get_by_name):
                raise HTTPException(status_code=503, detail="release plan storage unavailable")
            lock_identity(workspace_id, str(body["name"]))
            name_owner = get_by_name(
                workspace_id,
                str(body["name"]),
                for_update=True,
            )
            if name_owner is not None and str(name_owner.get("plan_id")) != plan_id:
                raise HTTPException(status_code=HTTP_CONFLICT, detail="release plan name conflict")
        if body["steps"]:
            require_plan_application_plan_manage_access(db, current, workspace_id, body["steps"])
        plan = upsert_release_plan_or_404(db, body)
    return ReleasePlanResponse(plan=plan)


async def dispatch_wave_steps(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
    workspace_id: str,
    current: Any,
    db: Any,
    events: Any,
    *,
    run_id: str | None = None,
) -> list[dict[str, Any]]:
    dispatch_plan = plan_with_safe_pr_evidence(
        plan, preview, wave, workspace_id=workspace_id, db=db
    )
    selected_steps = steps_for_wave(dispatch_plan, preview, wave)
    if not selected_steps:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": [f"wave {wave} has no steps"]},
        )

    blockers = release_dispatch_context_blockers(dispatch_plan, selected_steps, db, workspace_id)
    blockers.extend(
        release_execution_blockers(dispatch_plan, preview, wave, workspace_id=workspace_id, db=db)
    )
    blockers.extend(release_production_approval_evidence_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_change_ticket_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_window_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_freeze_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_runbook_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_owner_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_verification_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_production_abort_criteria_blockers(dispatch_plan, preview, wave))
    blockers.extend(release_diagnostics_blockers(dispatch_plan))
    blockers.extend(release_rollback_policy_blockers(dispatch_plan))
    blockers.extend(release_live_alert_channel_blockers(dispatch_plan, db, workspace_id))
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_PLAN_BLOCKED, "blockers": blockers},
        )

    accepted_events: list[dict[str, Any]] = []
    profile = execution_profile(dispatch_plan)
    release_guard = release_dispatch_guard_snapshot(dispatch_plan, db, workspace_id, preview, wave)
    for step in selected_steps:
        application_id = str(step["application_id"])
        application = db.get_application(workspace_id, application_id) or {}
        request = dispatch_request_for_step(dispatch_plan, step, application, workspace_id)
        require_cluster_access(
            db,
            current,
            workspace_id,
            request.cluster_id,
            Permission.DEPLOY_RUN.value,
        )
        if profile.side_effects:
            accepted = await events.accept_body(
                request,
                actor=Actor(current.user_id, tuple(current.roles)),
            )
            event_id = accepted.event.event_id
            correlation_id = accepted.event.correlation_id
            event = accepted.event.to_dict()
        else:
            event_id = dry_run_event_id(run_id, application_id, wave)
            correlation_id = dry_run_correlation_id(run_id, application_id, wave)
            event = dry_run_event_body(request, event_id, correlation_id, profile.to_body())
        accepted_events.append(
            {
                "event_id": event_id,
                "correlation_id": correlation_id,
                "event": event,
            }
        )
        if run_id:
            db.mark_release_run_step_dispatched(
                workspace_id,
                run_id,
                application_id,
                workflow_run_id=request.workflow_run_id,
                event_id=event_id,
                correlation_id=correlation_id,
                actor=current.user_id,
                details={
                    "runtime_mode": profile.runtime_mode,
                    "provider_mode": profile.provider_mode,
                    "side_effects": profile.side_effects,
                    "wave": wave,
                    "cluster_id": request.cluster_id,
                    "environment": request.environment,
                    "manifest_path": request.manifest_path,
                    "repo_ref": request.repo_ref,
                    "branch": request.branch,
                    "commit_sha": request.commit_sha,
                    "release_guard": release_guard,
                },
            )
    return accepted_events


def dry_run_event_body(
    request: GitWebhookReceivedBody,
    event_id: str,
    correlation_id: str,
    profile: dict[str, Any],
) -> dict[str, Any]:
    return {
        "event_id": event_id,
        "correlation_id": correlation_id,
        "subject": "git.webhook.received",
        "dry_run": True,
        "execution_profile": profile,
        "body": request.to_body(),
    }


def first_preview_wave(preview: dict[str, Any]) -> int:
    waves = preview.get("waves")
    if isinstance(waves, list) and waves and isinstance(waves[0], dict):
        return int_field(waves[0], "wave", 1)
    return 1


def release_execution_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
    *,
    workspace_id: str,
    db: Any = None,
) -> list[str]:
    evidenced_plan = plan_with_safe_pr_evidence(
        plan, preview, wave, workspace_id=workspace_id, db=db
    )
    return base_release_execution_blockers(evidenced_plan, preview, wave, workspace_id=workspace_id)


def plan_with_safe_pr_evidence(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
    *,
    workspace_id: str,
    db: Any = None,
) -> dict[str, Any]:
    if db is None:
        return plan
    settings = plan_settings_value(plan)
    preview_steps = {
        str(step.get("application_id") or ""): step
        for step in preview.get("steps", [])
        if isinstance(step, dict)
    }
    changed = False
    sanitized_settings = dict(settings)
    safe_pr_ready_fields = {"safe_pr_ready", "safe_pr_url", "safe_pr_evidence"}
    wave_requires_safe_pr = any(
        isinstance(raw_step, dict)
        and int_field(preview_steps.get(str(raw_step.get("application_id") or ""), {}), "wave", -1)
        == wave
        and safe_pr_gate_required(settings, raw_step)
        for raw_step in plan.get("steps", [])
    )
    if wave_requires_safe_pr:
        for field in safe_pr_ready_fields:
            if field in sanitized_settings:
                sanitized_settings.pop(field, None)
                changed = True
    steps: list[dict[str, Any]] = []
    for raw_step in plan.get("steps", []):
        if not isinstance(raw_step, dict):
            continue
        step = raw_step
        application_id = str(step.get("application_id") or "")
        preview_step = preview_steps.get(application_id, {})
        if int_field(preview_step, "wave", -1) == wave and safe_pr_gate_required(settings, step):
            config = {
                key: value
                for key, value in step_config(step).items()
                if key not in safe_pr_ready_fields
            }
            evidence = safe_pr_created_evidence_for_step(db, workspace_id, plan, step)
            pr_url = str(evidence.get("pr_url") or "") if evidence else ""
            if pr_url:
                config = {
                    **config,
                    "safe_pr_ready": True,
                    "safe_pr_url": pr_url,
                    "safe_pr_evidence": evidence,
                }
            if config != step_config(step):
                step = {**step, "config": config}
                changed = True
        steps.append(step)
    if changed:
        return {**plan, "settings": sanitized_settings, "steps": steps}
    return plan


def safe_pr_gate_required(settings: dict[str, Any], step: dict[str, Any]) -> bool:
    config = step_config(step)
    gate = str(config.get("approval_gate") or "inherit")
    policy = str(settings.get("approval_policy") or "auto_safe")
    return (gate if gate != "inherit" else policy) == "safe_pr"


def safe_pr_created_evidence_for_step(
    db: Any,
    workspace_id: str,
    plan: dict[str, Any],
    step: dict[str, Any],
) -> dict[str, Any] | None:
    application_id = str(step.get("application_id") or "") or None
    expected = safe_pr_expected_evidence(plan, step, workspace_id, db)
    for workflow_run_id in safe_pr_workflow_run_ids(plan, step, workspace_id, db):
        for evidence in safe_pr_evidence_candidates(
            db, workspace_id, workflow_run_id, application_id=application_id
        ):
            if safe_pr_evidence_matches(evidence, expected):
                return dict(evidence)
    return None


def release_safe_pr_evidence_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
    *,
    workspace_id: str,
    db: Any,
) -> list[str]:
    if db is None or not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    preview_steps = {
        str(step.get("application_id") or ""): step
        for step in preview.get("steps", [])
        if isinstance(step, dict)
    }
    blockers: list[str] = []
    for step in plan.get("steps", []):
        if not isinstance(step, dict) or not safe_pr_gate_required(settings, step):
            continue
        application_id = str(step.get("application_id") or "")
        preview_step = preview_steps.get(application_id, {})
        if int_field(preview_step, "wave", -1) != wave:
            continue
        expected = safe_pr_expected_evidence(plan, step, workspace_id, db)
        workflow_run_ids = safe_pr_workflow_run_ids(plan, step, workspace_id, db)
        if not workflow_run_ids:
            blockers.append(
                f"Application {application_id} requires Safe PR evidence, but no workflow_run_id was derived."
            )
            continue
        candidates: list[dict[str, Any]] = []
        for workflow_run_id in workflow_run_ids:
            candidates.extend(
                safe_pr_evidence_candidates(
                    db, workspace_id, workflow_run_id, application_id=application_id
                )
            )
        if any(safe_pr_evidence_matches(candidate, expected) for candidate in candidates):
            continue
        workflow_label = ", ".join(workflow_run_ids)
        if not candidates:
            blockers.append(
                f"Application {application_id} requires Safe PR evidence for workflow_run_id {workflow_label}, "
                "but no safe_pr.created event was found."
            )
            continue
        reasons = safe_pr_evidence_mismatch_reasons(candidates[0], expected)
        reason_text = (
            "; ".join(reasons[:4])
            if reasons
            else "candidate evidence did not match server expectations"
        )
        blockers.append(
            f"Application {application_id} found {len(candidates)} Safe PR candidate(s) for workflow_run_id "
            f"{workflow_label}, but none matched: {reason_text}."
        )
    return blockers


def safe_pr_evidence_candidates(
    db: Any,
    workspace_id: str,
    workflow_run_id: str,
    *,
    application_id: str | None,
) -> list[dict[str, Any]]:
    lister = getattr(db, "list_release_safe_pr_evidence", None)
    if callable(lister):
        candidates = lister(
            workspace_id,
            workflow_run_id,
            application_id=application_id,
            limit=SAFE_PR_EVIDENCE_LOOKUP_LIMIT,
        )
        if isinstance(candidates, Iterable) and not isinstance(candidates, (bytes, str, dict)):
            return [dict(candidate) for candidate in candidates if isinstance(candidate, dict)]
    finder = getattr(db, "find_release_safe_pr_evidence", None)
    if callable(finder):
        evidence = finder(workspace_id, workflow_run_id, application_id=application_id)
        if isinstance(evidence, dict):
            return [dict(evidence)]
    return []


def safe_pr_workflow_run_id(
    plan: dict[str, Any],
    step: dict[str, Any],
    workspace_id: str,
    db: Any,
) -> str:
    ids = safe_pr_workflow_run_ids(plan, step, workspace_id, db)
    return ids[0] if ids else ""


def safe_pr_workflow_run_ids(
    plan: dict[str, Any],
    step: dict[str, Any],
    workspace_id: str,
    db: Any,
) -> list[str]:
    config = step_config(step)
    settings = plan_settings_value(plan)
    explicit = str(
        config.get("safe_pr_workflow_run_id")
        or config.get("workflow_run_id")
        or settings.get("safe_pr_workflow_run_id")
        or ""
    ).strip()
    if explicit:
        return [explicit]
    application_id = str(step.get("application_id") or "")
    application = release_application_context(db, workspace_id, application_id)
    manifest_paths = [
        str(config.get("manifest_path") or application.get("manifest_path") or "").strip(),
        generated_safe_pr_manifest_path(plan, step, application),
    ]
    workflow_ids: list[str] = []
    for manifest_path in manifest_paths:
        if not manifest_path:
            continue
        workflow_id = derive_workflow_run_id(
            safe_pr_workflow_basis(
                plan,
                step,
                application,
                workspace_id,
                manifest_path=manifest_path,
            )
        )
        if workflow_id not in workflow_ids:
            workflow_ids.append(workflow_id)
    return workflow_ids


def safe_pr_expected_evidence(
    plan: dict[str, Any],
    step: dict[str, Any],
    workspace_id: str,
    db: Any,
) -> dict[str, Any]:
    config = step_config(step)
    settings = plan_settings_value(plan)
    application_id = str(step.get("application_id") or "")
    application = release_application_context(db, workspace_id, application_id)
    manifest_paths = [
        str(config.get("manifest_path") or application.get("manifest_path") or "").strip(),
        generated_safe_pr_manifest_path(plan, step, application),
    ]
    rollback_required = release_step_targets_production(plan, step)
    return {
        "provider": str(
            config.get("scm_provider") or settings.get("scm_provider") or GitHub.PROVIDER
        ).lower(),
        "pr_url": str(config.get("safe_pr_url") or settings.get("safe_pr_url") or "").strip(),
        "repo_ref": str(config.get("repo_ref") or application.get("repo_ref") or "").strip(),
        "base_branch": str(config.get("branch") or application.get("branch") or "main").strip(),
        "manifest_paths": [path for path in manifest_paths if path],
        "environment": str(
            config.get("environment") or first_environment(settings) or "sandbox"
        ).strip(),
        "commit_sha": str(config.get("commit_sha") or settings.get("commit_sha") or "").strip(),
        "patch_sha256": generated_safe_pr_patch_sha256(
            plan, step, application, workspace_id=workspace_id
        ),
        "rollback_required": rollback_required,
        "rollback_available": (not rollback_required)
        or generated_safe_pr_rollback_patch_available(
            plan, step, application, workspace_id=workspace_id
        ),
    }


def safe_pr_evidence_matches(evidence: dict[str, Any], expected: dict[str, Any]) -> bool:
    if not str(evidence.get("pr_url") or "").strip():
        return False
    if not safe_pr_evidence_is_current(evidence):
        return False
    if not safe_pr_required_evidence_field_matches(evidence, expected, "provider"):
        return False
    if not safe_pr_evidence_field_matches(evidence, expected, "pr_url"):
        return False
    if not safe_pr_required_evidence_field_matches(evidence, expected, "repo_ref"):
        return False
    if not safe_pr_evidence_pr_url_matches_provider(evidence, expected):
        return False
    if not safe_pr_required_evidence_field_matches(evidence, expected, "base_branch"):
        return False
    if not safe_pr_required_evidence_field_matches(evidence, expected, "commit_sha"):
        return False
    if not safe_pr_required_evidence_field_matches(evidence, expected, "patch_sha256"):
        return False
    if bool(expected.get("rollback_required")) and not bool(expected.get("rollback_available")):
        return False
    evidence_manifest_path = str(evidence.get("manifest_path") or "").strip()
    expected_manifest_paths = {
        str(path).strip() for path in expected.get("manifest_paths", []) if str(path).strip()
    }
    if not expected_manifest_paths or evidence_manifest_path not in expected_manifest_paths:
        return False
    evidence_environment = str(evidence.get("environment") or "").strip()
    expected_environment = str(expected.get("environment") or "").strip()
    return bool(
        evidence_environment
        and expected_environment
        and evidence_environment == expected_environment
    )


def safe_pr_evidence_mismatch_reasons(
    evidence: dict[str, Any], expected: dict[str, Any]
) -> list[str]:
    reasons: list[str] = []
    if not str(evidence.get("pr_url") or "").strip():
        reasons.append("pr_url is missing")
    if not safe_pr_evidence_is_current(evidence):
        reasons.append("created_at is missing, stale, or in the future")
    for field in ("provider", "repo_ref", "base_branch", "commit_sha", "patch_sha256"):
        if not safe_pr_required_evidence_field_matches(evidence, expected, field):
            reasons.append(safe_pr_evidence_field_reason(evidence, expected, field))
    if not safe_pr_evidence_field_matches(evidence, expected, "pr_url"):
        reasons.append(safe_pr_evidence_field_reason(evidence, expected, "pr_url"))
    if not safe_pr_evidence_pr_url_matches_provider(evidence, expected):
        reasons.append("pr_url path does not match the expected GitHub repo_ref")
    evidence_manifest_path = str(evidence.get("manifest_path") or "").strip()
    expected_manifest_paths = {
        str(path).strip() for path in expected.get("manifest_paths", []) if str(path).strip()
    }
    if not expected_manifest_paths:
        reasons.append("expected manifest_path could not be derived")
    elif evidence_manifest_path not in expected_manifest_paths:
        reasons.append(
            "manifest_path expected one of "
            f"{safe_pr_short_values(sorted(expected_manifest_paths))} but got {safe_pr_short_value(evidence_manifest_path)}"
        )
    evidence_environment = str(evidence.get("environment") or "").strip()
    expected_environment = str(expected.get("environment") or "").strip()
    if (
        not evidence_environment
        or not expected_environment
        or evidence_environment != expected_environment
    ):
        reasons.append(
            f"environment expected {safe_pr_short_value(expected_environment)} but got "
            f"{safe_pr_short_value(evidence_environment)}"
        )
    return unique_non_empty(reasons)


def safe_pr_evidence_field_reason(
    evidence: dict[str, Any], expected: dict[str, Any], field: str
) -> str:
    return (
        f"{field} expected {safe_pr_short_value(str(expected.get(field) or '').strip())} "
        f"but got {safe_pr_short_value(str(evidence.get(field) or '').strip())}"
    )


def safe_pr_short_values(values: list[str]) -> str:
    return ", ".join(safe_pr_short_value(value) for value in values[:3])


def safe_pr_short_value(value: str) -> str:
    if not value:
        return "<missing>"
    if len(value) <= 32:
        return value
    return f"{value[:16]}...{value[-8:]}"


def safe_pr_evidence_is_current(evidence: dict[str, Any]) -> bool:
    created_at = parse_release_window_time(evidence.get("created_at"))
    if created_at is None:
        return False
    now = datetime.now(UTC)
    if created_at.astimezone(UTC) > now + timedelta(minutes=APPROVAL_CLOCK_SKEW_MINUTES):
        return False
    return now - created_at.astimezone(UTC) <= safe_pr_evidence_max_age()


def safe_pr_evidence_max_age() -> timedelta:
    try:
        hours = float(
            os.getenv(
                SAFE_PR_EVIDENCE_MAX_AGE_HOURS_ENV, str(DEFAULT_SAFE_PR_EVIDENCE_MAX_AGE_HOURS)
            )
        )
    except ValueError:
        hours = float(DEFAULT_SAFE_PR_EVIDENCE_MAX_AGE_HOURS)
    return timedelta(hours=max(1.0, hours))


def safe_pr_evidence_field_matches(
    evidence: dict[str, Any],
    expected: dict[str, Any],
    field: str,
) -> bool:
    expected_value = str(expected.get(field) or "").strip()
    evidence_value = str(evidence.get(field) or "").strip()
    return not expected_value or evidence_value == expected_value


def safe_pr_evidence_pr_url_matches_provider(
    evidence: dict[str, Any],
    expected: dict[str, Any],
) -> bool:
    provider = str(expected.get("provider") or "").strip().lower()
    if provider != GitHub.PROVIDER:
        return True
    repo_ref = str(expected.get("repo_ref") or "").strip()
    if "/" not in repo_ref:
        return False
    parsed = urlparse(str(evidence.get("pr_url") or "").strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    path_parts = [unquote(part).lower() for part in parsed.path.split("/") if part]
    owner, repo = [part.lower() for part in repo_ref.split("/", 1)]
    return (
        len(path_parts) >= 4
        and path_parts[0] == owner
        and path_parts[1] == repo
        and path_parts[2] == "pull"
        and path_parts[3].isdigit()
    )


def safe_pr_required_evidence_field_matches(
    evidence: dict[str, Any],
    expected: dict[str, Any],
    field: str,
) -> bool:
    expected_value = str(expected.get(field) or "").strip()
    evidence_value = str(evidence.get(field) or "").strip()
    return bool(expected_value and evidence_value and evidence_value == expected_value)


def generated_safe_pr_manifest_path(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
) -> str:
    step_index = release_step_index(plan, step)
    if step_index < 0:
        return ""
    rendered = render_release_step_manifest(plan, step_index, application)
    files = rendered.get("files")
    if not isinstance(files, list) or not files or not isinstance(files[0], dict):
        return ""
    return str(files[0].get("path") or "").strip()


def generated_safe_pr_patch_sha256(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    *,
    workspace_id: str = DEFAULT_WORKSPACE_ID,
) -> str:
    step_index = release_step_index(plan, step)
    if step_index < 0:
        return ""
    rendered = render_release_step_manifest(plan, step_index, application)
    patches = [
        SafePrFilePatch(
            path=str(file.get("path") or ""),
            content=str(file.get("content") or ""),
            description=str(file.get("description") or "Generated release manifest"),
        )
        for file in rendered.get("files", [])
        if isinstance(file, dict) and file.get("content")
    ]
    manifest_path = str(
        patches[0].path if patches else generated_safe_pr_manifest_path(plan, step, application)
    )
    workflow_run_id = derive_workflow_run_id(
        safe_pr_workflow_basis(
            plan,
            step,
            application,
            workspace_id,
            manifest_path=manifest_path,
        )
    )
    patches.extend(
        generated_manifest_rollback_patches(
            plan,
            step,
            application,
            manifest_path=manifest_path,
            workflow_run_id=workflow_run_id,
        )
    )
    return safe_pr_patch_sha256(patches) if patches else ""


def generated_safe_pr_rollback_patch_available(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    *,
    workspace_id: str = DEFAULT_WORKSPACE_ID,
) -> bool:
    manifest_path = generated_safe_pr_manifest_path(plan, step, application)
    if not manifest_path:
        return False
    workflow_run_id = derive_workflow_run_id(
        safe_pr_workflow_basis(
            plan,
            step,
            application,
            workspace_id,
            manifest_path=manifest_path,
        )
    )
    return bool(
        generated_manifest_rollback_patches(
            plan,
            step,
            application,
            manifest_path=manifest_path,
            workflow_run_id=workflow_run_id,
        )
    )


def release_step_index(plan: dict[str, Any], step: dict[str, Any]) -> int:
    for index, candidate in enumerate(plan.get("steps", [])):
        if candidate is step:
            return index
        if isinstance(candidate, dict) and candidate == step:
            return index
    return -1


def safe_pr_workflow_basis(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    workspace_id: str,
    *,
    manifest_path: str,
) -> dict[str, Any]:
    config = step_config(step)
    settings = plan_settings_value(plan)
    application_id = str(step.get("application_id") or "")
    return {
        "workspace_id": workspace_id,
        "repo_ref": str(config.get("repo_ref") or application.get("repo_ref") or ""),
        "branch": str(config.get("branch") or application.get("branch") or "main"),
        "manifest_path": manifest_path,
        "cluster_id": str(
            config.get("cluster_id") or application.get("cluster_id") or Target.DEFAULT_CLUSTER_ID
        ),
        "namespace": str(
            config.get("namespace") or application.get("namespace") or Sandbox.NAMESPACE
        ),
        "app_name": str(application.get("name") or step.get("name") or application_id),
        "application_id": application_id,
        "environment": str(config.get("environment") or first_environment(settings) or "sandbox"),
        "commit_sha": str(config.get("commit_sha") or settings.get("commit_sha") or ""),
    }


def release_application_context(db: Any, workspace_id: str, application_id: str) -> dict[str, Any]:
    getter = getattr(db, "get_application", None)
    if not callable(getter) or not application_id:
        return {}
    application = getter(workspace_id, application_id)
    return dict(application) if isinstance(application, dict) else {}


def release_readiness_from_plan(
    plan: dict[str, Any],
    preview: dict[str, Any],
    *,
    workspace_id: str,
    db: Any,
) -> dict[str, Any]:
    first_wave = first_preview_wave(preview)
    profile = execution_profile(plan)
    preview_blockers = [str(item) for item in preview.get("blockers", [])]
    required_blockers = required_release_input_blockers(plan)
    context_blockers = release_dispatch_context_blockers(
        plan,
        [step for step in plan.get("steps", []) if isinstance(step, dict)],
        db,
        workspace_id,
    )
    active_run_blockers = active_release_run_blockers(db, workspace_id, plan)
    execution_blockers = release_execution_blockers(
        plan,
        preview,
        first_wave,
        workspace_id=workspace_id,
        db=db,
    )
    if any("requires a ready Safe PR" in blocker for blocker in execution_blockers):
        execution_blockers.extend(
            release_safe_pr_evidence_blockers(
                plan,
                preview,
                first_wave,
                workspace_id=workspace_id,
                db=db,
            )
        )
    approval_evidence_blockers = release_production_approval_evidence_blockers(
        plan, preview, first_wave
    )
    change_ticket_blockers = release_production_change_ticket_blockers(plan, preview, first_wave)
    change_ticket_bypassed = release_production_change_ticket_bypassed(plan, preview, first_wave)
    window_blockers = release_production_window_blockers(plan, preview, first_wave)
    window_bypassed = release_production_window_bypassed(plan, preview, first_wave)
    freeze_blockers = release_production_freeze_blockers(plan, preview, first_wave)
    freeze_bypassed = release_production_freeze_bypassed(plan, preview, first_wave)
    runbook_blockers = release_production_runbook_blockers(plan, preview, first_wave)
    runbook_bypassed = release_production_runbook_bypassed(plan, preview, first_wave)
    owner_blockers = release_production_owner_blockers(plan, preview, first_wave)
    verification_blockers = release_production_verification_blockers(plan, preview, first_wave)
    verification_bypassed = release_production_verification_bypassed(plan, preview, first_wave)
    abort_criteria_blockers = release_production_abort_criteria_blockers(plan, preview, first_wave)
    abort_criteria_bypassed = release_production_abort_criteria_bypassed(plan, preview, first_wave)
    diagnostic_blockers = release_diagnostics_blockers(plan)
    diagnostic_bypassed = release_diagnostics_bypassed(plan)
    rollback_blockers = release_rollback_policy_blockers(plan)
    rollback_bypassed = release_rollback_policy_bypassed(plan)
    alert_channels = enabled_alert_channels(db, workspace_id)
    live_alert_channels = release_live_alert_channels(db, workspace_id)
    validated_live_alert_channels = release_validated_live_alert_channels(db, workspace_id)
    alert_blockers = release_live_alert_channel_blockers(plan, db, workspace_id)
    retry_attempts = max(0, int_field(plan_settings_value(plan), "retry_attempts", 1))
    alert_validation_window = alert_channel_validation_window_label()
    if profile.side_effects and validated_live_alert_channels:
        alert_message = (
            f"{len(validated_live_alert_channels)} validated alert channel(s) can receive "
            f"warning-or-higher release events within {alert_validation_window}."
        )
    elif profile.side_effects and live_alert_channels:
        alert_message = (
            "Warning-capable alert channels exist, but none has a passing validation test "
            f"within {alert_validation_window}."
        )
    elif live_alert_channels:
        alert_message = (
            f"{len(live_alert_channels)} enabled alert channel(s) can receive "
            "warning-or-higher release events."
        )
    elif alert_channels:
        alert_message = "Enabled alert channels exist, but none receive warning release events."
    else:
        alert_message = (
            "No enabled alert channel is configured for release failure or approval events."
        )

    checks = [
        readiness_check(
            "plan.preview",
            "Plan graph",
            "blocked" if preview_blockers else "passed",
            "Resolve dependency graph blockers before execution."
            if preview_blockers
            else str(preview.get("summary") or "Plan graph can be executed."),
            preview_blockers,
        ),
        readiness_check(
            "plan.required_inputs",
            "Dispatch inputs",
            "blocked" if required_blockers else "passed",
            "Commit SHA and image are required before dispatch."
            if required_blockers
            else "All release steps have the required dispatch inputs.",
            required_blockers,
        ),
        readiness_check(
            "plan.application_context",
            "Application context",
            "blocked" if context_blockers else "passed",
            "Registered application, repository, manifest, and cluster context are required."
            if context_blockers
            else "All release steps resolve to registered application deployment context.",
            context_blockers,
        ),
        readiness_check(
            "plan.active_run_lock",
            "Active run lock",
            "blocked" if active_run_blockers else "passed",
            "This saved release plan already has an active run."
            if active_run_blockers
            else "No active run is blocking this release plan.",
            active_run_blockers,
        ),
        readiness_check(
            "live.dispatch_gate",
            "Live dispatch gate",
            "blocked" if execution_blockers else "passed",
            "Backend live-mode guard or release policy gate is blocking dispatch."
            if execution_blockers
            else f"{profile.label} is allowed for the first executable wave.",
            execution_blockers,
        ),
        readiness_check(
            "approval.evidence",
            "Approval evidence",
            "blocked" if approval_evidence_blockers else "passed",
            "Production approval requires approver, reason, and recent approval time before live dispatch."
            if approval_evidence_blockers
            else f"Approval evidence is complete and recent within {approval_max_age_label()}.",
            approval_evidence_blockers,
        ),
        readiness_check(
            "change.ticket",
            "Change ticket",
            "blocked"
            if change_ticket_blockers
            else "warning"
            if change_ticket_bypassed
            else "passed",
            "Production live release requires a change ticket or override reason."
            if change_ticket_blockers
            else "Production change ticket gate is bypassed with an operator reason."
            if change_ticket_bypassed
            else "Change ticket requirements are satisfied for the first executable wave.",
            change_ticket_blockers,
        ),
        readiness_check(
            "release.window",
            "Release window",
            "blocked" if window_blockers else "warning" if window_bypassed else "passed",
            "Production live release must run inside an approved release window."
            if window_blockers
            else "Production release window is bypassed with an operator reason."
            if window_bypassed
            else "Release window requirements are satisfied for the first executable wave.",
            window_blockers,
        ),
        readiness_check(
            "change.freeze",
            "Change freeze",
            "blocked" if freeze_blockers else "warning" if freeze_bypassed else "passed",
            "Production live release is inside a change freeze window."
            if freeze_blockers
            else "Production change freeze is bypassed with an operator reason."
            if freeze_bypassed
            else "No active production change freeze blocks this release.",
            freeze_blockers,
        ),
        readiness_check(
            "runbook.sop",
            "Runbook",
            "blocked" if runbook_blockers else "warning" if runbook_bypassed else "passed",
            "Production live release requires an accessible runbook URL or operator override reason."
            if runbook_blockers
            else "Production runbook gate is bypassed with an operator reason."
            if runbook_bypassed
            else "Runbook/SOP evidence is present for the first executable wave.",
            runbook_blockers,
        ),
        readiness_check(
            "owner.contact",
            "Owner contact",
            "blocked" if owner_blockers else "passed",
            "Production live release requires a release owner or on-call contact."
            if owner_blockers
            else "Release owner/on-call contact is present for the first executable wave.",
            owner_blockers,
        ),
        readiness_check(
            "verification.plan",
            "Post-deploy verification",
            "blocked"
            if verification_blockers
            else "warning"
            if verification_bypassed
            else "passed",
            "Production live release requires a live https post_deploy_verification_url."
            if verification_blockers
            else "Post-deploy verification gate is bypassed with an operator reason."
            if verification_bypassed
            else "Post-deploy verification evidence is present for the first executable wave.",
            verification_blockers,
        ),
        readiness_check(
            "rollback.abort_criteria",
            "Rollback criteria",
            "blocked"
            if abort_criteria_blockers
            else "warning"
            if abort_criteria_bypassed
            else "passed",
            "Production live release requires rollback_trigger or abort_criteria."
            if abort_criteria_blockers
            else "Rollback criteria gate is bypassed with an operator reason."
            if abort_criteria_bypassed
            else "Rollback/abort criteria are present for the first executable wave.",
            abort_criteria_blockers,
        ),
        readiness_check(
            "plan.diagnostics",
            "Diagnostics gate",
            "blocked" if diagnostic_blockers else "warning" if diagnostic_bypassed else "passed",
            "Deterministic release diagnostics must be resolved before live dispatch."
            if diagnostic_blockers
            else "Diagnostics gate is bypassed with an operator reason."
            if diagnostic_bypassed
            else "Release diagnostics do not block live dispatch.",
            diagnostic_blockers,
        ),
        readiness_check(
            "rollback.policy",
            "Rollback policy",
            "blocked" if rollback_blockers else "warning" if rollback_bypassed else "passed",
            "Live release cannot disable rollback without an operator reason."
            if rollback_blockers
            else "Rollback policy is disabled with an operator reason."
            if rollback_bypassed
            else "Rollback policy is available for this release.",
            rollback_blockers,
        ),
        readiness_check(
            "alerts.enabled_channels",
            "Alert channels",
            "blocked" if alert_blockers else "passed" if alert_channels else "warning",
            alert_message,
            alert_blockers,
        ),
        readiness_check(
            "retry.policy",
            "Retry policy",
            "passed" if retry_attempts > 0 else "warning",
            f"Failed waves can be retried {retry_attempts} time(s)."
            if retry_attempts > 0
            else "Failed waves cannot be retried automatically from this plan.",
        ),
        readiness_check(
            "audit.redaction",
            "Audit and redaction",
            "passed",
            "Run events are audit-exportable and sensitive event details are redacted.",
        ),
    ]
    blockers = [
        item
        for check in checks
        for item in check.get("blockers", [])
        if check["status"] == "blocked"
    ]
    warnings = [str(check["message"]) for check in checks if check["status"] == "warning"]
    if blockers:
        summary = f"{len(blockers)} blocker(s) must be resolved before release dispatch."
    elif warnings:
        summary = f"Runnable with {len(warnings)} operational warning(s)."
    else:
        summary = f"Ready for {profile.label.lower()}."
    return {
        "ready": not blockers,
        "mode": profile.runtime_mode,
        "summary": summary,
        "checks": checks,
        "impact": release_readiness_impact(plan, preview, profile),
        "next_actions": release_readiness_next_actions(checks),
        "blockers": blockers,
        "warnings": warnings,
    }


def readiness_check(
    check_id: str,
    name: str,
    status: str,
    message: str,
    blockers: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "check_id": check_id,
        "name": name,
        "status": status,
        "message": message,
        "blockers": blockers or [],
    }


def release_readiness_impact(
    plan: dict[str, Any], preview: dict[str, Any], profile: Any
) -> dict[str, Any]:
    preview_steps = [step for step in preview.get("steps", []) if isinstance(step, dict)]
    waves = sorted(
        {int_field(step, "wave", 0) for step in preview_steps if int_field(step, "wave", 0) > 0}
    )
    applications = unique_non_empty(str(step.get("application_id") or "") for step in preview_steps)
    environments = unique_non_empty(str(step.get("environment") or "") for step in preview_steps)
    first_wave = waves[0] if waves else first_preview_wave(preview)
    first_wave_steps = [
        readiness_impact_step(step)
        for step in preview_steps
        if int_field(step, "wave", first_wave) == first_wave
    ]
    production_targets = [
        {
            "application_id": str(step.get("application_id") or ""),
            "name": str(step.get("name") or step.get("application_id") or ""),
            "environment": str(
                step_config(step).get("environment")
                or plan_settings_value(plan).get("environment")
                or ""
            ),
        }
        for step in plan.get("steps", [])
        if isinstance(step, dict) and release_step_targets_production(plan, step)
    ]
    production_labels = unique_non_empty(
        str(item.get("name") or item.get("application_id") or "") for item in production_targets
    )
    return {
        "summary": release_readiness_impact_summary(
            len(preview_steps),
            len(applications),
            len(environments),
            len(waves),
            len(production_targets),
            bool(getattr(profile, "side_effects", False)),
        ),
        "runtime_mode": str(getattr(profile, "runtime_mode", "")),
        "live_side_effects": bool(getattr(profile, "side_effects", False)),
        "total_steps": len(preview_steps),
        "total_waves": len(waves),
        "first_wave": first_wave,
        "applications": applications,
        "environments": environments,
        "production_targets": production_labels,
        "production_target_count": len(production_targets),
        "first_wave_steps": first_wave_steps,
    }


def readiness_impact_step(step: dict[str, Any]) -> dict[str, Any]:
    return {
        "step_id": str(step.get("step_id") or ""),
        "application_id": str(step.get("application_id") or ""),
        "name": str(step.get("name") or step.get("application_id") or ""),
        "environment": str(step.get("environment") or ""),
        "action": str(step.get("action") or ""),
        "strategy": str(step.get("strategy") or ""),
        "wave": int_field(step, "wave", 0) or None,
    }


def release_readiness_impact_summary(
    step_count: int,
    application_count: int,
    environment_count: int,
    wave_count: int,
    production_target_count: int,
    live_side_effects: bool,
) -> str:
    mode_label = "live" if live_side_effects else "dry-run"
    production_label = (
        f", {production_target_count} production target(s)" if production_target_count else ""
    )
    return (
        f"{mode_label} impact covers {step_count} step(s), {application_count} application(s), "
        f"{environment_count} environment(s), and {wave_count} wave(s){production_label}."
    )


def unique_non_empty(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def release_readiness_next_actions(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for check in checks:
        status = str(check.get("status") or "")
        if status not in {"blocked", "warning"}:
            continue
        check_id = str(check.get("check_id") or "")
        name = str(check.get("name") or check_id or "Readiness check")
        blockers = [str(item) for item in check.get("blockers", [])]
        verb = "Resolve" if status == "blocked" else "Review"
        actions.append(
            {
                "action_id": f"{status}.{check_id}" if check_id else status,
                "check_id": check_id,
                "label": f"{verb} {name}",
                "severity": status,
                "message": str(check.get("message") or ""),
                "blockers": blockers,
            }
        )
    return actions


def required_release_input_blockers(plan: dict[str, Any]) -> list[str]:
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for index, step in enumerate(plan.get("steps", []), start=1):
        if not isinstance(step, dict):
            continue
        config = step_config(step)
        label = str(step.get("name") or step.get("application_id") or f"step {index}")
        for field in ("commit_sha", "image"):
            if not str(config.get(field) or settings.get(field) or "").strip():
                blockers.append(f"{label} is missing {field}.")
    return blockers


def release_diagnostics_blockers(plan: dict[str, Any]) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    if settings.get("require_diagnostics_pass") is False:
        if not release_diagnostics_override_reason(plan):
            return [
                "Live release dispatch cannot bypass diagnostics without a diagnostics override reason."
            ]
        return []
    diagnostics = release_plan_diagnostics(plan)
    blockers: list[str] = []
    for diagnostic in diagnostics:
        if diagnostic.severity not in {"error", "warning"}:
            continue
        location = f" at {diagnostic.path}" if diagnostic.path else ""
        blockers.append(
            f"Release diagnostics must pass before live dispatch: "
            f"{diagnostic.code}{location} - {diagnostic.message}"
        )
    return blockers


def release_diagnostics_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("diagnostics_override_reason")
        or settings.get("diagnostics_bypass_reason")
        or ""
    ).strip()


def release_diagnostics_bypassed(plan: dict[str, Any]) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    settings = plan_settings_value(plan)
    return settings.get("require_diagnostics_pass") is False and bool(
        release_diagnostics_override_reason(plan)
    )


def release_rollback_policy_blockers(plan: dict[str, Any]) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    if str(settings.get("rollback_policy") or "manual") != "disabled":
        return []
    if release_rollback_override_reason(plan):
        return []
    return ["Live release dispatch cannot disable rollback without a rollback override reason."]


def release_rollback_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("rollback_override_reason") or settings.get("rollback_disabled_reason") or ""
    ).strip()


def release_rollback_policy_bypassed(plan: dict[str, Any]) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    settings = plan_settings_value(plan)
    return str(settings.get("rollback_policy") or "manual") == "disabled" and bool(
        release_rollback_override_reason(plan)
    )


def release_production_approval_evidence_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        if not approval_granted(settings, config):
            continue
        missing = []
        if not release_approval_granted_by(settings, config):
            missing.append("approval_granted_by")
        if not release_approval_reason(settings, config):
            missing.append("approval_reason")
        approval_time = release_approval_granted_at(settings, config)
        if approval_time is None:
            missing.append("approval_granted_at")
        if missing:
            label = str(step.get("name") or step.get("application_id") or "release step")
            blockers.append(
                f"{label} targets production and requires approval evidence "
                f"({', '.join(missing)}) before live dispatch."
            )
            continue
        if approval_time and release_approval_is_in_future(approval_time):
            label = str(step.get("name") or step.get("application_id") or "release step")
            blockers.append(f"{label} targets production but approval evidence is in the future.")
        elif approval_time and release_approval_is_expired(approval_time):
            label = str(step.get("name") or step.get("application_id") or "release step")
            blockers.append(
                f"{label} targets production but approval evidence is older than "
                f"{approval_max_age_label()}."
            )
    return blockers


def release_approval_granted_by(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(
        config.get("approval_granted_by") or settings.get("approval_granted_by") or ""
    ).strip()


def release_approval_reason(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(config.get("approval_reason") or settings.get("approval_reason") or "").strip()


def release_approval_granted_at(
    settings: dict[str, Any],
    config: dict[str, Any],
) -> datetime | None:
    return parse_release_window_time(
        config.get("approval_granted_at") or settings.get("approval_granted_at")
    )


def release_approval_granted_at_label(settings: dict[str, Any]) -> str | None:
    granted_at = parse_release_window_time(settings.get("approval_granted_at"))
    return release_window_bound_label(granted_at) if granted_at else None


def release_approval_is_expired(granted_at: datetime) -> bool:
    age = datetime.now(UTC) - granted_at.astimezone(UTC)
    return age > approval_max_age()


def release_approval_is_in_future(granted_at: datetime) -> bool:
    skew = timedelta(minutes=APPROVAL_CLOCK_SKEW_MINUTES)
    return granted_at.astimezone(UTC) > datetime.now(UTC) + skew


def approval_max_age() -> timedelta:
    raw = os.getenv(APPROVAL_MAX_AGE_HOURS_ENV, str(DEFAULT_APPROVAL_MAX_AGE_HOURS)).strip()
    try:
        hours = float(raw)
    except ValueError:
        hours = float(DEFAULT_APPROVAL_MAX_AGE_HOURS)
    return timedelta(hours=max(1.0, hours))


def approval_max_age_label() -> str:
    hours = approval_max_age().total_seconds() / 3600
    if hours.is_integer():
        return f"{int(hours)} hour(s)"
    return f"{hours:.1f} hour(s)"


def release_production_change_ticket_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        label = str(step.get("name") or step.get("application_id") or "release step")
        placeholder = placeholder_change_ticket(settings, config)
        if placeholder:
            blockers.append(
                f"{label} targets production and must not use placeholder change ticket {placeholder}."
            )
            continue
        if has_change_ticket(settings, config) or release_production_change_override_reason(plan):
            continue
        blockers.append(
            f"{label} targets production and requires a change ticket before live dispatch."
        )
    return blockers


def release_production_change_ticket_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    if not release_production_change_override_reason(plan):
        return False
    settings = plan_settings_value(plan)
    return any(
        not has_change_ticket(settings, step_config(step))
        for step in release_production_steps_for_wave(plan, preview, wave)
    )


def release_production_change_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("production_change_override_reason")
        or settings.get("change_ticket_override_reason")
        or ""
    ).strip()


def release_production_window_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    if not release_production_steps_for_wave(plan, preview, wave):
        return []
    if release_window_override_reason(plan):
        return []
    start, end = release_window_bounds(plan)
    if start is None or end is None:
        return [
            "Production live release requires release_window_start and release_window_end or a release window override reason."
        ]
    if end <= start:
        return ["Production live release window end must be after the start time."]
    now = datetime.now(UTC)
    if not (start <= now <= end):
        return [
            "Production live release is outside the approved release window "
            f"({release_window_bound_label(start)} to {release_window_bound_label(end)} UTC)."
        ]
    return []


def release_production_window_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    return bool(release_production_steps_for_wave(plan, preview, wave)) and bool(
        release_window_override_reason(plan)
    )


def release_production_freeze_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    if not release_production_steps_for_wave(plan, preview, wave):
        return []
    if release_freeze_override_reason(plan):
        return []
    start, end = release_freeze_window_bounds(plan)
    has_any_bound = start is not None or end is not None
    if not has_any_bound:
        return []
    if start is None or end is None:
        return [
            "Production change freeze requires both change_freeze_start and change_freeze_end or a change freeze override reason."
        ]
    if end <= start:
        return ["Production change freeze end must be after the start time."]
    now = datetime.now(UTC)
    if start <= now <= end:
        return [
            "Production live release is inside a change freeze window "
            f"({release_window_bound_label(start)} to {release_window_bound_label(end)} UTC) "
            "and requires a change_freeze_override_reason."
        ]
    return []


def release_production_freeze_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    if not release_production_steps_for_wave(plan, preview, wave):
        return False
    if not release_freeze_override_reason(plan):
        return False
    start, end = release_freeze_window_bounds(plan)
    return start is not None or end is not None


def release_freeze_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("change_freeze_override_reason")
        or settings.get("freeze_window_override_reason")
        or ""
    ).strip()


def release_window_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("release_window_override_reason")
        or settings.get("change_window_override_reason")
        or ""
    ).strip()


def release_production_runbook_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        url = release_runbook_url(settings, config)
        if release_runbook_url_is_valid(url):
            continue
        label = str(step.get("name") or step.get("application_id") or "release step")
        if url:
            blockers.append(
                f"{label} targets production and requires a live https runbook_url before live dispatch."
            )
        else:
            blockers.append(
                f"{label} targets production and requires live https runbook_url before live dispatch."
            )
    return blockers


def release_production_runbook_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    return False


def release_runbook_url(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(config.get("runbook_url") or settings.get("runbook_url") or "").strip()


def release_runbook_url_is_valid(value: str) -> bool:
    return release_live_evidence_url_is_valid(value)


def release_runbook_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("runbook_override_reason") or settings.get("sop_override_reason") or ""
    ).strip()


def release_production_owner_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        if release_owner_contact(settings, config):
            continue
        label = str(step.get("name") or step.get("application_id") or "release step")
        blockers.append(
            f"{label} targets production and requires release_owner or oncall_contact before live dispatch."
        )
    return blockers


def release_owner_contact(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(
        config.get("release_owner")
        or config.get("oncall_contact")
        or settings.get("release_owner")
        or settings.get("oncall_contact")
        or ""
    ).strip()


def release_production_verification_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        if release_verification_evidence_present(settings, config):
            continue
        label = str(step.get("name") or step.get("application_id") or "release step")
        blockers.append(
            f"{label} targets production and requires live https post_deploy_verification_url "
            "before live dispatch."
        )
    return blockers


def release_production_verification_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    return False


def release_verification_evidence_present(settings: dict[str, Any], config: dict[str, Any]) -> bool:
    verification_url = release_verification_url(settings, config)
    return release_verification_url_is_valid(verification_url)


def release_verification_url(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(
        config.get("post_deploy_verification_url")
        or config.get("verification_url")
        or settings.get("post_deploy_verification_url")
        or settings.get("verification_url")
        or ""
    ).strip()


def release_verification_url_is_valid(value: str) -> bool:
    return release_live_evidence_url_is_valid(value)


def release_live_evidence_url_is_valid(value: str) -> bool:
    parsed = urlparse(value.strip())
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        return False
    host = (parsed.hostname or "").lower()
    return not (
        host in PLACEHOLDER_EVIDENCE_HOSTS
        or host.endswith(".example.com")
        or host.endswith(".example.test")
        or host.endswith(".localhost")
    )


def release_verification_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("verification_override_reason")
        or settings.get("post_deploy_verification_override_reason")
        or ""
    ).strip()


def release_verification_job_specs(
    plan: dict[str, Any],
    production_steps: list[dict[str, Any]],
    wave: int,
) -> list[dict[str, Any]]:
    settings = plan_settings_value(plan)
    queued_at = release_window_bound_label(datetime.now(UTC))
    jobs: list[dict[str, Any]] = []
    for step in production_steps:
        config = step_config(step)
        application_id = str(step.get("application_id") or "").strip()
        name = str(step.get("name") or application_id or "release step")
        health_path = release_health_check_path(settings, config)
        verification_url = release_verification_url(settings, config)
        timeout_minutes = release_verification_timeout_minutes(settings, config)
        if health_path:
            jobs.append(
                {
                    "job_id": release_verification_job_id(
                        plan, wave, application_id, "health", health_path
                    ),
                    "application_id": application_id,
                    "name": name,
                    "kind": "kubernetes_health_check",
                    "status": "pending",
                    "queued_at": queued_at,
                    "timeout_minutes": timeout_minutes,
                    "evidence_key": release_verification_evidence_key(plan, wave, application_id),
                    "target": {
                        "cluster_id": str(
                            config.get("cluster_id") or settings.get("cluster_id") or ""
                        ),
                        "namespace": str(
                            config.get("namespace") or settings.get("namespace") or ""
                        ),
                        "service_name": str(
                            config.get("service_name") or config.get("service") or application_id
                        ),
                        "path": health_path,
                    },
                }
            )
        if verification_url:
            jobs.append(
                {
                    "job_id": release_verification_job_id(
                        plan, wave, application_id, "http", verification_url
                    ),
                    "application_id": application_id,
                    "name": name,
                    "kind": "http_probe",
                    "status": "pending",
                    "queued_at": queued_at,
                    "timeout_minutes": timeout_minutes,
                    "evidence_key": release_verification_evidence_key(plan, wave, application_id),
                    "target": {"url": verification_url},
                }
            )
    return jobs


def release_verification_timeout_minutes(settings: dict[str, Any], config: dict[str, Any]) -> int:
    default_timeout = int_field(
        settings,
        "post_deploy_verification_timeout_minutes",
        int_field(
            settings, "verification_timeout_minutes", DEFAULT_RELEASE_VERIFICATION_TIMEOUT_MINUTES
        ),
    )
    step_timeout = int_field(config, "verification_timeout_minutes", default_timeout)
    return max(1, int_field(config, "post_deploy_verification_timeout_minutes", step_timeout))


def release_health_check_path(settings: dict[str, Any], config: dict[str, Any]) -> str:
    value = str(config.get("health_check_path") or settings.get("health_check_path") or "").strip()
    return value if value.startswith("/") else ""


def release_verification_job_id(
    plan: dict[str, Any],
    wave: int,
    application_id: str,
    kind: str,
    target: str,
) -> str:
    raw = ":".join(
        [
            str(plan.get("plan_id") or plan.get("name") or "release-plan"),
            str(wave),
            application_id,
            kind,
            target,
        ]
    )
    return f"release-verification-{hashlib.sha256(raw.encode()).hexdigest()[:20]}"


def release_verification_evidence_key(plan: dict[str, Any], wave: int, application_id: str) -> str:
    return ":".join(
        [
            str(plan.get("plan_id") or plan.get("name") or "release-plan"),
            f"wave-{wave}",
            application_id,
            "post-deploy-verification",
        ]
    )


def release_production_abort_criteria_blockers(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    settings = plan_settings_value(plan)
    override_reason = release_abort_criteria_override_reason(plan)
    blockers: list[str] = []
    for step in release_production_steps_for_wave(plan, preview, wave):
        config = step_config(step)
        if release_abort_criteria(settings, config) or override_reason:
            continue
        label = str(step.get("name") or step.get("application_id") or "release step")
        blockers.append(
            f"{label} targets production and requires rollback_trigger, abort_criteria, "
            "or abort criteria override reason before live dispatch."
        )
    return blockers


def release_production_abort_criteria_bypassed(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> bool:
    if not execution_profile(plan).side_effects:
        return False
    if not release_abort_criteria_override_reason(plan):
        return False
    settings = plan_settings_value(plan)
    return any(
        not release_abort_criteria(settings, step_config(step))
        for step in release_production_steps_for_wave(plan, preview, wave)
    )


def release_abort_criteria(settings: dict[str, Any], config: dict[str, Any]) -> str:
    return str(
        config.get("rollback_trigger")
        or config.get("abort_criteria")
        or settings.get("rollback_trigger")
        or settings.get("abort_criteria")
        or ""
    ).strip()


def release_abort_criteria_override_reason(plan: dict[str, Any]) -> str:
    settings = plan_settings_value(plan)
    return str(
        settings.get("abort_criteria_override_reason")
        or settings.get("rollback_trigger_override_reason")
        or ""
    ).strip()


def release_window_bounds(plan: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    settings = plan_settings_value(plan)
    start = parse_release_window_time(settings.get("release_window_start"))
    end = parse_release_window_time(settings.get("release_window_end"))
    return start, end


def release_freeze_window_bounds(plan: dict[str, Any]) -> tuple[datetime | None, datetime | None]:
    settings = plan_settings_value(plan)
    start = parse_release_window_time(settings.get("change_freeze_start"))
    end = parse_release_window_time(settings.get("change_freeze_end"))
    return start, end


def release_freeze_window_is_active(plan: dict[str, Any]) -> bool:
    start, end = release_freeze_window_bounds(plan)
    if start is None or end is None or end <= start:
        return False
    return start <= datetime.now(UTC) <= end


def parse_release_window_time(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    if raw.endswith("Z"):
        raw = f"{raw[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    normalized = parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return normalized.astimezone(UTC)


def release_window_bound_label(value: datetime) -> str:
    return value.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def release_production_steps_for_wave(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[dict[str, Any]]:
    return [
        step
        for step in steps_for_wave(plan, preview, wave)
        if release_step_targets_production(plan, step)
    ]


def release_step_targets_production(plan: dict[str, Any], step: dict[str, Any]) -> bool:
    settings = plan_settings_value(plan)
    config = step_config(step)
    environment = (
        str(config.get("environment") or settings.get("environment") or "").strip().lower()
    )
    namespace = str(config.get("namespace") or settings.get("namespace") or "").strip().lower()
    return environment in PRODUCTION_ENVIRONMENTS or namespace in PRODUCTION_ENVIRONMENTS


def release_dispatch_guard_snapshot(
    plan: dict[str, Any],
    db: Any,
    workspace_id: str,
    preview: dict[str, Any],
    wave: int,
) -> dict[str, Any]:
    profile = execution_profile(plan)
    settings = plan_settings_value(plan)
    diagnostics = release_plan_diagnostics(plan) if profile.side_effects else []
    blocking_diagnostics = [
        diagnostic for diagnostic in diagnostics if diagnostic.severity in {"error", "warning"}
    ]
    validated_channels = release_validated_live_alert_channels(db, workspace_id)
    live_channels = release_live_alert_channels(db, workspace_id)
    production_steps = release_production_steps_for_wave(plan, preview, wave)
    window_start, window_end = release_window_bounds(plan)
    freeze_start, freeze_end = release_freeze_window_bounds(plan)
    verification_jobs = release_verification_job_specs(plan, production_steps, wave)
    return {
        "runtime_mode": profile.runtime_mode,
        "side_effects": profile.side_effects,
        "readiness": release_dispatch_readiness_snapshot(plan, preview, profile, wave),
        "change_management": {
            "change_ticket_present": any(
                has_change_ticket(settings, step_config(step)) for step in production_steps
            ),
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
            "production_override_reason": release_production_change_override_reason(plan) or None,
        },
        "approval": {
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
            "granted": any(
                approval_granted(settings, step_config(step)) for step in production_steps
            ),
            "granted_by": str(settings.get("approval_granted_by") or "").strip() or None,
            "reason": str(settings.get("approval_reason") or "").strip() or None,
            "granted_at": release_approval_granted_at_label(settings),
            "max_age": approval_max_age_label(),
        },
        "release_window": {
            "start": release_window_bound_label(window_start) if window_start else None,
            "end": release_window_bound_label(window_end) if window_end else None,
            "override_reason": release_window_override_reason(plan) or None,
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
        },
        "change_freeze": {
            "start": release_window_bound_label(freeze_start) if freeze_start else None,
            "end": release_window_bound_label(freeze_end) if freeze_end else None,
            "active": release_freeze_window_is_active(plan),
            "override_reason": release_freeze_override_reason(plan) or None,
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
        },
        "runbook": {
            "url": str(settings.get("runbook_url") or "").strip() or None,
            "url_present": any(
                release_runbook_url_is_valid(release_runbook_url(settings, step_config(step)))
                for step in production_steps
            ),
            "override_reason": None,
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
        },
        "owner": {
            "release_owner": str(settings.get("release_owner") or "").strip() or None,
            "oncall_contact": str(settings.get("oncall_contact") or "").strip() or None,
            "contact_present": any(
                bool(release_owner_contact(settings, step_config(step)))
                for step in production_steps
            ),
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
        },
        "verification": {
            "evidence_present": any(
                release_verification_evidence_present(settings, step_config(step))
                for step in production_steps
            ),
            "override_reason": None,
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
            "health_check_paths": [
                str(
                    step_config(step).get("health_check_path")
                    or settings.get("health_check_path")
                    or ""
                )
                for step in production_steps
                if str(
                    step_config(step).get("health_check_path")
                    or settings.get("health_check_path")
                    or ""
                ).strip()
            ],
            "verification_urls": [
                release_verification_url(settings, step_config(step))
                for step in production_steps
                if release_verification_url(settings, step_config(step))
            ],
        },
        "verification_jobs": {
            "scheduled": profile.side_effects and bool(verification_jobs),
            "job_count": len(verification_jobs) if profile.side_effects else 0,
            "jobs": verification_jobs if profile.side_effects else [],
        },
        "abort_criteria": {
            "criteria": [
                release_abort_criteria(settings, step_config(step))
                for step in production_steps
                if release_abort_criteria(settings, step_config(step))
            ],
            "override_reason": release_abort_criteria_override_reason(plan) or None,
            "production_targets": [
                str(step.get("application_id") or "") for step in production_steps
            ],
        },
        "diagnostics": {
            "required": settings.get("require_diagnostics_pass") is not False,
            "bypassed": release_diagnostics_bypassed(plan),
            "override_reason": release_diagnostics_override_reason(plan) or None,
            "blocking_count": len(blocking_diagnostics),
            "blocking_codes": [str(diagnostic.code) for diagnostic in blocking_diagnostics],
        },
        "rollback": {
            "policy": str(settings.get("rollback_policy") or "manual"),
            "disabled": str(settings.get("rollback_policy") or "manual") == "disabled",
            "override_reason": release_rollback_override_reason(plan) or None,
        },
        "alerts": {
            "validation_window": alert_channel_validation_window_label(),
            "warning_capable_count": len(live_channels),
            "validated_count": len(validated_channels),
            "validated_channels": [
                {
                    "channel_id": str(channel.get("channel_id") or ""),
                    "kind": str(channel.get("kind") or ""),
                    "min_severity": str(channel.get("min_severity") or "warning"),
                    "last_tested_at": channel.get("last_tested_at"),
                }
                for channel in validated_channels
            ],
        },
    }


def release_dispatch_readiness_snapshot(
    plan: dict[str, Any],
    preview: dict[str, Any],
    profile: Any,
    wave: int,
) -> dict[str, Any]:
    warning_checks = release_dispatch_readiness_warning_checks(plan, preview, wave)
    return {
        "ready": True,
        "checked_wave": wave,
        "summary": f"Dispatch guards passed for wave {wave}.",
        "impact": release_readiness_impact(plan, preview, profile),
        "selected_wave_steps": [
            readiness_impact_step(step)
            for step in preview.get("steps", [])
            if isinstance(step, dict) and int_field(step, "wave", 0) == wave
        ],
        "warnings": [str(check["message"]) for check in warning_checks],
        "next_actions": release_readiness_next_actions(warning_checks),
    }


def release_dispatch_readiness_warning_checks(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[dict[str, Any]]:
    settings = plan_settings_value(plan)
    retry_attempts = max(0, int_field(settings, "retry_attempts", 1))
    checks: list[dict[str, Any]] = []
    if release_production_change_ticket_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "change.ticket",
                "Change ticket",
                "warning",
                "Production change ticket gate is bypassed with an operator reason.",
            )
        )
    if release_production_window_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "release.window",
                "Release window",
                "warning",
                "Production release window is bypassed with an operator reason.",
            )
        )
    if release_production_freeze_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "change.freeze",
                "Change freeze",
                "warning",
                "Production change freeze is bypassed with an operator reason.",
            )
        )
    if release_production_runbook_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "runbook.sop",
                "Runbook",
                "warning",
                "Production runbook gate is bypassed with an operator reason.",
            )
        )
    if release_production_verification_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "verification.plan",
                "Post-deploy verification",
                "warning",
                "Post-deploy verification gate is bypassed with an operator reason.",
            )
        )
    if release_production_abort_criteria_bypassed(plan, preview, wave):
        checks.append(
            readiness_check(
                "rollback.abort_criteria",
                "Rollback criteria",
                "warning",
                "Rollback criteria gate is bypassed with an operator reason.",
            )
        )
    if release_diagnostics_bypassed(plan):
        checks.append(
            readiness_check(
                "plan.diagnostics",
                "Diagnostics gate",
                "warning",
                "Diagnostics gate is bypassed with an operator reason.",
            )
        )
    if release_rollback_policy_bypassed(plan):
        checks.append(
            readiness_check(
                "rollback.policy",
                "Rollback policy",
                "warning",
                "Rollback policy is disabled with an operator reason.",
            )
        )
    if retry_attempts <= 0:
        checks.append(
            readiness_check(
                "retry.policy",
                "Retry policy",
                "warning",
                "Failed waves cannot be retried automatically from this plan.",
            )
        )
    return checks


def release_dispatch_context_blockers(
    plan: dict[str, Any],
    steps: list[dict[str, Any]],
    db: Any,
    workspace_id: str,
) -> list[str]:
    if not callable(getattr(db, "get_application", None)):
        return []
    blockers: list[str] = []
    for index, step in enumerate(steps, start=1):
        application_id = str(step.get("application_id") or "").strip()
        label = str(step.get("name") or application_id or f"step {index}")
        if not application_id:
            blockers.append(f"{label} is missing application_id.")
            continue
        application = db.get_application(workspace_id, application_id)
        if not application:
            blockers.append(f"Application {application_id} is not registered in this workspace.")
            continue
        config = step_config(step)
        for field, display in (
            ("repo_ref", "repository"),
            ("branch", "branch"),
            ("manifest_path", "manifest path"),
            ("cluster_id", "cluster"),
        ):
            if not dispatch_context_value(config, application, field):
                blockers.append(f"{label} is missing {display} context.")
    return blockers


def dispatch_context_value(
    config: dict[str, Any],
    application: dict[str, Any],
    field: str,
) -> str:
    if field == "branch":
        value = (
            config.get("branch") or application.get("branch") or application.get("default_branch")
        )
    elif field == "manifest_path":
        value = config.get("manifest_path") or application.get("manifest_path")
    else:
        value = config.get(field) or application.get(field)
    return str(value or "").strip()


def enabled_alert_channels(db: Any, workspace_id: str) -> list[dict[str, Any]]:
    list_channels = getattr(db, "list_alert_channels", None)
    if not callable(list_channels):
        return []
    try:
        channels = list_channels(workspace_id, only_enabled=True)
    except TypeError:
        channels = [
            channel
            for channel in list_channels(workspace_id)
            if isinstance(channel, dict) and channel.get("enabled", True)
        ]
    return [channel for channel in channels if isinstance(channel, dict)]


def release_live_alert_channel_blockers(
    plan: dict[str, Any],
    db: Any,
    workspace_id: str,
) -> list[str]:
    if not execution_profile(plan).side_effects:
        return []
    if release_validated_live_alert_channels(db, workspace_id):
        return []
    if release_live_alert_channels(db, workspace_id):
        return [
            "Live release dispatch requires at least one warning-capable alert channel "
            f"with a passing validation test within {alert_channel_validation_window_label()}."
        ]
    return [
        "Live release dispatch requires at least one enabled alert channel that receives warning-or-higher release events."
    ]


def release_live_alert_channels(db: Any, workspace_id: str) -> list[dict[str, Any]]:
    return [
        channel
        for channel in enabled_alert_channels(db, workspace_id)
        if severity_matches(str(channel.get("min_severity") or "warning"), "warning")
    ]


def release_validated_live_alert_channels(db: Any, workspace_id: str) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    max_age = alert_channel_validation_max_age()
    return [
        channel
        for channel in release_live_alert_channels(db, workspace_id)
        if alert_channel_validation_is_current(channel, now=now, max_age=max_age)
    ]


def alert_channel_validation_is_current(
    channel: dict[str, Any],
    *,
    now: datetime,
    max_age: timedelta,
) -> bool:
    if str(channel.get("last_test_status") or "").lower() != "passed":
        return False
    tested_at = alert_channel_tested_at(channel)
    if tested_at is None:
        return False
    return now - tested_at <= max_age


def alert_channel_tested_at(channel: dict[str, Any]) -> datetime | None:
    value = channel.get("last_tested_at")
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        raw = value.strip()
        if not raw:
            return None
        if raw.endswith("Z"):
            raw = f"{raw[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(raw)
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    return None


def alert_channel_validation_max_age() -> timedelta:
    raw = os.getenv(
        ALERT_CHANNEL_VALIDATION_MAX_AGE_HOURS_ENV,
        str(DEFAULT_ALERT_CHANNEL_VALIDATION_MAX_AGE_HOURS),
    ).strip()
    try:
        hours = float(raw)
    except ValueError:
        hours = float(DEFAULT_ALERT_CHANNEL_VALIDATION_MAX_AGE_HOURS)
    return timedelta(hours=max(1.0, hours))


def alert_channel_validation_window_label() -> str:
    hours = alert_channel_validation_max_age().total_seconds() / 3600
    if hours.is_integer():
        return f"{int(hours)} hour(s)"
    return f"{hours:.1f} hour(s)"


def release_run_status_action(
    run_id: str,
    payload: ReleaseRunActionRequest,
    current: Any,
    db: Any,
    status: str,
    default_message: str,
    terminal_block_message: str,
    *,
    permission: str = Permission.DEPLOY_RUN.value,
) -> ReleaseRunResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    existing = db.get_release_run(workspace_id, run_id)
    if existing is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_RUN_NOT_FOUND)
    run_status = str(existing.get("status") or "")
    if run_status in TERMINAL_RELEASE_RUN_STATUSES:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={"message": RELEASE_RUN_BLOCKED, "blockers": [terminal_block_message]},
        )
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        existing.get("steps", []),
        permission,
    )
    reason = operator_action_reason(payload, default_message)
    run = db.update_release_run_status(
        workspace_id,
        run_id,
        status,
        actor=current.user_id,
        message=default_message,
        details={"reason": reason, "operator_action": status},
    )
    return ReleaseRunResponse(run=run or existing)


def operator_action_reason(payload: ReleaseRunActionRequest, fallback: str) -> str:
    reason = str(payload.reason or "").strip()
    return reason or fallback


def release_notify_cooldown_blocker(run: dict[str, Any]) -> str | None:
    cooldown = release_notify_cooldown()
    events = run.get("events") if isinstance(run.get("events"), list) else []
    now = datetime.now(UTC)
    for event in reversed(events):
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("event_type") or "")
        if not event_type.startswith("release.notify"):
            continue
        created_at = parse_release_window_time(event.get("created_at"))
        if created_at is None:
            continue
        age = now - created_at.astimezone(UTC)
        if age < cooldown:
            remaining_seconds = max(0, int((cooldown - age).total_seconds()))
            remaining_minutes = max(1, (remaining_seconds + 59) // 60)
            return (
                "Release notification was already sent recently; "
                f"wait about {remaining_minutes} minute(s) before notifying again."
            )
    return None


def release_notify_cooldown() -> timedelta:
    raw = os.getenv(RELEASE_NOTIFY_COOLDOWN_MINUTES_ENV, "").strip()
    try:
        minutes = float(raw) if raw else DEFAULT_RELEASE_NOTIFY_COOLDOWN_MINUTES
    except ValueError:
        minutes = DEFAULT_RELEASE_NOTIFY_COOLDOWN_MINUTES
    return timedelta(minutes=max(1.0, minutes))


def record_release_notify_event(
    db: Any,
    workspace_id: str,
    run_id: str,
    event_type: str,
    alert: AlertRequestedBody,
    *,
    actor: str,
    reason: str,
    accepted_event: dict[str, Any],
) -> dict[str, Any] | None:
    if not hasattr(db, "record_release_run_event"):
        return None
    return db.record_release_run_event(
        workspace_id,
        run_id,
        event_type,
        f"Release notification requested ({alert.severity}).",
        actor=actor,
        details={
            "reason": reason,
            "operator_action": "notify",
            "alert": {
                "severity": alert.severity,
                "cluster_id": alert.cluster_id,
                "namespace": alert.namespace,
                "application_id": alert.application_id,
                "workflow_run_id": alert.workflow_run_id,
                "message": alert.message,
                "reason": alert.reason,
            },
            "accepted_event": accepted_event,
        },
    )


def release_run_rollback_policy(run: dict[str, Any]) -> str:
    rollback = run.get("rollback")
    if isinstance(rollback, dict):
        policy = str(rollback.get("policy") or "").strip()
        if policy:
            return policy
    settings = run.get("settings")
    if isinstance(settings, dict):
        policy = str(settings.get("rollback_policy") or "").strip()
        if policy:
            return policy
    return "manual"


def release_run_attention_alert_body(
    run: dict[str, Any],
    workspace_id: str,
    *,
    reason: str,
) -> AlertRequestedBody:
    status = str(run.get("derived_status") or run.get("status") or "unknown")
    attention = run.get("attention") if isinstance(run.get("attention"), dict) else {}
    reasons = (
        [str(item) for item in attention.get("reasons", []) if str(item).strip()]
        if isinstance(attention.get("reasons"), list)
        else []
    )
    first_step = first_release_run_step(run)
    step_details = first_step.get("details") if isinstance(first_step.get("details"), dict) else {}
    step_config = step_details.get("config") if isinstance(step_details.get("config"), dict) else {}
    timed_out_jobs = release_verification_job_pending_timeouts(run)
    failed_verification = release_run_has_failed_verification(run)
    severity = (
        "critical"
        if status in {"failed", "rollback_requested"}
        or attention.get("stale") is True
        or failed_verification
        or bool(timed_out_jobs)
        else "warning"
    )
    application_id = str(first_step.get("application_id") or "release")
    message_parts = [f"{str(run.get('plan_name') or 'Release run')} is {status}"]
    if reasons:
        message_parts.append("; ".join(reasons[:3]))
    if failed_verification:
        message_parts.append("post-deploy verification failed")
    if timed_out_jobs:
        message_parts.append(release_verification_timeout_alert_summary(timed_out_jobs))
    message_parts.append(reason)
    return AlertRequestedBody(
        workspace_id=workspace_id,
        cluster_id=str(
            step_details.get("cluster_id")
            or step_config.get("cluster_id")
            or Target.DEFAULT_CLUSTER_ID
        ),
        namespace=str(
            step_details.get("namespace") or step_config.get("namespace") or Sandbox.NAMESPACE
        ),
        severity=severity,
        application_id=application_id,
        workflow_run_id=str(first_step.get("workflow_run_id") or run.get("run_id") or ""),
        environment=str(
            step_details.get("environment") or step_config.get("environment") or "production"
        ),
        message=f"{application_id}: {' | '.join(message_parts)}",
        reason="release run needs attention",
    )


def release_verification_timeout_alert_summary(jobs: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for job in jobs[:3]:
        kind = str(job.get("kind") or "verification")
        job_id = str(job.get("job_id") or "unknown-job")
        age = int_field(job, "age_minutes", 0)
        timeout = int_field(job, "timeout_minutes", DEFAULT_RELEASE_VERIFICATION_TIMEOUT_MINUTES)
        parts.append(f"{kind} {job_id} timed out after {age}m (limit {timeout}m)")
    if len(jobs) > 3:
        parts.append(f"+{len(jobs) - 3} more timed out verification jobs")
    return "; ".join(parts)


def first_release_run_step(run: dict[str, Any]) -> dict[str, Any]:
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in steps:
        if isinstance(step, dict):
            return step
    return {}


def require_plan_application_manage_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.DEPLOY_RUN.value,
    )


def require_plan_application_plan_manage_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    has_application_scope = any(str(step.get("application_id") or "").strip() for step in steps)
    if not has_application_scope:
        roles = tuple(getattr(current, "roles", ()) or ())
        if ServiceRole.SERVICE_ADMIN.value in roles:
            return
        raise HTTPException(status_code=403, detail="resource access denied")
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.APPLICATION_MANAGE.value,
    )


def upsert_release_plan_or_404(db: Any, body: dict[str, Any]) -> dict[str, Any]:
    try:
        return db.upsert_release_plan(body)
    except ReleasePlanWorkspaceMismatchError as exc:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RELEASE_PLAN_NOT_FOUND) from exc
    except IntegrityError as exc:
        raise HTTPException(status_code=HTTP_CONFLICT, detail="release plan conflict") from exc


def require_plan_application_rollback_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.ROLLBACK_RUN.value,
    )


def require_plan_application_cancel_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.RUNNER_JOB_CANCEL.value,
    )


def require_plan_application_audit_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.EVIDENCE_READ.value,
    )


def require_plan_application_permission_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
    permission: str,
) -> None:
    for step in steps:
        application_id = str(step.get("application_id") or "")
        if not application_id:
            continue
        require_resource_access(
            db,
            current,
            workspace_id,
            AccessResourceType.APPLICATION.value,
            application_id,
            permission,
        )


def require_no_active_release_run(db: Any, workspace_id: str, plan: dict[str, Any]) -> None:
    blockers = active_release_run_blockers(db, workspace_id, plan)
    if blockers:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_PLAN_BLOCKED,
                "blockers": blockers,
            },
        )


def active_release_run_blockers(db: Any, workspace_id: str, plan: dict[str, Any]) -> list[str]:
    plan_id = str(plan.get("plan_id") or "").strip()
    has_active = getattr(db, "has_active_release_runs", None)
    if not plan_id or not callable(has_active):
        return []
    if has_active(workspace_id, plan_id):
        return [f"Release plan {plan_id} already has an active run."]
    return []


def release_plan_from_run(run: dict[str, Any], steps: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "plan_id": run.get("plan_id"),
        "name": run.get("plan_name") or "Release run",
        "settings": dict(run.get("settings") or {}),
        "steps": [
            {
                "application_id": str(step["application_id"]),
                "name": str(step.get("name") or step["application_id"]),
                "position": index,
                "depends_on": [],
                "config": dict(dict(step.get("details") or {}).get("config") or {}),
            }
            for index, step in enumerate(steps)
        ],
    }


def retryable_steps_for_wave(run: dict[str, Any], wave: int) -> list[dict[str, Any]]:
    retryable_statuses = {"failed", "cancelled", "timeout"}
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    return [
        step
        for step in steps
        if isinstance(step, dict)
        and int_field(step, "wave", 0) == wave
        and (
            str(step.get("status") or "") in retryable_statuses
            or (
                isinstance(step.get("health"), dict) and step["health"].get("status") == "unhealthy"
            )
        )
    ]


def release_current_wave_health_blockers(steps: list[dict[str, Any]], wave: int) -> list[str]:
    blockers: list[str] = []
    for step in steps:
        name = str(step.get("name") or step.get("application_id") or "release step")
        if str(step.get("status") or "") != "succeeded":
            blockers.append(f"{name} in wave {wave} has not succeeded yet.")
            continue
        health = step.get("health") if isinstance(step.get("health"), dict) else {}
        if str(health.get("status") or "") == "unhealthy":
            blockers.append(f"{name} health is unhealthy; resolve it before advancing wave {wave}.")
        blockers.extend(release_verification_job_advance_blockers(step, name, wave))
    return blockers


def release_verification_job_advance_blockers(
    step: dict[str, Any],
    name: str,
    wave: int,
) -> list[str]:
    details = step.get("details") if isinstance(step.get("details"), dict) else {}
    guard = details.get("release_guard") if isinstance(details.get("release_guard"), dict) else {}
    verification_jobs = (
        guard.get("verification_jobs") if isinstance(guard.get("verification_jobs"), dict) else {}
    )
    jobs = [job for job in list(verification_jobs.get("jobs") or []) if isinstance(job, dict)]
    blockers: list[str] = []
    for job in jobs:
        status = str(job.get("status") or "").lower()
        if status in VERIFICATION_JOB_FAILED_STATUSES:
            kind = str(job.get("kind") or "verification")
            blockers.append(
                f"{name} post-deploy verification {kind} failed; resolve it before advancing wave {wave}."
            )
        elif status in {"", "pending", "queued", "running"}:
            kind = str(job.get("kind") or "verification")
            blockers.append(
                f"{name} post-deploy verification {kind} is {status or 'pending'}; wait before advancing wave {wave}."
            )
    return blockers


def retry_limit_for_steps(run: dict[str, Any], steps: list[dict[str, Any]]) -> int:
    settings = dict(run.get("settings") or {})
    default_limit = max(0, int_field(settings, "retry_attempts", 1))
    limits: list[int] = []
    for step in steps:
        details = step.get("details") if isinstance(step.get("details"), dict) else {}
        config = details.get("config") if isinstance(details.get("config"), dict) else {}
        limits.append(max(0, int_field(config, "retry_attempts", default_limit)))
    return min(limits) if limits else default_limit


def retry_attempts_for_wave(run: dict[str, Any], wave: int) -> int:
    events = run.get("events") if isinstance(run.get("events"), list) else []
    prefix = f"release.retry.wave.{wave}.attempt."
    attempts: set[int] = set()
    for event in events:
        if not isinstance(event, dict):
            continue
        event_type = str(event.get("event_type") or "")
        if not event_type.startswith(prefix):
            continue
        suffix = event_type.removeprefix(prefix).split(".", 1)[0]
        if suffix.isdigit():
            attempts.add(int(suffix))
    return len(attempts)


def require_plan_application_read_access(
    db: Any,
    current: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
) -> None:
    require_plan_application_permission_access(
        db,
        current,
        workspace_id,
        steps,
        Permission.APPLICATION_READ.value,
    )


def filter_release_runs(
    runs: list[dict[str, Any]],
    *,
    status: str | None = None,
    attention_only: bool = False,
    stale_only: bool = False,
    active_only: bool = False,
    live_only: bool = False,
    unhealthy_only: bool = False,
    verification_failed_only: bool = False,
    verification_pending_timeout_only: bool = False,
    policy_override_only: bool = False,
    policy_override_source: str | None = None,
    active_change_freeze_only: bool = False,
    change_freeze_override_only: bool = False,
) -> list[dict[str, Any]]:
    expected_status = str(status or "").strip().lower()
    expected_policy_override_source = release_policy_override_source_key(policy_override_source)
    filtered: list[dict[str, Any]] = []
    for run in runs:
        run_status = str(run.get("derived_status") or run.get("status") or "").lower()
        attention = run.get("attention") if isinstance(run.get("attention"), dict) else {}
        if expected_status and run_status != expected_status:
            continue
        if attention_only and attention.get("required") is not True:
            continue
        if stale_only and attention.get("stale") is not True:
            continue
        if active_only and run_status in TERMINAL_RELEASE_RUN_STATUSES:
            continue
        if live_only and not release_run_has_live_side_effects(run):
            continue
        if unhealthy_only and not release_run_has_unhealthy_health(run):
            continue
        if verification_failed_only and not release_run_has_failed_verification(run):
            continue
        if verification_pending_timeout_only and not release_run_has_timed_out_verification(run):
            continue
        if policy_override_only and not release_run_has_policy_override(run):
            continue
        if expected_policy_override_source and not release_run_has_policy_override_source(
            run,
            expected_policy_override_source,
        ):
            continue
        if active_change_freeze_only and not release_run_has_active_change_freeze(run):
            continue
        if change_freeze_override_only and not release_run_has_change_freeze_override(run):
            continue
        filtered.append(run)
    return filtered


def release_run_has_live_side_effects(run: dict[str, Any]) -> bool:
    settings = run.get("settings") if isinstance(run.get("settings"), dict) else {}
    if settings.get("runtime_mode") == "live" or settings.get("provider_mode") == "live":
        return True
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    return any(
        isinstance(step, dict)
        and isinstance(step.get("details"), dict)
        and step["details"].get("side_effects") is True
        for step in steps
    )


def release_run_has_failed_verification(run: dict[str, Any]) -> bool:
    for job, _step, _name in release_run_verification_jobs(run):
        if release_verification_job_status(job) in VERIFICATION_JOB_FAILED_STATUSES:
            return True
    return False


def release_run_has_unhealthy_health(run: dict[str, Any]) -> bool:
    health = run.get("health") if isinstance(run.get("health"), dict) else {}
    if str(health.get("status") or "").strip().lower() == "unhealthy":
        return True
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    return any(
        isinstance(step, dict)
        and isinstance(step.get("health"), dict)
        and str(step["health"].get("status") or "").strip().lower() == "unhealthy"
        for step in steps
    )


def release_run_has_timed_out_verification(run: dict[str, Any]) -> bool:
    return bool(release_verification_job_pending_timeouts(run))


def release_run_change_freeze_snapshot(run: dict[str, Any]) -> dict[str, Any]:
    guard = release_run_latest_guard(run)
    freeze = guard.get("change_freeze") if isinstance(guard.get("change_freeze"), dict) else {}
    return freeze


def release_run_has_change_freeze_override(run: dict[str, Any]) -> bool:
    freeze = release_run_change_freeze_snapshot(run)
    return bool(str(freeze.get("override_reason") or "").strip())


def release_run_has_active_change_freeze(run: dict[str, Any]) -> bool:
    freeze = release_run_change_freeze_snapshot(run)
    return freeze.get("active") is True


RELEASE_GUARD_POLICY_OVERRIDE_PATHS = (
    ("change_management", "production_override_reason", "Production change"),
    ("release_window", "override_reason", "Release window"),
    ("change_freeze", "override_reason", "Change freeze"),
    ("runbook", "override_reason", "Runbook"),
    ("verification", "override_reason", "Post-deploy verification"),
    ("abort_criteria", "override_reason", "Rollback criteria"),
    ("diagnostics", "override_reason", "Diagnostics"),
    ("rollback", "override_reason", "Rollback policy"),
)


def release_run_has_policy_override(run: dict[str, Any]) -> bool:
    return bool(release_run_policy_overrides(run))


def release_policy_override_source_key(value: Any) -> str:
    return str(value or "").strip().lower().replace("_", " ").replace("-", " ")


def release_run_has_policy_override_source(run: dict[str, Any], source: str) -> bool:
    expected_source = release_policy_override_source_key(source)
    return any(
        release_policy_override_source_key(override.get("source")) == expected_source
        for override in release_run_policy_overrides(run)
    )


def release_run_policy_overrides(run: dict[str, Any]) -> list[dict[str, Any]]:
    guard = release_run_latest_guard(run)
    overrides: list[dict[str, Any]] = []
    for section_key, reason_key, label in RELEASE_GUARD_POLICY_OVERRIDE_PATHS:
        section = guard.get(section_key)
        if not isinstance(section, dict):
            continue
        reason = str(section.get(reason_key) or "").strip()
        if not reason:
            continue
        targets = (
            section.get("production_targets")
            if isinstance(section.get("production_targets"), list)
            else []
        )
        overrides.append(
            {
                "source": label,
                "reason": reason,
                "production_targets": [str(item) for item in targets if str(item).strip()],
            }
        )
    return overrides


def release_run_verification_jobs(
    run: dict[str, Any],
) -> list[tuple[dict[str, Any], dict[str, Any], str]]:
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    records: list[tuple[dict[str, Any], dict[str, Any], str]] = []
    for step in steps:
        if not isinstance(step, dict):
            continue
        name = str(step.get("name") or step.get("application_id") or "release step")
        details = step.get("details") if isinstance(step.get("details"), dict) else {}
        guard = (
            details.get("release_guard") if isinstance(details.get("release_guard"), dict) else {}
        )
        verification_jobs = (
            guard.get("verification_jobs")
            if isinstance(guard.get("verification_jobs"), dict)
            else {}
        )
        jobs = (
            verification_jobs.get("jobs") if isinstance(verification_jobs.get("jobs"), list) else []
        )
        for job in jobs:
            if isinstance(job, dict):
                records.append((job, step, name))
    return records


def release_verification_job_status(job: dict[str, Any]) -> str:
    return str(job.get("status") or "").strip().lower()


def release_verification_job_pending_timeouts(
    run: dict[str, Any],
    *,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    current_time = now or datetime.now(UTC)
    settings = run.get("settings") if isinstance(run.get("settings"), dict) else {}
    default_timeout = int_field(
        settings,
        "post_deploy_verification_timeout_minutes",
        int_field(
            settings, "verification_timeout_minutes", DEFAULT_RELEASE_VERIFICATION_TIMEOUT_MINUTES
        ),
    )
    timed_out: list[dict[str, Any]] = []
    for job, step, step_name in release_run_verification_jobs(run):
        if release_verification_job_status(job) not in VERIFICATION_JOB_PENDING_STATUSES:
            continue
        timeout_minutes = max(1, int_field(job, "timeout_minutes", default_timeout))
        queued_at = parse_release_window_time(
            job.get("queued_at")
            or job.get("created_at")
            or job.get("started_at")
            or step.get("updated_at")
            or run.get("updated_at")
            or run.get("created_at")
        )
        if queued_at is None:
            continue
        age_seconds = max(0, int((current_time - queued_at.astimezone(UTC)).total_seconds()))
        if age_seconds < timeout_minutes * 60:
            continue
        record = dict(job)
        record["step_name"] = step_name
        record["age_minutes"] = age_seconds // 60
        record["timeout_minutes"] = timeout_minutes
        record["queued_at"] = release_window_bound_label(queued_at)
        timed_out.append(record)
    return timed_out


def release_run_summary_from_runs(runs: list[dict[str, Any]]) -> dict[str, Any]:
    status_breakdown: dict[str, int] = {}
    plan_breakdown: dict[str, int] = {}
    recent_runs: list[dict[str, Any]] = []
    active_runs = 0
    succeeded_runs = 0
    cancelled_runs = 0
    failed_runs = 0
    paused_runs = 0
    rollback_requested_runs = 0
    waiting_for_approval_runs = 0
    live_runs = 0
    unhealthy_runs = 0
    verification_failed_runs = 0
    verification_pending_timeout_runs = 0
    policy_override_runs = 0
    policy_override_breakdown: dict[str, int] = {}
    active_change_freeze_runs = 0
    change_freeze_override_runs = 0
    stale_runs = 0
    attention_required_runs = 0
    last_run_status = ""
    for run in runs:
        status = str(run.get("derived_status") or run.get("status") or "unknown")
        plan_id = str(run.get("plan_id") or "")
        attention_reasons = release_attention_reasons(run)
        if not last_run_status:
            last_run_status = status
        status_breakdown[status] = status_breakdown.get(status, 0) + 1
        if plan_id:
            plan_breakdown[plan_id] = plan_breakdown.get(plan_id, 0) + 1
        if status not in TERMINAL_RELEASE_RUN_STATUSES:
            active_runs += 1
        if status == "succeeded":
            succeeded_runs += 1
        if status == "cancelled":
            cancelled_runs += 1
        if status == "failed":
            failed_runs += 1
        if status == "paused":
            paused_runs += 1
        if status == "rollback_requested":
            rollback_requested_runs += 1
        if status == "waiting_for_approval":
            waiting_for_approval_runs += 1
        status_needs_attention = status in {"failed", "waiting_for_approval", "rollback_requested"}
        if status_needs_attention:
            attention_required_runs += 1
        health = run.get("health") if isinstance(run.get("health"), dict) else {}
        attention = run.get("attention") if isinstance(run.get("attention"), dict) else {}
        if attention.get("stale") is True:
            stale_runs += 1
        health_needs_attention = health.get("status") == "unhealthy" and not status_needs_attention
        if health.get("status") == "unhealthy":
            unhealthy_runs += 1
            if health_needs_attention:
                attention_required_runs += 1
        if release_run_has_failed_verification(run):
            verification_failed_runs += 1
        verification_pending_timed_out = release_run_has_timed_out_verification(run)
        if verification_pending_timed_out:
            verification_pending_timeout_runs += 1
        policy_overrides = release_run_policy_overrides(run)
        if policy_overrides:
            policy_override_runs += 1
            for override in policy_overrides:
                source = str(override.get("source") or "Policy override")
                policy_override_breakdown[source] = policy_override_breakdown.get(source, 0) + 1
        if release_run_has_active_change_freeze(run):
            active_change_freeze_runs += 1
        if release_run_has_change_freeze_override(run):
            change_freeze_override_runs += 1
        if (
            (attention.get("required") is True or verification_pending_timed_out)
            and not status_needs_attention
            and not health_needs_attention
        ):
            attention_required_runs += 1
        if release_run_has_live_side_effects(run):
            live_runs += 1
        if len(recent_runs) < 10:
            recent_runs.append(
                {
                    "run_id": str(run.get("run_id") or ""),
                    "plan_id": plan_id,
                    "status": status,
                    "attention_reasons": attention_reasons,
                }
            )
    return {
        "total_runs": len(runs),
        "status_breakdown": status_breakdown,
        "plan_breakdown": plan_breakdown,
        "active_runs": active_runs,
        "succeeded_runs": succeeded_runs,
        "cancelled_runs": cancelled_runs,
        "attention_required_runs": attention_required_runs,
        "failed_runs": failed_runs,
        "paused_runs": paused_runs,
        "rollback_requested_runs": rollback_requested_runs,
        "waiting_for_approval_runs": waiting_for_approval_runs,
        "live_runs": live_runs,
        "unhealthy_runs": unhealthy_runs,
        "verification_failed_runs": verification_failed_runs,
        "verification_pending_timeout_runs": verification_pending_timeout_runs,
        "policy_override_runs": policy_override_runs,
        "policy_override_breakdown": policy_override_breakdown,
        "active_change_freeze_runs": active_change_freeze_runs,
        "change_freeze_override_runs": change_freeze_override_runs,
        "stale_runs": stale_runs,
        "last_run_status": last_run_status or None,
        "recent_runs": recent_runs,
    }


def release_run_handoff(run: dict[str, Any]) -> dict[str, Any]:
    status = str(run.get("derived_status") or run.get("status") or "unknown")
    attention = run.get("attention") if isinstance(run.get("attention"), dict) else {}
    health = run.get("health") if isinstance(run.get("health"), dict) else {}
    rollback_policy = release_run_rollback_policy(run)
    attention_reasons = release_attention_reasons(run)
    stale = attention.get("stale") is True
    live_side_effects = release_run_has_live_side_effects(run)
    retryable = release_run_is_retryable(run)
    terminal = status in TERMINAL_RELEASE_RUN_STATUSES
    alertable = stale or attention.get("required") is True or bool(attention_reasons)
    notify_blocker = release_notify_cooldown_blocker(run)
    verification = release_run_handoff_verification(run)
    abort_criteria = release_run_handoff_abort_criteria(run)
    change_freeze = release_run_handoff_change_freeze(run)
    policy_overrides = release_run_policy_overrides(run)
    return {
        "run_id": str(run.get("run_id") or ""),
        "plan_id": str(run.get("plan_id") or ""),
        "plan_name": str(run.get("plan_name") or "Release run"),
        "status": status,
        "headline": release_run_handoff_headline(run, status, alertable=alertable, stale=stale),
        "severity": release_run_handoff_severity(status, alertable=alertable, stale=stale),
        "current_wave": int(run.get("current_wave") or 0),
        "total_waves": int(run.get("total_waves") or 0),
        "live_side_effects": live_side_effects,
        "attention_reasons": attention_reasons,
        "verification": verification,
        "abort_criteria": abort_criteria,
        "change_freeze": change_freeze,
        "policy_overrides": policy_overrides,
        "next_actions": release_run_handoff_actions(
            status,
            terminal=terminal,
            retryable=retryable,
            alertable=alertable,
            rollback_enabled=rollback_policy != "disabled",
            notify_blocker=notify_blocker,
            rollback_blocker="Rollback policy is disabled for this release run."
            if rollback_policy == "disabled"
            else None,
        ),
        "checks": [
            release_handoff_check(
                "mode",
                "warning" if live_side_effects else "info",
                "Live side effects are enabled for this run."
                if live_side_effects
                else "Demo/dry-run mode is active.",
            ),
            release_handoff_check(
                "health",
                "blocked" if health.get("status") == "unhealthy" else "passed",
                f"Health is {str(health.get('status') or 'unknown')}.",
            ),
            release_handoff_check(
                "attention",
                "blocked" if notify_blocker else "warning" if alertable else "passed",
                notify_blocker
                or (
                    "; ".join(attention_reasons[:3])
                    if attention_reasons
                    else "No operator attention reason is recorded."
                ),
            ),
            release_handoff_check(
                "rollback",
                "blocked" if rollback_policy == "disabled" else "passed",
                f"Rollback policy is {rollback_policy}.",
            ),
            release_handoff_check(
                "verification",
                str(verification.get("status") or "info"),
                str(verification.get("message") or "No verification snapshot recorded."),
            ),
            release_handoff_check(
                "abort_criteria",
                str(abort_criteria.get("status") or "info"),
                str(abort_criteria.get("message") or "No rollback criteria snapshot recorded."),
            ),
            release_handoff_check(
                "change_freeze",
                str(change_freeze.get("status") or "info"),
                str(change_freeze.get("message") or "No change freeze snapshot recorded."),
            ),
            release_handoff_check(
                "policy_overrides",
                "warning" if policy_overrides else "passed",
                f"{len(policy_overrides)} policy override reason(s) recorded."
                if policy_overrides
                else "No policy override reasons are recorded.",
            ),
        ],
        "last_event": release_run_last_event(run),
    }


def release_run_report(run: dict[str, Any], audit_events: list[dict[str, Any]]) -> dict[str, Any]:
    handoff = release_run_handoff(run)
    generated_at = datetime.now(UTC).isoformat()
    public_audit_events = audit_events[:20]
    return {
        "run_id": str(run.get("run_id") or ""),
        "plan_id": str(run.get("plan_id") or ""),
        "plan_name": str(run.get("plan_name") or "Release run"),
        "status": str(run.get("derived_status") or run.get("status") or "unknown"),
        "current_wave": int_field(run, "current_wave", 0),
        "total_waves": int_field(run, "total_waves", 0),
        "generated_at": generated_at,
        "handoff": handoff,
        "audit_events": public_audit_events,
        "markdown": release_run_report_markdown(run, handoff, public_audit_events, generated_at),
    }


def release_run_report_markdown(
    run: dict[str, Any],
    handoff: dict[str, Any],
    audit_events: list[dict[str, Any]],
    generated_at: str,
) -> str:
    status = str(run.get("derived_status") or run.get("status") or "unknown")
    health = run.get("health") if isinstance(run.get("health"), dict) else {}
    lines = [
        f"## Release run report: {run.get('plan_name') or run.get('run_id') or 'release run'}",
        "",
        f"- Run: {run.get('run_id') or ''}",
        f"- Status: {status}",
        f"- Wave: {int_field(run, 'current_wave', 0)} of {int_field(run, 'total_waves', 0)}",
        f"- Mode: {'live side effects' if release_run_has_live_side_effects(run) else 'demo/dry-run'}",
        f"- Health: {health.get('status') or 'pending'}",
        f"- Generated at: {generated_at}",
        "",
        f"Headline: {handoff.get('headline') or ''}",
        f"Severity: {handoff.get('severity') or 'info'}",
    ]
    attention_reasons = release_attention_reasons(run)
    if attention_reasons:
        lines.extend(["", "Attention:", *[f"- {reason}" for reason in attention_reasons]])
    target_lines = release_run_report_target_lines(run)
    if target_lines:
        lines.extend(["", "Targets:", *target_lines])
    approval_lines = release_run_report_approval_lines(run)
    if approval_lines:
        lines.extend(["", "Approvals:", *approval_lines])
    next_actions = (
        handoff.get("next_actions") if isinstance(handoff.get("next_actions"), list) else []
    )
    if next_actions:
        lines.extend(["", "Next actions:"])
        for action in next_actions[:6]:
            if not isinstance(action, dict):
                continue
            marker = "[ ]" if action.get("enabled") is not False else "[blocked]"
            reason = f": {action.get('reason')}" if action.get("reason") else ""
            lines.append(
                f"- {marker} {action.get('label') or action.get('action') or 'action'}{reason}"
            )
    checks = handoff.get("checks") if isinstance(handoff.get("checks"), list) else []
    if checks:
        lines.extend(["", "Checks:"])
        for check in checks[:8]:
            if not isinstance(check, dict):
                continue
            lines.append(
                f"- {check.get('name') or 'check'}: {check.get('status') or 'info'} "
                f"({check.get('message') or 'No message.'})"
            )
    policy_overrides = (
        handoff.get("policy_overrides") if isinstance(handoff.get("policy_overrides"), list) else []
    )
    if policy_overrides:
        lines.extend(["", "Policy overrides:"])
        for override in policy_overrides[:8]:
            if not isinstance(override, dict):
                continue
            reason = str(override.get("reason") or "").strip()
            targets = (
                override.get("production_targets")
                if isinstance(override.get("production_targets"), list)
                else []
            )
            target_label = (
                f" / targets: {', '.join(str(item) for item in targets[:5])}" if targets else ""
            )
            lines.append(
                f"- {override.get('source') or 'Policy override'}: {reason or 'No reason recorded.'}{target_label}"
            )
    verification = (
        handoff.get("verification") if isinstance(handoff.get("verification"), dict) else {}
    )
    if verification:
        lines.extend(
            [
                "",
                "Verification:",
                f"- {verification.get('status') or 'info'}: {verification.get('message') or 'No verification message.'}",
            ]
        )
        evidence = (
            verification.get("evidence") if isinstance(verification.get("evidence"), list) else []
        )
        lines.extend(f"- evidence: {item}" for item in evidence[:3])
        jobs = verification.get("jobs") if isinstance(verification.get("jobs"), list) else []
        for job in jobs[:3]:
            if isinstance(job, dict):
                lines.append(
                    f"- job: {job.get('job_id') or job.get('kind') or 'verification'} "
                    f"{job.get('status') or 'unknown'}"
                )
        if verification.get("override_reason"):
            lines.append(f"- override: {verification.get('override_reason')}")
    abort_criteria = (
        handoff.get("abort_criteria") if isinstance(handoff.get("abort_criteria"), dict) else {}
    )
    if abort_criteria:
        lines.extend(
            [
                "",
                "Rollback criteria:",
                f"- {abort_criteria.get('status') or 'info'}: {abort_criteria.get('message') or 'No rollback criteria message.'}",
            ]
        )
        criteria = (
            abort_criteria.get("criteria")
            if isinstance(abort_criteria.get("criteria"), list)
            else []
        )
        lines.extend(f"- {item}" for item in criteria[:3])
        if abort_criteria.get("override_reason"):
            lines.append(f"- override: {abort_criteria.get('override_reason')}")
    change_freeze = (
        handoff.get("change_freeze") if isinstance(handoff.get("change_freeze"), dict) else {}
    )
    if change_freeze:
        lines.extend(
            [
                "",
                "Change freeze:",
                f"- {change_freeze.get('status') or 'info'}: {change_freeze.get('message') or 'No change freeze message.'}",
            ]
        )
        if change_freeze.get("start") or change_freeze.get("end"):
            lines.append(
                f"- window: {change_freeze.get('start') or '?'} to {change_freeze.get('end') or '?'}"
            )
        targets = (
            change_freeze.get("production_targets")
            if isinstance(change_freeze.get("production_targets"), list)
            else []
        )
        if targets:
            lines.append(f"- targets: {', '.join(str(item) for item in targets[:5])}")
        if change_freeze.get("override_reason"):
            lines.append(f"- override: {change_freeze.get('override_reason')}")
    audit_summary_lines = release_run_report_audit_summary_lines(audit_events)
    if audit_summary_lines:
        lines.extend(["", "Audit summary:", *audit_summary_lines])
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    if steps:
        lines.extend(["", "Steps:"])
        for step in steps[:12]:
            if not isinstance(step, dict):
                continue
            step_health = step.get("health") if isinstance(step.get("health"), dict) else {}
            details = step.get("details") if isinstance(step.get("details"), dict) else {}
            context = " / ".join(
                str(value)
                for value in [
                    details.get("environment"),
                    details.get("strategy"),
                    details.get("gate"),
                ]
                if value
            )
            health_label = (
                f", health {step_health.get('status')}" if step_health.get("status") else ""
            )
            suffix = f" ({context})" if context else ""
            lines.append(
                f"- Wave {step.get('wave') or '?'} {step.get('name') or step.get('application_id') or 'step'}: "
                f"{step.get('status') or 'unknown'}{health_label}{suffix}"
            )
    if audit_events:
        lines.extend(["", "Recent audit:"])
        for event in audit_events[:12]:
            created_suffix = f" ({event.get('created_at')})" if event.get("created_at") else ""
            lines.append(
                f"- {event.get('event_type') or 'event'}: {event.get('message') or 'recorded'}{created_suffix}"
            )
    return "\n".join(lines)


def release_run_report_audit_summary_lines(audit_events: list[dict[str, Any]]) -> list[str]:
    if not audit_events:
        return []
    counts: dict[str, int] = {}
    for event in audit_events:
        event_type = str(event.get("event_type") or "event")
        counts[event_type] = counts.get(event_type, 0) + 1
    latest = audit_events[0]
    latest_label = str(latest.get("event_type") or "event")
    latest_message = str(latest.get("message") or "recorded")
    lines = [
        f"- Events in report: {len(audit_events)}",
        f"- Latest: {latest_label} - {latest_message}",
    ]
    for event_type, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:6]:
        lines.append(f"- {event_type}: {count}")
    return lines


def release_run_report_approval_lines(run: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in steps[:12]:
        if not isinstance(step, dict):
            continue
        details = step.get("details") if isinstance(step.get("details"), dict) else {}
        approval = details.get("approval") if isinstance(details.get("approval"), dict) else {}
        approval_id = str(step.get("approval_id") or approval.get("approval_id") or "").strip()
        if not approval_id:
            continue
        decision = (
            str(approval.get("decision") or approval.get("status") or "pending").strip()
            or "pending"
        )
        reason = str(approval.get("reason") or "").strip()
        gate = str(details.get("gate") or approval.get("gate") or "").strip()
        label = str(step.get("name") or step.get("application_id") or "step")
        suffix = " / ".join(
            item
            for item in [f"gate {gate}" if gate else "", f"reason {reason}" if reason else ""]
            if item
        )
        lines.append(f"- {label}: {approval_id} / {decision}{f' / {suffix}' if suffix else ''}")
    return lines


def release_run_report_target_lines(run: dict[str, Any]) -> list[str]:
    lines: list[str] = []
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in steps[:12]:
        if not isinstance(step, dict):
            continue
        details = step.get("details") if isinstance(step.get("details"), dict) else {}
        config = details.get("config") if isinstance(details.get("config"), dict) else {}
        dispatch = details.get("dispatch") if isinstance(details.get("dispatch"), dict) else {}
        workflow = step.get("workflow") if isinstance(step.get("workflow"), dict) else {}
        values = [
            str(step.get("application_id") or step.get("name") or "application"),
            f"cluster {details.get('cluster_id') or config.get('cluster_id') or dispatch.get('cluster_id')}"
            if details.get("cluster_id") or config.get("cluster_id") or dispatch.get("cluster_id")
            else "",
            f"namespace {details.get('namespace') or config.get('namespace') or dispatch.get('namespace')}"
            if details.get("namespace") or config.get("namespace") or dispatch.get("namespace")
            else "",
            f"workflow {step.get('workflow_run_id') or workflow.get('workflow_run_id') or dispatch.get('workflow_run_id')}"
            if step.get("workflow_run_id")
            or workflow.get("workflow_run_id")
            or dispatch.get("workflow_run_id")
            else "",
            f"repo {config.get('repo_ref') or dispatch.get('repo_ref')}"
            if config.get("repo_ref") or dispatch.get("repo_ref")
            else "",
            f"commit {config.get('commit_sha') or dispatch.get('commit_sha')}"
            if config.get("commit_sha") or dispatch.get("commit_sha")
            else "",
            f"manifest {config.get('manifest_path') or dispatch.get('manifest_path')}"
            if config.get("manifest_path") or dispatch.get("manifest_path")
            else "",
        ]
        lines.append("- " + " / ".join(value for value in values if value))
    return lines


def safe_release_report_filename(value: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "-" for ch in value.strip())
    return safe[:120] or "report"


def release_run_handoff_verification(run: dict[str, Any]) -> dict[str, Any]:
    guard = release_run_latest_guard(run)
    verification = guard.get("verification") if isinstance(guard.get("verification"), dict) else {}
    verification_jobs = (
        guard.get("verification_jobs") if isinstance(guard.get("verification_jobs"), dict) else {}
    )
    readiness = guard.get("readiness") if isinstance(guard.get("readiness"), dict) else {}
    impact = readiness.get("impact") if isinstance(readiness.get("impact"), dict) else {}
    health_paths = [
        str(item) for item in verification.get("health_check_paths", []) if str(item).strip()
    ]
    verification_urls = [
        str(item) for item in verification.get("verification_urls", []) if str(item).strip()
    ]
    production_targets = [
        str(item) for item in verification.get("production_targets", []) if str(item).strip()
    ]
    jobs = [dict(item) for item in verification_jobs.get("jobs", []) if isinstance(item, dict)]
    failed_jobs = [
        item
        for item in jobs
        if release_verification_job_status(item) in VERIFICATION_JOB_FAILED_STATUSES
    ]
    timed_out_jobs = release_verification_job_pending_timeouts(run)
    pending_jobs = [
        item
        for item in jobs
        if release_verification_job_status(item) in VERIFICATION_JOB_PENDING_STATUSES
    ]
    if failed_jobs:
        return {
            "status": "blocked",
            "message": f"{len(failed_jobs)} post-deploy verification job failed.",
            "evidence": [],
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": timed_out_jobs,
            "override_reason": None,
            "production_targets": production_targets
            or (
                impact.get("production_targets")
                if isinstance(impact.get("production_targets"), list)
                else []
            ),
        }
    if timed_out_jobs:
        return {
            "status": "blocked",
            "message": f"{len(timed_out_jobs)} post-deploy verification job timed out.",
            "evidence": [],
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": timed_out_jobs,
            "override_reason": None,
            "production_targets": production_targets
            or (
                impact.get("production_targets")
                if isinstance(impact.get("production_targets"), list)
                else []
            ),
        }
    if pending_jobs:
        return {
            "status": "warning",
            "message": f"{len(pending_jobs)} post-deploy verification job is still pending.",
            "evidence": [],
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": [],
            "override_reason": None,
            "production_targets": production_targets
            or (
                impact.get("production_targets")
                if isinstance(impact.get("production_targets"), list)
                else []
            ),
        }
    if not verification:
        return {
            "status": "info",
            "message": "No verification snapshot recorded.",
            "evidence": [],
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": [],
            "override_reason": None,
            "production_targets": impact.get("production_targets")
            if isinstance(impact.get("production_targets"), list)
            else [],
        }
    evidence = health_paths + verification_urls
    override_reason = str(verification.get("override_reason") or "").strip() or None
    if evidence:
        return {
            "status": "passed",
            "message": f"Post-deploy verification evidence is present ({', '.join(evidence[:2])}).",
            "evidence": evidence,
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": [],
            "override_reason": override_reason,
            "production_targets": production_targets,
        }
    if override_reason:
        return {
            "status": "warning",
            "message": "Post-deploy verification was bypassed with an operator reason.",
            "evidence": [],
            "jobs": jobs,
            "job_count": len(jobs),
            "timed_out_jobs": [],
            "override_reason": override_reason,
            "production_targets": production_targets,
        }
    return {
        "status": "blocked",
        "message": "Post-deploy verification evidence is missing.",
        "evidence": [],
        "jobs": jobs,
        "job_count": len(jobs),
        "timed_out_jobs": [],
        "override_reason": None,
        "production_targets": production_targets,
    }


def release_run_handoff_abort_criteria(run: dict[str, Any]) -> dict[str, Any]:
    guard = release_run_latest_guard(run)
    criteria_snapshot = (
        guard.get("abort_criteria") if isinstance(guard.get("abort_criteria"), dict) else {}
    )
    readiness = guard.get("readiness") if isinstance(guard.get("readiness"), dict) else {}
    impact = readiness.get("impact") if isinstance(readiness.get("impact"), dict) else {}
    criteria = [str(item) for item in criteria_snapshot.get("criteria", []) if str(item).strip()]
    production_targets = [
        str(item) for item in criteria_snapshot.get("production_targets", []) if str(item).strip()
    ]
    if not criteria_snapshot:
        return {
            "status": "info",
            "message": "No rollback criteria snapshot recorded.",
            "criteria": [],
            "override_reason": None,
            "production_targets": impact.get("production_targets")
            if isinstance(impact.get("production_targets"), list)
            else [],
        }
    override_reason = str(criteria_snapshot.get("override_reason") or "").strip() or None
    if criteria:
        return {
            "status": "passed",
            "message": f"Rollback criteria are present ({', '.join(criteria[:2])}).",
            "criteria": criteria,
            "override_reason": override_reason,
            "production_targets": production_targets,
        }
    if override_reason:
        return {
            "status": "warning",
            "message": "Rollback criteria were bypassed with an operator reason.",
            "criteria": [],
            "override_reason": override_reason,
            "production_targets": production_targets,
        }
    return {
        "status": "blocked",
        "message": "Rollback criteria are missing.",
        "criteria": [],
        "override_reason": None,
        "production_targets": production_targets,
    }


def release_run_handoff_change_freeze(run: dict[str, Any]) -> dict[str, Any]:
    guard = release_run_latest_guard(run)
    freeze = guard.get("change_freeze") if isinstance(guard.get("change_freeze"), dict) else {}
    readiness = guard.get("readiness") if isinstance(guard.get("readiness"), dict) else {}
    impact = readiness.get("impact") if isinstance(readiness.get("impact"), dict) else {}
    production_targets = [
        str(item) for item in freeze.get("production_targets", []) if str(item).strip()
    ]
    fallback_targets = (
        impact.get("production_targets")
        if isinstance(impact.get("production_targets"), list)
        else []
    )
    start = str(freeze.get("start") or "").strip() or None
    end = str(freeze.get("end") or "").strip() or None
    override_reason = str(freeze.get("override_reason") or "").strip() or None
    active = freeze.get("active") is True
    if not freeze:
        return {
            "status": "info",
            "message": "No change freeze snapshot recorded.",
            "active": False,
            "start": None,
            "end": None,
            "override_reason": None,
            "production_targets": fallback_targets,
        }
    if active and override_reason:
        status = "warning"
        message = "Active change freeze was bypassed with an operator reason."
    elif active:
        status = "blocked"
        message = "Release is inside an active change freeze window."
    elif start or end:
        status = "passed"
        message = "Change freeze window is not active for this run."
    else:
        status = "info"
        message = "No change freeze window was configured."
    return {
        "status": status,
        "message": message,
        "active": active,
        "start": start,
        "end": end,
        "override_reason": override_reason,
        "production_targets": production_targets or fallback_targets,
    }


def release_run_latest_guard(run: dict[str, Any]) -> dict[str, Any]:
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in reversed(steps):
        if not isinstance(step, dict):
            continue
        details = step.get("details") if isinstance(step.get("details"), dict) else {}
        guard = details.get("release_guard")
        if isinstance(guard, dict):
            return guard
    return {}


def release_run_handoff_actions(
    status: str,
    *,
    terminal: bool,
    retryable: bool,
    alertable: bool,
    rollback_enabled: bool,
    notify_blocker: str | None = None,
    rollback_blocker: str | None = None,
) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    if terminal:
        return [{"action": "review_audit", "label": "Review audit trail", "enabled": True}]
    if status == "paused":
        actions.append(
            {"action": "resume", "label": "Resume when the blocker is cleared", "enabled": True}
        )
    elif status == "waiting_for_approval":
        actions.append(
            {"action": "approval", "label": "Review the pending approval", "enabled": True}
        )
    elif retryable:
        actions.append(
            {"action": "retry", "label": "Retry the failed or unhealthy wave", "enabled": True}
        )
    else:
        actions.append(
            {"action": "monitor", "label": "Monitor current wave health", "enabled": True}
        )
    if alertable:
        actions.append(
            {
                "action": "notify",
                "label": "Notify the release owner",
                "enabled": notify_blocker is None,
                **({"reason": notify_blocker} if notify_blocker else {}),
            }
        )
    actions.append(
        {
            "action": "rollback",
            "label": "Request rollback if user impact is confirmed",
            "enabled": rollback_enabled,
            **({"reason": rollback_blocker} if rollback_blocker and not rollback_enabled else {}),
        }
    )
    actions.append({"action": "cancel", "label": "Cancel if the run should stop", "enabled": True})
    return actions


def release_handoff_check(name: str, status: str, message: str) -> dict[str, str]:
    return {"name": name, "status": status, "message": message}


def release_run_handoff_headline(
    run: dict[str, Any],
    status: str,
    *,
    alertable: bool,
    stale: bool,
) -> str:
    plan_name = str(run.get("plan_name") or "Release run")
    if stale:
        return f"{plan_name} is stale and needs operator follow-up."
    if alertable:
        return f"{plan_name} needs operator attention."
    return f"{plan_name} is {status}."


def release_run_handoff_severity(status: str, *, alertable: bool, stale: bool) -> str:
    if status in {"failed", "rollback_requested"} or stale:
        return "danger"
    if alertable or status in {"paused", "waiting_for_approval"}:
        return "warning"
    return "info"


def release_run_is_retryable(run: dict[str, Any]) -> bool:
    status = str(run.get("derived_status") or run.get("status") or "")
    if status == "failed":
        return True
    steps = run.get("steps") if isinstance(run.get("steps"), list) else []
    for step in steps:
        if not isinstance(step, dict):
            continue
        health = step.get("health") if isinstance(step.get("health"), dict) else {}
        if step.get("status") == "failed" or health.get("status") == "unhealthy":
            return True
    return False


def release_run_last_event(run: dict[str, Any]) -> dict[str, Any] | None:
    events = run.get("events") if isinstance(run.get("events"), list) else []
    for event in reversed(events):
        if isinstance(event, dict):
            return {
                "event_type": str(event.get("event_type") or ""),
                "message": str(event.get("message") or ""),
                "created_at": event.get("created_at"),
            }
    return None


def release_attention_reasons(run: dict[str, Any]) -> list[str]:
    attention = run.get("attention") if isinstance(run.get("attention"), dict) else {}
    reasons = attention.get("reasons") if isinstance(attention, dict) else []
    if isinstance(reasons, list):
        return [str(reason) for reason in reasons if str(reason).strip()]
    return []


def release_audit_events_for_current(
    db: Any,
    current: Any,
    workspace_id: str,
    *,
    plan_id: str | None,
    run_id: str | None,
    event_type: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    events = db.list_release_audit_events(
        workspace_id,
        plan_id=plan_id,
        run_id=run_id,
        event_type=event_type,
        limit=limit,
    )
    for event in events:
        require_plan_application_audit_access(db, current, workspace_id, event.get("_steps", []))
    return events


def public_release_audit_event(event: dict[str, Any]) -> dict[str, Any]:
    public = {key: value for key, value in event.items() if key != "_steps"}
    public["details"] = redact_release_value(public.get("details") or {})
    return public


def release_audit_csv(events: Any) -> str:
    output = io.StringIO()
    fields = [
        "audit_id",
        "created_at",
        "plan_id",
        "plan_name",
        "run_id",
        "run_status",
        "event_type",
        "actor",
        "message",
        "application_ids",
        "details_json",
    ]
    writer = csv.DictWriter(output, fieldnames=fields)
    writer.writeheader()
    for event in events:
        writer.writerow(
            {
                "created_at": event.get("created_at") or "",
                "audit_id": event.get("audit_id") or "",
                "plan_id": event.get("plan_id") or "",
                "plan_name": event.get("plan_name") or "",
                "run_id": event.get("run_id") or "",
                "run_status": event.get("run_status") or "",
                "event_type": event.get("event_type") or "",
                "actor": event.get("actor") or "",
                "message": event.get("message") or "",
                "application_ids": ",".join(event.get("application_ids") or []),
                "details_json": json.dumps(event.get("details") or {}, sort_keys=True),
            }
        )
    return output.getvalue()


def steps_for_wave(
    plan: dict[str, Any],
    preview: dict[str, Any],
    wave: int,
) -> list[dict[str, Any]]:
    preview_steps = [
        item
        for item in preview.get("steps", [])
        if isinstance(item, dict) and item.get("wave") == wave
    ]
    application_ids = {str(step.get("application_id")) for step in preview_steps}
    return [
        step
        for step in plan.get("steps", [])
        if isinstance(step, dict) and str(step.get("application_id")) in application_ids
    ]


def dispatch_request_for_step(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    workspace_id: str,
) -> GitWebhookReceivedBody:
    config = step_config(step)
    plan_settings = plan_settings_value(plan)
    commit_sha = required_str(config, plan_settings, "commit_sha")
    image = required_str(config, plan_settings, "image")
    application_id = str(step["application_id"])
    request_payload = {
        "commit_sha": commit_sha,
        "image": image,
        "replicas": int_field(config, "replicas", int_field(application, "replicas", 2)),
        "workspace_id": workspace_id,
        "repo_ref": str(config.get("repo_ref") or application.get("repo_ref") or ""),
        "branch": str(config.get("branch") or application.get("branch") or "main"),
        "application_id": application_id,
        "environment": str(
            config.get("environment") or first_environment(plan_settings) or "sandbox"
        ),
        "cluster_id": str(
            config.get("cluster_id") or application.get("cluster_id") or Target.DEFAULT_CLUSTER_ID
        ),
        "manifest_path": str(
            config.get("manifest_path") or application.get("manifest_path") or "deploy.yaml"
        ),
        "force": True,
    }
    request_payload["workflow_run_id"] = derive_workflow_run_id(request_payload)
    return GitWebhookReceivedBody(**request_payload)


def release_step_application(
    db: Any,
    workspace_id: str,
    steps: list[dict[str, Any]],
    step_index: int,
) -> dict[str, Any]:
    if step_index < 0 or step_index >= len(steps):
        return {}
    application_id = str(steps[step_index].get("application_id") or "")
    get_application = getattr(db, "get_application", None)
    if not application_id or not callable(get_application):
        return {}
    return dict(get_application(workspace_id, application_id) or {})


def generated_manifest_safe_pr_body(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    rendered: dict[str, Any],
    title: str | None,
    body: str | None,
    workspace_id: str,
) -> SafePrRequestedBody:
    config = step_config(step)
    settings = plan_settings_value(plan)
    files = list(rendered.get("files", []))
    manifest_path = str(files[0].get("path") or config.get("manifest_path") or "deploy.yaml")
    application_id = str(step.get("application_id") or application.get("application_id") or "")
    provider = str(
        config.get("scm_provider") or settings.get("scm_provider") or GitHub.PROVIDER
    ).lower()
    request_basis = {
        "workspace_id": workspace_id,
        "repo_ref": str(config.get("repo_ref") or application.get("repo_ref") or ""),
        "branch": str(config.get("branch") or application.get("branch") or "main"),
        "manifest_path": manifest_path,
        "cluster_id": str(
            config.get("cluster_id") or application.get("cluster_id") or Target.DEFAULT_CLUSTER_ID
        ),
        "namespace": str(
            config.get("namespace") or application.get("namespace") or Sandbox.NAMESPACE
        ),
        "app_name": str(application.get("name") or step.get("name") or application_id),
        "application_id": application_id,
        "environment": str(config.get("environment") or first_environment(settings) or "sandbox"),
        "commit_sha": str(config.get("commit_sha") or settings.get("commit_sha") or ""),
    }
    request_basis["repository_id"] = derive_repository_id(request_basis)
    request_basis["binding_id"] = derive_deployment_binding_id(request_basis)
    request_basis["workflow_run_id"] = derive_workflow_run_id(request_basis)
    patches = [
        SafePrFilePatch(
            path=str(file.get("path") or manifest_path),
            content=str(file.get("content") or ""),
            description=str(file.get("description") or "Generated release manifest"),
        )
        for file in files
        if file.get("content")
    ]
    commit_sha = str(request_basis["commit_sha"])
    workflow_run_id = str(request_basis["workflow_run_id"])
    patches.extend(
        generated_manifest_rollback_patches(
            plan,
            step,
            application,
            manifest_path=manifest_path,
            workflow_run_id=workflow_run_id,
        )
    )
    step_name = str(step.get("name") or application.get("name") or application_id or "release step")
    rollback_paths = [patch.path for patch in patches if patch.path.startswith(".gitops/rollback/")]
    resource_lines = [
        f"- {resource.get('kind')}/{resource.get('name')} ({resource.get('namespace') or '-'})"
        for resource in rendered.get("resources", [])[:12]
        if isinstance(resource, dict)
    ]
    default_body = "\n".join(
        [
            str(rendered.get("summary") or "Generated release manifest update."),
            "",
            "## Release context",
            f"- plan: `{plan.get('name') or plan.get('plan_id') or ''}`",
            f"- step: `{step_name}`",
            f"- application_id: `{application_id}`",
            f"- repo_ref: `{request_basis['repo_ref']}`",
            f"- branch: `{request_basis['branch']}`",
            f"- environment: `{request_basis['environment']}`",
            f"- cluster_id: `{request_basis['cluster_id']}`",
            f"- manifest_path: `{manifest_path}`",
            f"- rollback_patch: `{rollback_paths[0]}`"
            if rollback_paths
            else "- rollback_patch: unavailable",
            "",
            "## Generated resources",
            *(resource_lines or ["- none"]),
        ]
    )
    return SafePrRequestedBody(
        title=title or f"Release manifest update: {step_name}",
        body=body or default_body,
        provider=provider,
        patches=patches,
        workspace_id=workspace_id,
        repository_id=str(request_basis["repository_id"]),
        binding_id=str(request_basis["binding_id"]),
        application_id=application_id,
        workflow_run_id=workflow_run_id,
        environment=str(request_basis["environment"]),
        manifest_path=manifest_path,
        repo_ref=str(request_basis["repo_ref"]),
        base_branch=str(request_basis["branch"]),
        commit_sha=commit_sha,
        patch_sha256=safe_pr_patch_sha256(patches),
        approval_ref=str(config.get("approval_ref") or settings.get("approval_ref") or "") or None,
        policy_decision_ref=str(
            config.get("policy_decision_ref") or settings.get("policy_decision_ref") or ""
        )
        or None,
    )


def generated_manifest_safe_pr_blockers(
    plan: dict[str, Any],
    step: dict[str, Any],
    safe_pr: SafePrRequestedBody,
) -> list[str]:
    if not release_step_targets_production(plan, step):
        return []
    if any(patch.path.startswith(".gitops/rollback/") for patch in safe_pr.patches):
        return []
    return [
        (
            "production generated Safe PR requires rollback_image, previous_image, "
            "current_image, deployed_image, or registered application image before PR creation"
        )
    ]


def generated_manifest_rollback_patches(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
    *,
    manifest_path: str,
    workflow_run_id: str,
) -> list[SafePrFilePatch]:
    rollback_image = rollback_manifest_image(plan, step, application)
    if not rollback_image:
        return []
    rollback_plan = json.loads(json.dumps(plan))
    rollback_steps = rollback_plan.get("steps")
    if not isinstance(rollback_steps, list):
        return []
    step_index = release_step_index_in_steps(rollback_steps, step)
    if step_index < 0:
        return []
    rollback_step = rollback_steps[step_index]
    if not isinstance(rollback_step, dict):
        return []
    rollback_config = rollback_step.setdefault("config", {})
    if not isinstance(rollback_config, dict):
        return []
    rollback_config["image"] = rollback_image
    rollback_config["generated_manifest_path"] = manifest_path
    rollback_rendered = render_release_step_manifest(rollback_plan, step_index, application)
    if any(
        getattr(diag, "severity", "") == "error"
        for diag in rollback_rendered.get("diagnostics", [])
    ):
        return []
    rollback_files = [
        file
        for file in list(rollback_rendered.get("files", []))
        if isinstance(file, dict) and file.get("content")
    ]
    if not rollback_files:
        return []
    return [
        SafePrFilePatch(
            path=generated_manifest_rollback_path(workflow_run_id, manifest_path),
            content=str(rollback_files[0].get("content") or ""),
            description="Generated rollback manifest from current application state",
        )
    ]


def rollback_manifest_image(
    plan: dict[str, Any],
    step: dict[str, Any],
    application: dict[str, Any],
) -> str:
    config = step_config(step)
    settings = plan_settings_value(plan)
    for source, fields in (
        (config, ("rollback_image", "previous_image", "current_image", "deployed_image")),
        (settings, ("rollback_image", "previous_image", "current_image", "deployed_image")),
        (
            application,
            ("rollback_image", "previous_image", "current_image", "deployed_image", "image"),
        ),
    ):
        for field in fields:
            value = str(source.get(field) or "").strip()
            if value:
                return value
    return ""


def release_step_index_in_steps(steps: list[Any], selected: dict[str, Any]) -> int:
    selected_application_id = str(selected.get("application_id") or "")
    selected_position = selected.get("position")
    for index, candidate in enumerate(steps):
        if not isinstance(candidate, dict):
            continue
        if candidate is selected:
            return index
        if (
            selected_application_id
            and str(candidate.get("application_id") or "") == selected_application_id
        ):
            return index
        if selected_position is not None and candidate.get("position") == selected_position:
            return index
    return -1


def generated_manifest_rollback_path(workflow_run_id: str, manifest_path: str) -> str:
    filename = manifest_path.rsplit("/", 1)[-1] or "manifest.yaml"
    if "." not in filename:
        filename = f"{filename}.yaml"
    return f".gitops/rollback/{workflow_run_id}/{filename}"


def step_config(step: dict[str, Any]) -> dict[str, Any]:
    config = step.get("config", {})
    return dict(config) if isinstance(config, dict) else {}


def plan_settings_value(plan: dict[str, Any]) -> dict[str, Any]:
    settings = plan.get("settings", {})
    return dict(settings) if isinstance(settings, dict) else {}


def required_str(
    config: dict[str, Any],
    settings: dict[str, Any],
    field: str,
) -> str:
    value = str(config.get(field) or settings.get(field) or "").strip()
    if not value:
        raise HTTPException(
            status_code=HTTP_CONFLICT,
            detail={
                "message": RELEASE_PLAN_BLOCKED,
                "blockers": [f"{field} is required before dispatch"],
            },
        )
    return value


def int_field(values: dict[str, Any], field: str, fallback: int) -> int:
    raw = values.get(field)
    if isinstance(raw, bool):
        return fallback
    if isinstance(raw, int):
        return raw
    if isinstance(raw, str) and raw.strip().isdigit():
        return int(raw)
    return fallback


def first_environment(settings: dict[str, Any]) -> str:
    order = settings.get("environment_order", [])
    if isinstance(order, list) and order:
        return str(order[0])
    return Sandbox.NAMESPACE
