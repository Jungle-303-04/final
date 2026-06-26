from __future__ import annotations

from typing import Any

from command_dispatcher import (
    CommandDispatcher,
    CommandDispatchPort,
    CommandPlanner,
    DefaultCommandPlanner,
)
from command_policy import CommandPayload, CommandPolicy, CommandPolicyPort
from settings import CommandConfigPort, Settings

from packages.contracts.event_bus.fields import CORRELATION_ID, PAYLOAD
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.interfaces import AgentCommandQueue


class CommandWorkflow:
    def __init__(
        self,
        events: EventClient,
        commands: AgentCommandQueue,
        config: CommandConfigPort = Settings.CONFIG,
        policy: CommandPolicyPort | None = None,
        planner: CommandPlanner | None = None,
        dispatcher: CommandDispatchPort | None = None,
    ) -> None:
        self.events = events
        self.config = config
        self.policy = policy or CommandPolicy.from_config(config.policy_rules)
        self.planner = planner or DefaultCommandPlanner(config)
        self.dispatcher = dispatcher or CommandDispatcher(events, commands, config)

    async def handle(self, evt: dict[str, Any]) -> None:
        command = CommandPayload(evt[PAYLOAD])
        policy = self.policy.evaluate(command)
        if not policy.allowed:
            await self.reject(
                evt,
                command,
                policy.reason or self.config.default_policy_reject_reason,
            )
            return

        await self.dispatcher.dispatch(evt, self.planner.build(command))

    async def reject(self, evt: dict[str, Any], command: CommandPayload, reason: str) -> None:
        await self.events.publish(
            EventSubject.COMMAND_REJECTED,
            self.config.service_name,
            command.rejected_payload(reason),
            evt[CORRELATION_ID],
        )
