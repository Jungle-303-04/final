"""approval-worker — selection/rollout events -> approval recommendation."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    ApprovalRecommendedBody,
    EventBody,
    RecoverySelectionRequestedBody,
    RolloutDiagnosedBody,
)
from packages.runtime.app import App

app = App("approval-worker")


@app.on(RecoverySelectionRequestedBody)
async def on_recovery_selection_requested(
    evt: RecoverySelectionRequestedBody,
) -> AsyncIterator[EventBody]:
    yield ApprovalRecommendedBody(
        recommendation="user_selection_required",
        reason=evt.reason,
        details={"plan": evt.plan.to_body()},
        workspace_id=evt.workspace_id,
    )


@app.on(RolloutDiagnosedBody)
async def on_rollout_diagnosed(evt: RolloutDiagnosedBody) -> AsyncIterator[EventBody]:
    yield ApprovalRecommendedBody(
        recommendation=evt.next_action,
        reason=evt.diagnosis,
        details=evt.details,
        workspace_id=evt.workspace_id,
    )


if __name__ == "__main__":
    app.run()
