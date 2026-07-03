"""command-worker entrypoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.command.events import CommandRequestedBody
from domains.command.handler import COMMAND_CONFIG, handle_command_requested
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.stores import AgentCommandStore
from packages.runtime.app import App, EventContext

app = App(COMMAND_CONFIG.service_name)


@app.on(CommandRequestedBody)
async def on_command_requested(
    evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]
) -> AsyncIterator[EventBody]:
    async for body in handle_command_requested(evt, ctx):
        yield body


if __name__ == "__main__":
    app.run()
