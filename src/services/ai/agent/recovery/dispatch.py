from __future__ import annotations

from dataclasses import dataclass, field

from domains.command.actions import command_action_for_recovery
from packages.config.constants import GitHub, Sandbox, Target
from packages.contracts.event_bus.bodies import (
    CommandRequestedBody,
    Diff,
    EventBody,
    RcaActionRequiredBody,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
    SafePrRequestedBody,
)
from services.ai.agent.defaults import ActionRoutes

UNKNOWN_ROUTE_REASON = "선택된 복구 후보의 route를 처리할 수 없습니다."
UNSUPPORTED_AUTO_ACTION_REASON = "자동 실행 대상 command action으로 변환할 수 없습니다."


@dataclass(frozen=True)
class RecoveryDispatcher:
    routes: ActionRoutes = field(default_factory=ActionRoutes)

    def dispatch_body(self, evt: RecoveryActionSelectedBody) -> EventBody:
        selected = evt.selected
        if selected.route == self.routes.auto:
            command = build_command_request_body(
                evt.plan,
                selected,
                selected_by=evt.selected_by,
                auto_selected=evt.auto_selected,
            )
            if command is None:
                return RcaActionRequiredBody(
                    reason=f"{UNSUPPORTED_AUTO_ACTION_REASON}: {selected.draft.action_type}",
                    evidence_ref=evt.plan.evidence_ref,
                    workspace_id=evt.workspace_id,
                )
            return command
        if selected.route == self.routes.safe_pr:
            return build_safe_pr_request_body(evt.plan, selected, evt.workspace_id)
        if selected.route == self.routes.approval_required:
            return RcaActionRequiredBody(
                reason=f"승인 필요: {selected.title}",
                evidence_ref=evt.plan.evidence_ref,
                workspace_id=evt.workspace_id,
            )
        if selected.route == self.routes.forbidden:
            return RcaActionRequiredBody(
                reason=f"자동 조치 차단: {selected.title}",
                evidence_ref=evt.plan.evidence_ref,
                workspace_id=evt.workspace_id,
            )
        return RcaActionRequiredBody(
            reason=f"{UNKNOWN_ROUTE_REASON}: {selected.route}",
            evidence_ref=evt.plan.evidence_ref,
            workspace_id=evt.workspace_id,
        )


def build_safe_pr_request_body(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    workspace_id: str,
) -> SafePrRequestedBody:
    draft = selected.draft
    body = (
        f"{plan.summary}\n\n"
        f"선택 조치: {selected.title}\n"
        f"대상: {draft.namespace}/{draft.resource_kind}/{draft.resource_name}\n"
        f"위험도: {selected.risk_level}\n"
        f"영향 범위: {selected.blast_radius}\n\n"
        f"이유:\n{draft.reason}\n\n"
        "검증:\n"
        + "\n".join(f"- {check}" for check in selected.validation_checks)
        + "\n\n롤백:\n"
        + selected.rollback_plan
    )
    return SafePrRequestedBody(
        title=f"{selected.title}: {draft.resource_name}",
        body=body,
        provider=GitHub.PROVIDER,
        workspace_id=workspace_id,
    )


def build_command_request_body(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    *,
    selected_by: str,
    auto_selected: bool,
) -> CommandRequestedBody | None:
    draft = selected.draft
    action = command_action_for(selected)
    if action is None:
        return None
    workspace_id = str(plan.target.get("workspace_id") or draft.params.get("workspace_id"))
    namespace = draft.namespace or Sandbox.NAMESPACE
    return CommandRequestedBody(
        cluster_id=str(plan.target.get("cluster_id") or Target.DEFAULT_CLUSTER_ID),
        action=action,
        namespace=namespace,
        reason=selected.description,
        diff=Diff(
            resource=f"{draft.resource_kind}/{draft.resource_name}",
            namespace=namespace,
            desired_image=f"{action}:{draft.resource_name}",
            actual_image="current",
            risk=Sandbox.RISK_TAG,
            workspace_id=workspace_id,
        ),
        workspace_id=workspace_id,
        requested_by=selected_by,
        actor={
            "plan_id": plan.plan_id,
            "action_id": selected.action_id,
            "auto_selected": auto_selected,
        },
    )


def command_action_for(selected: RecoveryActionCandidate) -> str | None:
    requested = str(selected.draft.params.get("command") or selected.draft.action_type)
    return command_action_for_recovery(requested)
