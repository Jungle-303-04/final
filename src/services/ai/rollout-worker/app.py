"""rollout-worker — command.completed -> rollout.diagnosed."""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    CommandCompletedBody,
    EventBody,
    RolloutDiagnosedBody,
)
from packages.runtime.app import App

app = App("rollout-worker")


@app.on(CommandCompletedBody)
async def on_command_completed(evt: CommandCompletedBody) -> AsyncIterator[EventBody]:
    applied = bool(evt.result.get("applied"))
    yield RolloutDiagnosedBody(
        diagnosis="rollout command applied" if applied else "rollout command did not apply",
        next_action="observe" if applied else "manual_review",
        details=evt.result,
        workspace_id=str(evt.result.get("workspace_id", "default")),
    )


if __name__ == "__main__":
    app.run()
