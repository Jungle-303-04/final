"""diff-analyze-worker — desired.diff.detected → 위험도 분석 → diff.analyzed.

우현 원본 GitOpsSyncWorkflow.handle()의 COMMAND_REQUESTED 직접 발행 블록을
대체. 지금 구조는 diff를 바로 실행 명령으로 보내지 않고 안전 판정 후
safe_pr.requested로 넘겨 repo-gateway가 PR 생성을 맡게 분리.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.config.constants import Command, GitHub, Sandbox, Target
from packages.contracts.event_bus.bodies import (
    AlertRequestedBody,
    CommandRequestedBody,
    Diff,
    DiffAnalyzedBody,
    DiffDetectedBody,
    EventBody,
    SafePrRequestedBody,
)
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"
PR_TITLE = "Apply sandbox manifest"
PRE_DEPLOY_ALERT_SEVERITY = "info"


def evaluate_safe_pr_policy(diff: Diff) -> tuple[bool, str]:
    # TODO(gitops): risk string check를 operation, namespace, RBAC policy rule로 교체
    # TODO(gitops): production 영향 시 approval_required/forbidden route 반환
    if diff.desired_image == diff.actual_image:
        return False, Sandbox.NO_DIFF_REASON
    safe = diff.risk == Sandbox.RISK_TAG
    return safe, SAFE_REASON if safe else UNSAFE_REASON


def build_safe_pr_request(diff: Diff) -> SafePrRequestedBody:
    # TODO(gitops): rendered manifest patch, rollback plan, reviewer checklist 포함
    summary = (
        f"{diff.resource}: {diff.actual_image} → {diff.desired_image}"
        if diff.desired_image
        else f"{diff.resource}: apply rendered manifest"
    )
    return SafePrRequestedBody(
        title=PR_TITLE,
        body=summary,
        provider=GitHub.PROVIDER,
        workspace_id=diff.workspace_id,
        repository_id=diff.repository_id,
        binding_id=diff.binding_id,
        application_id=diff.application_id,
        workflow_run_id=diff.workflow_run_id,
        environment=diff.environment,
        manifest_path=diff.manifest_path,
    )


def build_auto_command_request(diff: Diff) -> CommandRequestedBody:
    # TODO(gitops): workspace/repo/cluster environment별 auto deploy route policy화
    return CommandRequestedBody(
        cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID,
        action=Command.APPLY_MANIFEST_ACTION,
        namespace=diff.namespace,
        reason="safe sandbox gitops apply",
        diff=diff,
        workspace_id=diff.workspace_id,
        application_id=diff.application_id,
        workflow_run_id=diff.workflow_run_id,
        binding_id=diff.binding_id,
        environment=diff.environment,
    )


def build_pre_deploy_alert_request(diff: Diff) -> AlertRequestedBody:
    # TODO(alert): deployment window, blast radius, approver list, rollback metadata 포함
    return AlertRequestedBody(
        cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID,
        namespace=diff.namespace,
        severity=PRE_DEPLOY_ALERT_SEVERITY,
        message=f"pre-deploy check passed for {diff.resource}",
        reason="safe sandbox deploy will continue after alert gate",
        next_command=build_auto_command_request(diff),
        workspace_id=diff.workspace_id,
        application_id=diff.application_id,
        workflow_run_id=diff.workflow_run_id,
        binding_id=diff.binding_id,
        environment=diff.environment,
    )


@app.on(DiffDetectedBody)
async def on_desired_diff(evt: DiffDetectedBody, ctx: EventContext) -> AsyncIterator[EventBody]:
    diff = evt.diff
    safe, reason = evaluate_safe_pr_policy(diff)
    yield DiffAnalyzedBody(diff=diff, safe=safe, risk=diff.risk, reason=reason)
    if safe:
        # 우현 원본 보존(GitOpsSyncWorkflow.handle 중 command.requested 직접 발행):
        #
        # await self.events.publish(
        #     EventSubject.COMMAND_REQUESTED,
        #     SERVICE_NAME,
        #     {
        #         "cluster_id": env(TARGET_CLUSTER_ENV, DEFAULT_TARGET_CLUSTER_ID),
        #         "action": SYNC_ACTION,
        #         "namespace": SANDBOX_NAMESPACE,
        #         "reason": SYNC_REASON,
        #         "diff": diff,
        #     },
        #     evt["correlation_id"],
        # )
        #
        # 현재 split 구조: diff를 바로 실행 command로 보내지 않는 흐름
        # 안전 판정 후 safe_pr.requested와 pre-deploy alert gate 발행
        # alert-worker gate 통과 후 command.requested 연결
        yield build_safe_pr_request(diff)
        yield build_pre_deploy_alert_request(diff)


if __name__ == "__main__":
    app.run()
