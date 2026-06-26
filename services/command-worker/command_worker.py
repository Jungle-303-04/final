from __future__ import annotations

from typing import Any

from command_dispatcher import CommandDispatcher, CommandPlan
from command_policy import CommandPayload, CommandPolicy
from settings import Settings

from packages.contracts.event_bus.fields import CORRELATION_ID, PAYLOAD
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.interfaces import AgentCommandQueue


class CommandWorkflow:
    def __init__(self, events: EventClient, commands: AgentCommandQueue) -> None:
        self.events = events
        self.policy = CommandPolicy()
        self.dispatcher = CommandDispatcher(events, commands)

    async def handle(self, evt: dict[str, Any]) -> None:
        command = CommandPayload(evt[PAYLOAD])
        policy = self.policy.evaluate(command)
        if not policy.allowed:
            await self.reject(evt, command, policy.reason or "command policy rejected")
            return

        await self.dispatcher.dispatch(evt, CommandPlan.from_payload(command))

    async def reject(self, evt: dict[str, Any], command: CommandPayload, reason: str) -> None:
        await self.events.publish(
            EventSubject.COMMAND_REJECTED,
            Settings.SERVICE_NAME,
            command.rejected_payload(reason),
            evt[CORRELATION_ID],
        )
