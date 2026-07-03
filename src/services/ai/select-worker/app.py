"""select-worker — recovery.planned -> recovery.action_selected or selection request."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import EventBody, RecoveryPlannedBody
from packages.runtime.app import App
from services.ai.agent.recovery.select import RecoverySelector

app = App("select-worker")
selector = RecoverySelector()


@app.on(RecoveryPlannedBody)
async def on_recovery_planned(evt: RecoveryPlannedBody) -> AsyncIterator[EventBody]:
    yield selector.select_body(evt)


if __name__ == "__main__":
    app.run()
