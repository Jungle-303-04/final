"""diff-analyze-worker — desired.diff.detected → 위험도 분석 → diff.analyzed.

우현 원본 GitOpsSyncWorkflow.handle()의 COMMAND_REQUESTED 직접 발행 블록을
대체. 지금 구조는 diff를 바로 실행 명령으로 보내지 않고 안전 판정 후
safe_pr.requested로 넘겨 repo-gateway가 PR 생성을 맡게 분리.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

import yaml

from domains.alert.events import AlertRequestedBody
from domains.command.events import CommandRequestedBody
from domains.gitops.events import DesiredDesiredDiffDetectedBody, Diff, DiffAnalyzedBody
from domains.gitops.repository import derive_approval_id
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from packages.config.constants import Command, GitHub, RiskLevel, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.gitops import ApprovalStatus
from packages.contracts.identity import ResourceRole
from packages.contracts.stores import PolicyDecisionStore
from packages.runtime.app import App, EventContext

app = App("diff-analyze-worker")

SAFE_REASON = "sandbox 한정 변경이라 안전"
UNSAFE_REASON = "프로덕션 영향 가능 — 검토 필요"
PR_TITLE = "Apply sandbox manifest"
PRE_DEPLOY_ALERT_SEVERITY = "info"
MANIFEST_PATCH_DESCRIPTION = "rendered Kubernetes manifest"
POLICY_ROUTE_NOOP = "noop"
POLICY_ROUTE_SAFE_PR = "safe_pr"
POLICY_ROUTE_APPROVAL_REQUIRED = "approval_required"
POLICY_DECISION_REF_PREFIX = "policy-decision"
SYSTEM_POLICY_APPROVER = "system-policy"


@dataclass(frozen=True)
class PolicyDecision:
    route: str
    safe: bool
    reason: str
    approval_ref: str | None = None
    policy_decision_ref: str | None = None

    def details(self, diff: Diff) -> dict[str, object]:
        return {
            "policy_route": self.route,
            "policy_decision_ref": self.policy_decision_ref,
            "approval_ref": self.approval_ref,
            "safe": self.safe,
            "risk": str(diff.risk),
            "diff": diff.to_body(),
        }


def evaluate_safe_pr_policy(diff: Diff) -> PolicyDecision:
    if diff.is_image_only_noop():
        return PolicyDecision(route=POLICY_ROUTE_NOOP, safe=False, reason=Sandbox.NO_DIFF_REASON)
    approval_ref = derive_approval_id(diff.workflow_run_id)
    if diff.risk == RiskLevel.SANDBOX_ONLY:
        return PolicyDecision(
            route=POLICY_ROUTE_SAFE_PR,
            safe=True,
            reason=SAFE_REASON,
            approval_ref=approval_ref,
            policy_decision_ref=policy_decision_ref(approval_ref, POLICY_ROUTE_SAFE_PR),
        )
    return PolicyDecision(
        route=POLICY_ROUTE_APPROVAL_REQUIRED,
        safe=False,
        reason=UNSAFE_REASON,
        approval_ref=approval_ref,
        policy_decision_ref=policy_decision_ref(approval_ref, POLICY_ROUTE_APPROVAL_REQUIRED),
    )


def policy_decision_ref(approval_ref: str, route: str) -> str:
    return f"{POLICY_DECISION_REF_PREFIX}:{approval_ref}:{route}"


async def persist_policy_decision(
    db: PolicyDecisionStore | Any, diff: Diff, decision: PolicyDecision
) -> None:
    if db is None or not decision.approval_ref:
        return
    request = getattr(db, "request_workflow_approval", None)
    resolve = getattr(db, "resolve_workflow_approval", None)
    if request is None:
        return

    approval_payload = {
        "approval_id": decision.approval_ref,
        "workflow_run_id": diff.workflow_run_id,
        "workspace_id": diff.workspace_id,
        "application_id": diff.application_id,
        "binding_id": diff.binding_id,
        "environment": diff.environment,
        "status": (
            ApprovalStatus.NOT_REQUIRED.value
            if decision.route == POLICY_ROUTE_SAFE_PR
            else ApprovalStatus.REQUESTED.value
        ),
        "reason": decision.reason,
        "requested_role": ResourceRole.RELEASE_OPERATOR.value,
        "details": decision.details(diff),
    }
    await request(approval_payload)
    if decision.route == POLICY_ROUTE_SAFE_PR and resolve is not None:
        await resolve(
            {
                **approval_payload,
                "status": ApprovalStatus.GRANTED.value,
                "decided_by": SYSTEM_POLICY_APPROVER,
                "decision": "auto-approved",
            }
        )


def build_safe_pr_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> SafePrRequestedBody:
    decision = decision or evaluate_safe_pr_policy(diff)
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
        next_alert=build_pre_deploy_alert_request_body(diff, decision),
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


def build_auto_command_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> CommandRequestedBody:
    decision = decision or evaluate_safe_pr_policy(diff)
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
        approval_ref=decision.approval_ref,
        policy_decision_ref=decision.policy_decision_ref,
    )


def build_pre_deploy_alert_request_body(
    diff: Diff, decision: PolicyDecision | None = None
) -> AlertRequestedBody:
    decision = decision or evaluate_safe_pr_policy(diff)
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
    decision = evaluate_safe_pr_policy(diff)
    await persist_policy_decision(ctx.db, diff, decision)
    yield DiffAnalyzedBody(diff=diff, safe=decision.safe, risk=diff.risk, reason=decision.reason)
    if decision.route == POLICY_ROUTE_SAFE_PR:
        # PR 생성 성공 뒤에만 alert/apply 흐름이 이어짐.
        yield build_safe_pr_request_body(diff, decision)


if __name__ == "__main__":
    app.run()
