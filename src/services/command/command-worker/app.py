"""command-worker entrypoint."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.command.events import CommandRequestedBody
from domains.command.handler import (
    COMMAND_CONFIG,
    handle_command_requested,
    sweep_expired_agent_commands,
)
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
    # 만료 방치 명령 janitor — 명령 이벤트 처리 길목에서 기회적으로 정리(감사 C6).
    # TODO(command): 이벤트 유입이 없으면 sweep 도 멈춤 — 전용 주기 sweep 도입 검토
    async for body in sweep_expired_agent_commands(ctx):
        yield body


if __name__ == "__main__":
    app.run()
