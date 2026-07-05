"""approval-worker — selection/rollout events -> approval recommendation."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import (
    ApprovalRecommendedBody,
    RecoverySelectionRequestedBody,
    RolloutDiagnosedBody,
)
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RecoveryPlanStore
from packages.runtime.app import App, EventContext

app = App("approval-worker")


@app.on(RecoverySelectionRequestedBody)
async def on_recovery_selection_requested(
    evt: RecoverySelectionRequestedBody,
    ctx: EventContext[RecoveryPlanStore],
) -> AsyncIterator[EventBody]:
    if ctx.db is not None:
        await ctx.db.upsert_recovery_selection_request(
            ctx.correlation_id,
            evt.workspace_id,
            evt.plan.to_body(),
        )
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
