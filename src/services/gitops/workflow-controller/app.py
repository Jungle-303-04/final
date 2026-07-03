"""workflow-controller — GitOps 이벤트 흐름을 사용자 실행 객체로 투영.

기존 git-pull/render/diff/command worker chain은 그대로 둔다. 이 worker는 같은
이벤트를 관찰해 Application, WorkflowRun, WorkflowRunStep, Approval 상태를 기록하고
콘솔이 읽을 수 있는 workflow.* / approval.* 이벤트를 발행한다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Mapping

from domains.command.events import (
    CommandCompletedBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
)
from domains.gitops.events import (
    ApprovalGrantedBody,
    ApprovalRejectedBody,
    ApprovalRequestedBody,
    DiffAnalyzedBody,
    DiffDetectedBody,
    GitChangedBody,
    GitWebhookReceivedBody,
    ManifestInvalidBody,
    ManifestRenderedBody,
    WorkflowCreatedBody,
    WorkflowRunCompletedBody,
    WorkflowRunFailedBody,
    WorkflowRunStartedBody,
    WorkflowStepRecordedBody,
)
from domains.gitops.repository import (
    derive_application_id,
    derive_approval_id,
    derive_deployment_binding_id,
    derive_repository_id,
    derive_watch_target_id,
    derive_workflow_run_id,
)
from domains.scm.events import SafePrCreatedBody, SafePrFailedBody
from packages.config.constants import CommandStatus, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import (
    DEFAULT_ENVIRONMENT,
    ApprovalStatus,
    WorkflowRunStatus,
    WorkflowStepName,
    WorkflowStepStatus,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, AccessRole
from packages.contracts.stores import WorkflowStore
from packages.runtime.app import App, EventContext

app = App("workflow-controller")

DEFAULT_APP_NAME = "checkout-api"
SYSTEM_POLICY_APPROVER = "system-policy"
MANUAL_APPROVAL_ROLE = AccessRole.DEPLOYER.value


def normalize_payload(payload: JsonObject) -> JsonObject:
    repository_id = derive_repository_id(payload)
    watch_target_id = derive_watch_target_id({**payload, "repository_id": repository_id})
    binding_id = derive_deployment_binding_id(
        {**payload, "repository_id": repository_id, "watch_target_id": watch_target_id}
    )
    scoped_payload = {
        **payload,
        "repository_id": repository_id,
        "watch_target_id": watch_target_id,
        "binding_id": binding_id,
    }
    application_id = derive_application_id(scoped_payload)
    enriched = {
        **scoped_payload,
        "application_id": application_id,
        "workflow_run_id": derive_workflow_run_id(
            {**scoped_payload, "application_id": application_id}
        ),
        "workspace_id": str(payload.get("workspace_id", DEFAULT_WORKSPACE_ID)),
        "environment": str(payload.get("environment", DEFAULT_ENVIRONMENT)),
        "cluster_id": str(payload.get("cluster_id", Target.DEFAULT_CLUSTER_ID)),
    }
    return enriched


def gitops_payload(evt: EventBody, app_name: str | None = None) -> JsonObject:
    payload = evt.to_body()
    payload["name"] = app_name or payload.get("name") or DEFAULT_APP_NAME
    return normalize_payload(payload)


def diff_payload(evt: DiffDetectedBody | DiffAnalyzedBody) -> JsonObject:
    diff = evt.diff
    resource_name = diff.resource.split("/", 1)[-1] if "/" in diff.resource else diff.resource
    payload = diff.to_body()
    payload["name"] = resource_name or DEFAULT_APP_NAME
    return normalize_payload(payload)


def rendered_application_name(evt: ManifestRenderedBody) -> str | None:
    """Application 이름 후보는 workload manifest에서만 가져온다.

    한 파일에 Service/ConfigMap이 같이 렌더될 때 부속 리소스 이름이 Application.name을
    덮으면 콘솔에서 앱이 checkout-api-config 같은 이름으로 보인다.
    """
    if evt.rendered_manifest.kind == "Deployment":
        return evt.rendered_manifest.metadata.name
    return None


async def ensure_run(
    ctx: EventContext[WorkflowStore],
    payload: JsonObject,
    status: str,
    current_step: str,
    summary: str,
    metadata: JsonObject | None = None,
) -> JsonObject:
    run = normalize_payload(payload)
    await ctx.db.upsert_application(
        {
            **run,
            "name": str(run.get("name") or DEFAULT_APP_NAME),
            "metadata": {
                "repository_id": run.get("repository_id"),
                "manifest_path": run.get("manifest_path"),
            },
        }
    )
    await ctx.db.start_workflow_run(
        {
            **run,
            "status": status,
            "current_step": current_step,
            "summary": summary,
            "metadata": metadata or {},
        }
    )
    return run


async def transition_run(
    ctx: EventContext[WorkflowStore],
    payload: JsonObject,
    status: str,
    current_step: str,
    summary: str,
    metadata: JsonObject | None = None,
) -> JsonObject:
    run = normalize_payload(payload)
    await ctx.db.update_workflow_run(
        {
            **run,
            "status": status,
            "current_step": current_step,
            "summary": summary,
            "metadata": metadata or {},
        }
    )
    return run


async def record_step(
    ctx: EventContext[WorkflowStore],
    payload: JsonObject,
    step: str,
    status: str,
    message: str | None = None,
    details: JsonObject | None = None,
) -> WorkflowStepRecordedBody:
    run = normalize_payload(payload)
    saved = await ctx.db.record_workflow_step(
        {
            **run,
            "name": step,
            "status": status,
            "message": message,
            "details": details or {},
        }
    )
    return WorkflowStepRecordedBody(
        workflow_run_id=str(saved["workflow_run_id"]),
        application_id=str(run["application_id"]),
        step=step,
        status=status,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        message=message,
        details=details or {},
    )


def approval_payload(payload: JsonObject, reason: str, status: str) -> JsonObject:
    run = normalize_payload(payload)
    approval_id = derive_approval_id(str(run["workflow_run_id"]))
    return {
        **run,
        "approval_id": approval_id,
        "status": status,
        "reason": reason,
        "requested_role": MANUAL_APPROVAL_ROLE,
    }


def command_result_succeeded(result: JsonObject) -> bool:
    return result.get("status") == CommandStatus.COMPLETED and result.get("applied") is not False


@app.on(GitWebhookReceivedBody)
async def on_git_webhook(
    evt: GitWebhookReceivedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await ensure_run(
        ctx,
        gitops_payload(evt),
        WorkflowRunStatus.STARTED.value,
        WorkflowStepName.GIT.value,
        "git webhook received",
        {"commit_sha": evt.commit_sha, "repo_ref": evt.repo_ref},
    )
    yield WorkflowCreatedBody(**workflow_created_fields(run))
    yield WorkflowRunStartedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        workspace_id=str(run["workspace_id"]),
        repository_id=str(run.get("repository_id", "")),
        watch_target_id=str(run.get("watch_target_id", "")),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        cluster_id=str(run["cluster_id"]),
        commit_sha=str(run.get("commit_sha", "")),
        manifest_path=str(run.get("manifest_path", "")),
        status=WorkflowRunStatus.STARTED.value,
        current_step=WorkflowStepName.GIT.value,
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.GIT.value,
        WorkflowStepStatus.RUNNING.value,
        "webhook accepted",
        {"commit_sha": evt.commit_sha, "branch": evt.branch},
    )


@app.on(GitChangedBody)
async def on_git_changed(
    evt: GitChangedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await ensure_run(
        ctx,
        gitops_payload(evt),
        WorkflowRunStatus.RENDERING.value,
        WorkflowStepName.RENDER.value,
        "git change confirmed; rendering manifest",
        {"commit_sha": evt.commit_sha, "branch": evt.branch},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.GIT.value,
        WorkflowStepStatus.SUCCEEDED.value,
        "git change confirmed",
        {"commit_sha": evt.commit_sha},
    )


@app.on(ManifestRenderedBody)
async def on_manifest_rendered(
    evt: ManifestRenderedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    application_name = rendered_application_name(evt)
    payload = gitops_payload(evt, application_name)
    transition = ensure_run if application_name else transition_run
    run = await transition(
        ctx,
        payload,
        WorkflowRunStatus.DIFFING.value,
        WorkflowStepName.DIFF.value,
        "manifest rendered; calculating desired diff",
        {"kind": evt.rendered_manifest.kind, "resource": evt.rendered_manifest.metadata.name},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.RENDER.value,
        WorkflowStepStatus.SUCCEEDED.value,
        "manifest rendered",
        evt.rendered_manifest.to_body(),
    )


@app.on(ManifestInvalidBody)
async def on_manifest_invalid(
    evt: ManifestInvalidBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await ensure_run(
        ctx,
        gitops_payload(evt),
        WorkflowRunStatus.FAILED.value,
        WorkflowStepName.RENDER.value,
        "manifest render failed",
        {"reason": evt.reason},
    )
    step = await record_step(
        ctx,
        run,
        WorkflowStepName.RENDER.value,
        WorkflowStepStatus.FAILED.value,
        evt.reason,
        {"manifest_path": evt.manifest_path},
    )
    yield step
    yield WorkflowRunFailedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=evt.reason,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        details={"manifest_path": evt.manifest_path},
    )


@app.on(DiffDetectedBody)
async def on_diff_detected(
    evt: DiffDetectedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await transition_run(
        ctx,
        diff_payload(evt),
        WorkflowRunStatus.POLICY_CHECKING.value,
        WorkflowStepName.POLICY.value,
        "desired diff detected; checking policy",
        {"resource": evt.diff.resource},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.DIFF.value,
        WorkflowStepStatus.SUCCEEDED.value,
        "desired diff detected",
        evt.diff.to_body(),
    )


@app.on(DiffAnalyzedBody)
async def on_diff_analyzed(
    evt: DiffAnalyzedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = diff_payload(evt)
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.POLICY.value,
        WorkflowStepStatus.SUCCEEDED.value,
        evt.reason,
        {"safe": evt.safe, "risk": evt.risk},
    )

    if evt.diff.is_image_only_noop():
        await transition_run(
            ctx,
            run,
            WorkflowRunStatus.SUCCEEDED.value,
            WorkflowStepName.HEALTH.value,
            Sandbox.NO_DIFF_REASON,
            {"resource": evt.diff.resource},
        )
        yield await record_step(
            ctx,
            run,
            WorkflowStepName.APPLY.value,
            WorkflowStepStatus.SKIPPED.value,
            Sandbox.NO_DIFF_REASON,
            evt.diff.to_body(),
        )
        yield WorkflowRunCompletedBody(
            workflow_run_id=str(run["workflow_run_id"]),
            application_id=str(run["application_id"]),
            workspace_id=str(run["workspace_id"]),
            binding_id=str(run["binding_id"]),
            environment=str(run["environment"]),
            summary=Sandbox.NO_DIFF_REASON,
            details=evt.diff.to_body(),
        )
        return

    if evt.safe:
        approval = approval_payload(run, evt.reason, ApprovalStatus.NOT_REQUIRED.value)
        await ctx.db.request_workflow_approval(approval)
        await ctx.db.resolve_workflow_approval(
            {
                **approval,
                "status": ApprovalStatus.GRANTED.value,
                "decided_by": SYSTEM_POLICY_APPROVER,
                "decision": "auto-approved",
                "details": {"safe": True, "risk": evt.risk},
            }
        )
        await transition_run(
            ctx,
            run,
            WorkflowRunStatus.APPLYING.value,
            WorkflowStepName.SAFE_PR.value,
            "policy auto-approved; creating safe PR",
            {"risk": evt.risk},
        )
        yield await record_step(
            ctx,
            run,
            WorkflowStepName.APPROVAL.value,
            WorkflowStepStatus.SKIPPED.value,
            "approval not required by sandbox policy",
            {"safe": True},
        )
        return

    approval = approval_payload(run, evt.reason, ApprovalStatus.REQUESTED.value)
    saved = await ctx.db.request_workflow_approval(approval)
    await transition_run(
        ctx,
        run,
        WorkflowRunStatus.WAITING_FOR_APPROVAL.value,
        WorkflowStepName.APPROVAL.value,
        "approval required before write",
        {"risk": evt.risk},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPROVAL.value,
        WorkflowStepStatus.PENDING.value,
        evt.reason,
        {"safe": False, "risk": evt.risk},
    )
    yield ApprovalRequestedBody(
        approval_id=str(saved["approval_id"]),
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=evt.reason,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        requested_role=MANUAL_APPROVAL_ROLE,
        details={"risk": evt.risk, "diff": evt.diff.to_body()},
    )


@app.on(SafePrCreatedBody)
async def on_safe_pr_created(
    evt: SafePrCreatedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    yield await record_step(
        ctx,
        gitops_payload(evt),
        WorkflowStepName.SAFE_PR.value,
        WorkflowStepStatus.SUCCEEDED.value,
        "safe PR created",
        {"pr_url": evt.pr_url, "provider": evt.provider, "mode": evt.mode},
    )


@app.on(SafePrFailedBody)
async def on_safe_pr_failed(
    evt: SafePrFailedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await transition_run(
        ctx,
        gitops_payload(evt),
        WorkflowRunStatus.FAILED.value,
        WorkflowStepName.SAFE_PR.value,
        evt.reason,
        {"provider": evt.provider, "title": evt.title},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.SAFE_PR.value,
        WorkflowStepStatus.FAILED.value,
        evt.reason,
        {"provider": evt.provider, "title": evt.title},
    )
    yield WorkflowRunFailedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=evt.reason,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        details={"provider": evt.provider, "title": evt.title},
    )


@app.on(ApprovalGrantedBody)
async def on_approval_granted(
    evt: ApprovalGrantedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = normalize_payload(evt.to_body())
    await ctx.db.resolve_workflow_approval(
        {
            **run,
            "approval_id": evt.approval_id,
            "status": ApprovalStatus.GRANTED.value,
            "decided_by": evt.decided_by,
            "decision": evt.decision,
            "details": evt.details,
        }
    )
    await transition_run(
        ctx,
        run,
        WorkflowRunStatus.APPLYING.value,
        WorkflowStepName.APPLY.value,
        "approval granted; waiting for command execution",
        evt.details,
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPROVAL.value,
        WorkflowStepStatus.SUCCEEDED.value,
        evt.decision,
        evt.details,
    )
    command_payload = evt.details.get("command_requested")
    if isinstance(command_payload, Mapping):
        yield CommandRequestedBody.from_body(command_payload)


@app.on(ApprovalRejectedBody)
async def on_approval_rejected(
    evt: ApprovalRejectedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = normalize_payload(evt.to_body())
    await ctx.db.resolve_workflow_approval(
        {
            **run,
            "approval_id": evt.approval_id,
            "status": ApprovalStatus.REJECTED.value,
            "decided_by": evt.decided_by,
            "decision": "rejected",
            "details": evt.details,
        }
    )
    await transition_run(
        ctx,
        run,
        WorkflowRunStatus.FAILED.value,
        WorkflowStepName.APPROVAL.value,
        evt.reason,
        evt.details,
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPROVAL.value,
        WorkflowStepStatus.FAILED.value,
        evt.reason,
        evt.details,
    )
    yield WorkflowRunFailedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=evt.reason,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        details=evt.details,
    )


@app.on(CommandQueuedForAgentBody)
async def on_command_queued(
    evt: CommandQueuedForAgentBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = await ensure_run(
        ctx,
        gitops_payload(evt),
        WorkflowRunStatus.APPLYING.value,
        WorkflowStepName.APPLY.value,
        "command queued for outbound agent",
        {"command_id": evt.command_id},
    )
    await ctx.db.attach_workflow_command(str(run["workflow_run_id"]), evt.command_id)
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPLY.value,
        WorkflowStepStatus.RUNNING.value,
        "command queued for agent",
        {"command_id": evt.command_id, "cluster_id": evt.cluster_id},
    )


@app.on(CommandRejectedBody)
async def on_command_rejected(
    evt: CommandRejectedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    run = normalize_payload(evt.requested)
    await transition_run(
        ctx,
        run,
        WorkflowRunStatus.FAILED.value,
        WorkflowStepName.APPLY.value,
        evt.reason,
        {"requested": evt.requested},
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPLY.value,
        WorkflowStepStatus.FAILED.value,
        evt.reason,
        {"requested": evt.requested},
    )
    yield WorkflowRunFailedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=evt.reason,
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        details={"requested": evt.requested},
    )


@app.on(CommandCompletedBody)
async def on_command_completed(
    evt: CommandCompletedBody, ctx: EventContext[WorkflowStore]
) -> AsyncIterator[EventBody]:
    identity = await ctx.db.get_workflow_identity_for_command(evt.command_id)
    if identity is None:
        return
    run = normalize_payload(identity)
    succeeded = command_result_succeeded(evt.result)
    run_status = WorkflowRunStatus.SUCCEEDED.value if succeeded else WorkflowRunStatus.FAILED.value
    step_status = (
        WorkflowStepStatus.SUCCEEDED.value if succeeded else WorkflowStepStatus.FAILED.value
    )
    message = str(evt.result.get("message") or evt.result.get("status") or "")
    await ctx.db.attach_workflow_command(str(run["workflow_run_id"]), evt.command_id)
    await ctx.db.update_workflow_run_for_command(
        {
            **run,
            "command_id": evt.command_id,
            "status": run_status,
            "current_step": WorkflowStepName.HEALTH.value,
            "summary": message or run_status,
            "metadata": evt.result,
        }
    )
    yield await record_step(
        ctx,
        run,
        WorkflowStepName.APPLY.value,
        step_status,
        message or run_status,
        {"command_id": evt.command_id, "result": evt.result},
    )
    if succeeded:
        yield await record_step(
            ctx,
            run,
            WorkflowStepName.HEALTH.value,
            WorkflowStepStatus.SUCCEEDED.value,
            "rollout health completed",
            {"command_id": evt.command_id},
        )
        yield WorkflowRunCompletedBody(
            workflow_run_id=str(run["workflow_run_id"]),
            application_id=str(run["application_id"]),
            workspace_id=str(run["workspace_id"]),
            binding_id=str(run["binding_id"]),
            environment=str(run["environment"]),
            summary=message or "workflow succeeded",
            details={"command_id": evt.command_id, "result": evt.result},
        )
        return
    yield WorkflowRunFailedBody(
        workflow_run_id=str(run["workflow_run_id"]),
        application_id=str(run["application_id"]),
        reason=message or "command failed",
        workspace_id=str(run["workspace_id"]),
        binding_id=str(run["binding_id"]),
        environment=str(run["environment"]),
        details={"command_id": evt.command_id, "result": evt.result},
    )


def workflow_created_fields(payload: JsonObject) -> JsonObject:
    return {
        "workspace_id": str(payload["workspace_id"]),
        "application_id": str(payload["application_id"]),
        "workflow_run_id": str(payload["workflow_run_id"]),
        "repository_id": str(payload.get("repository_id", "")),
        "watch_target_id": str(payload.get("watch_target_id", "")),
        "binding_id": str(payload["binding_id"]),
        "environment": str(payload["environment"]),
        "cluster_id": str(payload["cluster_id"]),
        "commit_sha": str(payload.get("commit_sha", "")),
        "manifest_path": str(payload.get("manifest_path", "")),
    }


if __name__ == "__main__":
    app.run()
