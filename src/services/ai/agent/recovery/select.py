from __future__ import annotations

from dataclasses import dataclass

from domains.rca.events import (
    RcaActionRequiredBody,
    RecoveryActionSelectedBody,
    RecoveryPlannedBody,
    RecoverySelectionRequestedBody,
)
from packages.contracts.event_bus.bodies import EventBody

NO_PLAN_REASON = "복구 계획이 없습니다."
SELECTION_REQUIRED_REASON = "사용자 복구 조치 선택이 필요합니다."
AUTO_SELECTED_BY = "agent-select"


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

        sorted_candidates = sorted(evt.plan.candidates, key=lambda item: (item.rank, -item.score))
        selected = sorted_candidates[0] if sorted_candidates else None
        if selected is None:
            return RecoverySelectionRequestedBody(
                plan=evt.plan,
                reason=SELECTION_REQUIRED_REASON,
                workspace_id=evt.workspace_id,
            )
        if selected.route == "auto" and not selected.approval_required:
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
            reason=SELECTION_REQUIRED_REASON,
            workspace_id=evt.workspace_id,
        )
