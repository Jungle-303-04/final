"""diff-analyze-worker — desired.diff.detected → 위험도 분석 → diff.analyzed.

우현 원본 GitOpsSyncWorkflow.handle()의 COMMAND_REQUESTED 직접 발행 블록을
대체. 지금 구조는 diff를 바로 실행 명령으로 보내지 않고 안전 판정 후
safe_pr.requested로 넘겨 repo-gateway가 PR 생성을 맡게 분리.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import yaml

from domains.alert.events import AlertRequestedBody
from domains.command.events import CommandRequestedBody
from domains.gitops.events import DesiredDesiredDiffDetectedBody, Diff, DiffAnalyzedBody
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from packages.config.constants import Command, GitHub, RiskLevel, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"
PR_TITLE = "Apply sandbox manifest"
PRE_DEPLOY_ALERT_SEVERITY = "info"
MANIFEST_PATCH_DESCRIPTION = "rendered Kubernetes manifest"


def evaluate_safe_pr_policy(diff: Diff) -> tuple[bool, str]:
    # TODO(gitops): risk enum check를 operation, namespace, RBAC policy rule로 교체
    # TODO(gitops): production 영향 시 approval_required/forbidden route 반환
    if diff.is_image_only_noop():
        return False, Sandbox.NO_DIFF_REASON
    safe = diff.risk is RiskLevel.SANDBOX_ONLY
    return safe, SAFE_REASON if safe else UNSAFE_REASON


def build_safe_pr_request_body(diff: Diff) -> SafePrRequestedBody:
    summary = (
        f"{diff.resource}: {diff.actual_image} → {diff.desired_image}"
        if diff.desired_image and diff.desired_image != diff.actual_image
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
        patches=build_manifest_patches(diff),
        next_alert=build_pre_deploy_alert_request_body(diff),
    )


def build_manifest_patches(diff: Diff) -> list[SafePrFilePatch]:
    if not diff.desired_manifest:
        return []
    return [
        SafePrFilePatch(
            path=diff.manifest_path,
            content=yaml.safe_dump(
                diff.desired_manifest,
                sort_keys=False,
                allow_unicode=True,
            ),
            description=MANIFEST_PATCH_DESCRIPTION,
        )
    ]


def build_auto_command_request_body(diff: Diff) -> CommandRequestedBody:
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


def build_pre_deploy_alert_request_body(diff: Diff) -> AlertRequestedBody:
    # TODO(alert): deployment window, blast radius, approver list, rollback metadata 포함
    return AlertRequestedBody(
        cluster_id=diff.cluster_id or Target.DEFAULT_CLUSTER_ID,
        namespace=diff.namespace,
        severity=PRE_DEPLOY_ALERT_SEVERITY,
        message=f"pre-deploy check passed for {diff.resource}",
        reason="safe sandbox deploy will continue after alert gate",
        next_command=build_auto_command_request_body(diff),
        workspace_id=diff.workspace_id,
        application_id=diff.application_id,
        workflow_run_id=diff.workflow_run_id,
        binding_id=diff.binding_id,
        environment=diff.environment,
    )


@app.on(DesiredDesiredDiffDetectedBody)
async def on_desired_diff(
    evt: DesiredDesiredDiffDetectedBody, ctx: EventContext
) -> AsyncIterator[EventBody]:
    diff = evt.diff
    safe, reason = evaluate_safe_pr_policy(diff)
    yield DiffAnalyzedBody(diff=diff, safe=safe, risk=diff.risk, reason=reason)
    if safe:
        # PR 생성 성공 뒤에만 alert/apply 흐름이 이어짐.
        yield build_safe_pr_request_body(diff)


if __name__ == "__main__":
    app.run()
