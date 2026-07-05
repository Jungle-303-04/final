"""select-worker — recovery.planned -> recovery.action_selected or selection request."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import RecoveryPlannedBody, RecoverySelectionRequestedBody
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import RecoveryPlanStore
from packages.runtime.app import App, EventContext
from services.ai.agent.recovery.select import RecoverySelector

app = App("select-worker")
selector = RecoverySelector()


@app.on(RecoveryPlannedBody)
async def on_recovery_planned(
    evt: RecoveryPlannedBody,
    ctx: EventContext[RecoveryPlanStore],
) -> AsyncIterator[EventBody]:
    body = selector.select_body(evt)
    if isinstance(body, RecoverySelectionRequestedBody) and ctx.db is not None:
        await ctx.db.upsert_recovery_selection_request(
            ctx.correlation_id,
            body.workspace_id,
            body.plan.to_body(),
        )
    yield body


if __name__ == "__main__":
    app.run()
