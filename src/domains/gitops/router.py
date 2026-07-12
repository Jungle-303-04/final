"""gitops 도메인 HTTP 라우터 — GitHub webhook 입구(라우터 단위 HMAC 서명 검증)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any, cast

from fastapi import APIRouter, Body, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

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
from packages.config.settings import env
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    DEFAULT_WEBHOOK_REPLICAS,
    ApprovalDecisionRequest,
    GitHubWebhookRequest,
)
from packages.contracts.gateway.responses import AcceptedEventResponse, AcceptedResponse
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    ApprovalStatus,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission
from packages.events.context import event_workspace
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
GITOPS_WEBHOOK_IMAGE_ENV = "GITOPS_WEBHOOK_IMAGE"
GITHUB_PUSH_EVENT = "push"
GITHUB_PULL_REQUEST_EVENT = "pull_request"


def build_git_webhook_body(payload: GitHubWebhookRequest) -> GitWebhookReceivedBody:
    return GitWebhookReceivedBody(**payload.model_dump())


def github_repo_ref(payload: Mapping[str, Any]) -> str:
    repository = payload.get("repository")
    if not isinstance(repository, Mapping):
        return ""
    return str(repository.get("full_name") or "").strip()


def github_branch_from_ref(ref: str) -> str:
    prefix = "refs/heads/"
    return ref.removeprefix(prefix) if ref.startswith(prefix) else ref


def github_push_commit(payload: Mapping[str, Any]) -> tuple[str, str] | None:
    ref = str(payload.get("ref") or "")
    commit_sha = str(payload.get("after") or "")
    if not ref.startswith("refs/heads/") or not commit_sha or set(commit_sha) == {"0"}:
        return None
    return github_branch_from_ref(ref), commit_sha


def github_merged_pr_commit(payload: Mapping[str, Any]) -> tuple[str, str] | None:
    if str(payload.get("action") or "") != "closed":
        return None
    pull_request = payload.get("pull_request")
    if not isinstance(pull_request, Mapping) or pull_request.get("merged") is not True:
        return None
    base = pull_request.get("base")
    branch = str(base.get("ref") or "") if isinstance(base, Mapping) else ""
    commit_sha = str(pull_request.get("merge_commit_sha") or "")
    if not branch or not commit_sha:
        return None
    return branch, commit_sha


def github_raw_change(payload: Mapping[str, Any], event_name: str) -> tuple[str, str, str] | None:
    repo_ref = github_repo_ref(payload)
    if not repo_ref:
        return None
    if event_name == GITHUB_PULL_REQUEST_EVENT:
        changed = github_merged_pr_commit(payload)
    else:
        changed = github_push_commit(payload)
    if changed is None:
        return None
    branch, commit_sha = changed
    return repo_ref, branch, commit_sha


def body_for_poll_target(
    target: Mapping[str, Any],
    *,
    commit_sha: str,
    image: str,
    correlation_id: str | None = None,
    replicas: int = DEFAULT_WEBHOOK_REPLICAS,
    force: bool = False,
) -> GitWebhookReceivedBody:
    return GitWebhookReceivedBody(
        correlation_id=correlation_id,
        commit_sha=commit_sha,
        image=image,
        replicas=replicas,
        workspace_id=str(target.get("workspace_id") or DEFAULT_WORKSPACE_ID),
        repository_id=str(target.get("repository_id") or DEFAULT_REPOSITORY_ID),
        repo_ref=str(target.get("repo_ref") or DEFAULT_REPO_REF),
        branch=str(target.get("branch") or DEFAULT_REPO_BRANCH),
        watch_target_id=str(target.get("watch_target_id") or DEFAULT_WATCH_TARGET_ID),
        binding_id=str(target.get("binding_id") or DEFAULT_DEPLOYMENT_BINDING_ID),
        application_id=str(target.get("application_id") or DEFAULT_APPLICATION_ID),
        environment=str(target.get("environment") or DEFAULT_ENVIRONMENT),
        cluster_id=str(target.get("cluster_id") or Target.DEFAULT_CLUSTER_ID),
        manifest_path=str(target.get("manifest_path") or DEFAULT_MANIFEST_PATH),
        source_type=str(target.get("source_type") or ""),
        force=force,
    )


def active_github_poll_targets(db: Any | None) -> list[Mapping[str, Any]]:
    if db is None or not hasattr(db, "list_active_github_poll_targets"):
        return []
    return [
        target
        for target in db.list_active_github_poll_targets(limit=1000)
        if isinstance(target, Mapping)
        and str(target.get("workspace_id") or "").strip()
        and str(target.get("repo_ref") or "").strip()
        and str(target.get("branch") or "").strip()
    ]


def poll_target_matches(
    target: Mapping[str, Any],
    *,
    workspace_id: str,
    repository_id: str,
    repo_ref: str,
    branch: str,
    watch_target_id: str,
    binding_id: str,
    application_id: str,
    environment: str,
    cluster_id: str,
    manifest_path: str,
    source_type: str,
) -> bool:
    return (
        str(target.get("workspace_id") or "") == workspace_id
        and str(target.get("repository_id") or "") == repository_id
        and str(target.get("repo_ref") or "").lower() == repo_ref.lower()
        and str(target.get("branch") or "") == branch
        and str(target.get("watch_target_id") or "") == watch_target_id
        and str(target.get("binding_id") or "") == binding_id
        and str(target.get("application_id") or "") == application_id
        and str(target.get("environment") or "") == environment
        and str(target.get("cluster_id") or "") == cluster_id
        and str(target.get("manifest_path") or "") == manifest_path
        and str(target.get("source_type") or "") == source_type
    )


def build_git_webhook_bodies(
    payload: Mapping[str, Any],
    *,
    db: Any | None = None,
    event_name: str = "",
) -> list[GitWebhookReceivedBody]:
    targets = active_github_poll_targets(db)
    try:
        requested = build_git_webhook_body(GitHubWebhookRequest(**dict(payload)))
    except ValidationError:
        requested = None
    if requested is not None:
        matched = [
            target
            for target in targets
            if poll_target_matches(
                target,
                workspace_id=requested.workspace_id,
                repository_id=requested.repository_id,
                repo_ref=requested.repo_ref,
                branch=requested.branch,
                watch_target_id=requested.watch_target_id,
                binding_id=requested.binding_id,
                application_id=requested.application_id,
                environment=requested.environment,
                cluster_id=requested.cluster_id,
                manifest_path=requested.manifest_path,
                source_type=requested.source_type,
            )
        ]
        return [
            body_for_poll_target(
                target,
                commit_sha=requested.commit_sha,
                image=requested.image,
                correlation_id=requested.correlation_id,
                replicas=requested.replicas,
                force=requested.force,
            )
            for target in matched
        ]
    raw_change = github_raw_change(payload, event_name)
    if raw_change is None:
        return []
    image = env(GITOPS_WEBHOOK_IMAGE_ENV, "")
    if not image:
        raise HTTPException(status_code=503, detail="gitops webhook image not configured")
    repo_ref, branch, commit_sha = raw_change
    matched = [
        body_for_poll_target(target, commit_sha=commit_sha, image=image)
        for target in targets
        if str(target.get("repo_ref") or "").lower() == repo_ref.lower()
        and str(target.get("branch") or "") == branch
    ]
    return matched


def accepted_event_response(accepted: Any) -> AcceptedEventResponse:
    return AcceptedEventResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        event=accepted.event.to_dict(),
    )


@router.post(gateway_routes.GITHUB_WEBHOOK_PATH, response_model=AcceptedEventResponse)
async def github_webhook(
    request: Request,
    payload: dict[str, Any] = Body(...),
    events: Any = Depends(get_events),
    db: Any = Depends(get_db),
) -> AcceptedEventResponse | JSONResponse:
    bodies = build_git_webhook_bodies(
        payload,
        db=db,
        event_name=request.headers.get("x-github-event", ""),
    )
    if not bodies:
        return JSONResponse(
            status_code=202,
            content={"accepted": True, "ignored": True, "reason": "no deployable git change"},
        )
    first = None
    for body in bodies:
        with event_workspace(body.workspace_id):
            accepted = await events.accept_body(body)
        if first is None:
            first = accepted
    return accepted_event_response(first)


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
