from __future__ import annotations

from typing import Any

from command_config import CommandConfigPort
from command_dispatcher import (
    DefaultPlanner,
    Dispatcher,
    DispatchPort,
    Planner,
)
from command_policy import Payload, Policy, PolicyPort
from settings import Settings

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
        policy: PolicyPort | None = None,
        planner: Planner | None = None,
        dispatcher: DispatchPort | None = None,
    ) -> None:
        if policy is None:
            policy = Policy.build(config.policy_rules)
        if planner is None:
            planner = DefaultPlanner(config)
        if dispatcher is None:
            dispatcher = Dispatcher(events, commands, config)

        self.events = events
        self.config = config
        self.policy = policy
        self.planner = planner
        self.dispatcher = dispatcher

    async def handle(self, evt: dict[str, Any]) -> None:
        command = Payload(evt[PAYLOAD])
        policy = self.policy.evaluate(command)
        if not policy.allowed:
            await self.reject(
                evt,
                command,
                policy.require_reason(),
            )
            return

        await self.dispatcher.dispatch(evt, self.planner.build(command))

    async def reject(
        self, evt: dict[str, Any], command: Payload, reason: str
    ) -> None:
        await self.events.publish(
            EventSubject.COMMAND_REJECTED,
            self.config.service_name,
            command.rejected_event_payload(reason),
            evt[CORRELATION_ID],
        )
