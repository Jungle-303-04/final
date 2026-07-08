from __future__ import annotations

from dataclasses import dataclass

from domains.command.actions import command_action_for_recovery, command_action_spec
from domains.rca.events import (
    RcaActionRequiredBody,
    RecoveryActionSelectedBody,
    RecoveryPlannedBody,
    RecoverySelectionRequestedBody,
)
from packages.contracts.event_bus.bodies import EventBody
from services.ai.agent.recovery.engine import recovery_candidate_sort_key

NO_PLAN_REASON = "복구 계획이 없습니다."
SELECTION_REQUIRED_REASON = "사용자 복구 조치 선택이 필요합니다."
AUTO_SELECTED_BY = "agent-select"
APPROVAL_REQUIRED_COMMAND_REASON = "선택 후보가 승인 필요한 command action입니다."


@dataclass(frozen=True)
class RecoverySelector:
    def select_body(self, evt: RecoveryPlannedBody) -> EventBody:
        if evt.plan is None:
            return RcaActionRequiredBody(
                reason=NO_PLAN_REASON,
                evidence_ref=evt.draft.source_evidence[0]
                if evt.draft.source_evidence
                else "unknown",
                workspace_id=evt.workspace_id,
            )

        sorted_candidates = sorted(evt.plan.candidates, key=recovery_candidate_sort_key)
        selected = sorted_candidates[0] if sorted_candidates else None
        if selected is None:
            return RecoverySelectionRequestedBody(
                plan=evt.plan,
                reason=SELECTION_REQUIRED_REASON,
                workspace_id=evt.workspace_id,
            )
        if (
            selected.route == "auto"
            and not selected.approval_required
            and not requires_approval(selected)
        ):
            return RecoveryActionSelectedBody(
                plan=evt.plan,
                selected=selected,
                selected_by=AUTO_SELECTED_BY,
                auto_selected=True,
                reason="승인 없이 실행 가능한 후보를 자동 선택했습니다.",
                workspace_id=evt.workspace_id,
            )
        return RecoverySelectionRequestedBody(
            plan=evt.plan,
            reason=selection_reason(selected),
            workspace_id=evt.workspace_id,
        )


def requires_approval(candidate: object) -> bool:
    action_type = getattr(getattr(candidate, "draft", None), "action_type", "")
    params = getattr(getattr(candidate, "draft", None), "params", {}) or {}
    requested = str(params.get("command") or action_type)
    action = command_action_for_recovery(requested)
    spec = command_action_spec(action) if action else None
    return bool(spec is not None and spec.requires_approval)


def selection_reason(candidate: object) -> str:
    if requires_approval(candidate):
        return APPROVAL_REQUIRED_COMMAND_REASON
    return SELECTION_REQUIRED_REASON
