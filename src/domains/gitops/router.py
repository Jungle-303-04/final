"""gitops 도메인 HTTP 라우터 — GitHub webhook 입구(라우터 단위 HMAC 서명 검증)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException

from domains.command.events import CommandRequestedBody
from domains.gitops.dependencies import verify_github_signature
from domains.gitops.events import (
    ApprovalGrantedBody,
    ApprovalRejectedBody,
    Diff,
    GitWebhookReceivedBody,
)
from domains.identity.dependencies import require_cluster_access, require_session
from packages.config.constants import Command, Sandbox, Target
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import ApprovalDecisionRequest, GitHubWebhookRequest
from packages.contracts.gateway.responses import AcceptedEventResponse, AcceptedResponse
from packages.contracts.gitops import ApprovalStatus
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null
from packages.storage.retry import async_retry_db_conflict

router = APIRouter(dependencies=[Depends(verify_github_signature)])
approval_router = APIRouter()
APPROVAL_NOT_FOUND = "approval not found"
APPROVAL_DIFF_MISSING = "approval diff is missing"
APPROVAL_ACCESS_DENIED = "approval access denied"
APPROVAL_CONFLICT = "approval already resolved"
HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409


def build_git_webhook_body(payload: GitHubWebhookRequest) -> GitWebhookReceivedBody:
    return GitWebhookReceivedBody(**payload.model_dump())


@router.post(gateway_routes.GITHUB_WEBHOOK_PATH, response_model=AcceptedEventResponse)
async def github_webhook(
    payload: GitHubWebhookRequest, events: Any = Depends(get_events)
) -> AcceptedEventResponse:
    accepted = await events.accept_body(build_git_webhook_body(payload))
    return AcceptedEventResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        event=accepted.event.to_dict(),
    )


def approval_details(record: Mapping[str, Any]) -> dict[str, Any]:
    details = record.get("details", {})
    return dict(details) if isinstance(details, Mapping) else {}


def approval_diff(record: Mapping[str, Any]) -> Diff:
    raw = approval_details(record).get("diff")
    if not isinstance(raw, Mapping):
        raise HTTPException(status_code=HTTP_CONFLICT, detail=APPROVAL_DIFF_MISSING)
    return cast(Diff, Diff.from_body(raw))


def ensure_approval_is_open(record: Mapping[str, Any]) -> None:
    if str(record.get("status")) not in {"requested", "not_required"}:
        raise HTTPException(status_code=HTTP_CONFLICT, detail=APPROVAL_CONFLICT)


def require_approval_deploy_access(db: Any, current: Any, workspace_id: str, diff: Diff) -> None:
    require_cluster_access(
        db,
        current,
        workspace_id,
        diff.cluster_id or Target.DEFAULT_CLUSTER_ID,
        Permission.DEPLOY_RUN.value,
        detail=APPROVAL_ACCESS_DENIED,
    )


def approval_command_request(
    record: Mapping[str, Any],
    diff: Diff,
    reason: str | None,
    user_id: str,
) -> CommandRequestedBody:
    details = approval_details(record)
    policy_ref = str(
        details.get("policy_decision_ref") or f"approval:{record['approval_id']}:granted"
    )
    return CommandRequestedBody(
        cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID,
        action=Command.APPLY_MANIFEST_ACTION,
        namespace=diff.namespace or Sandbox.NAMESPACE,
        reason=reason or "approval granted",
        diff=diff,
        workspace_id=str(record["workspace_id"]),
        application_id=str(record["application_id"]),
        workflow_run_id=str(record["workflow_run_id"]),
        binding_id=str(record["binding_id"]),
        environment=str(record["environment"]),
        requested_by=user_id,
        approval_ref=str(record["approval_id"]),
        policy_decision_ref=policy_ref,
    )


def approval_record_or_404(db: Any, approval_id: str, workspace_id: str) -> dict[str, Any]:
    record = db.get_workflow_approval(approval_id, workspace_id)
    if record is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=APPROVAL_NOT_FOUND)
    return record


def resolve_approval_or_409(
    db: Any,
    approval_id: str,
    workspace_id: str,
    status: str,
    decided_by: str,
    decision: str,
    details: dict[str, Any],
) -> None:
    """열린 승인을 원자 UPDATE 로 해결 — 이미 해결됐으면 409.

    검사와 갱신이 한 문장이라 동시 grant/reject 중 첫 요청만 통과하고,
    이벤트(ApprovalGranted/Rejected)는 이 갱신이 성공한 경우에만 발행됨.
    """
    resolved = db.resolve_workflow_approval_if_open(
        approval_id, workspace_id, status, decided_by, decision, details
    )
    if not resolved:
        raise HTTPException(status_code=HTTP_CONFLICT, detail=APPROVAL_CONFLICT)


@approval_router.post(gateway_routes.APPROVAL_GRANT_PATH, response_model=AcceptedResponse)
async def grant_approval(
    approval_id: str,
    payload: ApprovalDecisionRequest | None = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    payload = payload or ApprovalDecisionRequest()
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)

    async def resolve_and_emit() -> Any:
        record = approval_record_or_404(db, approval_id, workspace_id)
        ensure_approval_is_open(record)
        diff = approval_diff(record)
        require_approval_deploy_access(db, current, workspace_id, diff)
        command = approval_command_request(record, diff, payload.reason, current.user_id)
        details = {
            **approval_details(record),
            "decision_reason": payload.reason,
            "command_requested": command.to_body(),
        }
        # 승인 해결(원자 UPDATE)과 이벤트 스테이징을 한 트랜잭션으로 — 이벤트 스테이징이
        # 실패하면 해결도 롤백되어 '해결됐지만 후속 이벤트 없는' 고아 승인 방지.
        with unit_of_work_or_null(db):
            resolve_approval_or_409(
                db,
                approval_id,
                workspace_id,
                ApprovalStatus.GRANTED.value,
                current.user_id,
                "granted",
                details,
            )
            return await events.accept_body(
                ApprovalGrantedBody(
                    approval_id=approval_id,
                    workflow_run_id=str(record["workflow_run_id"]),
                    application_id=str(record["application_id"]),
                    workspace_id=workspace_id,
                    binding_id=str(record["binding_id"]),
                    environment=str(record["environment"]),
                    decided_by=current.user_id,
                    decision="granted",
                    details=details,
                ),
                actor=Actor(current.user_id, tuple(current.roles)),
            )

    accepted = await async_retry_db_conflict(resolve_and_emit)
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )


@approval_router.post(gateway_routes.APPROVAL_REJECT_PATH, response_model=AcceptedResponse)
async def reject_approval(
    approval_id: str,
    payload: ApprovalDecisionRequest | None = None,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    payload = payload or ApprovalDecisionRequest()
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)

    async def resolve_and_emit() -> Any:
        record = approval_record_or_404(db, approval_id, workspace_id)
        ensure_approval_is_open(record)
        diff = approval_diff(record)
        require_approval_deploy_access(db, current, workspace_id, diff)
        reason = payload.reason or "approval rejected"
        details = {**approval_details(record), "decision_reason": reason}
        # grant 와 동일 — 해결과 이벤트 스테이징을 한 트랜잭션으로 묶음.
        with unit_of_work_or_null(db):
            resolve_approval_or_409(
                db,
                approval_id,
                workspace_id,
                ApprovalStatus.REJECTED.value,
                current.user_id,
                "rejected",
                details,
            )
            return await events.accept_body(
                ApprovalRejectedBody(
                    approval_id=approval_id,
                    workflow_run_id=str(record["workflow_run_id"]),
                    application_id=str(record["application_id"]),
                    reason=reason,
                    workspace_id=workspace_id,
                    binding_id=str(record["binding_id"]),
                    environment=str(record["environment"]),
                    decided_by=current.user_id,
                    details=details,
                ),
                actor=Actor(current.user_id, tuple(current.roles)),
            )

    accepted = await async_retry_db_conflict(resolve_and_emit)
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )
