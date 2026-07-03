"""dispatch-worker — recovery.action_selected -> command or PR request."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import EventBody, RecoveryActionSelectedBody
from packages.runtime.app import App
from services.ai.agent.recovery.dispatch import RecoveryDispatcher

app = App("dispatch-worker")
dispatcher = RecoveryDispatcher()


@app.on(RecoveryActionSelectedBody)
async def on_recovery_action_selected(
    evt: RecoveryActionSelectedBody,
) -> AsyncIterator[EventBody]:
    yield dispatcher.dispatch_body(evt)


if __name__ == "__main__":
    app.run()
