from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Final, Protocol

from command_policy import CommandPayload
from settings import CommandConfigPort

from packages.contracts.event_bus.fields import CORRELATION_ID
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import AgentCommandQueue


class Field:
    CHANNEL: Final[str] = "channel"
    PLAN: Final[str] = "plan"
    ROUTE: Final[str] = "route"
    STEPS: Final[str] = "steps"


@dataclass(frozen=True)
class CommandPlan:
    data: dict[str, Any]

    @classmethod
    def from_payload(cls, command: CommandPayload, config: CommandConfigPort) -> CommandPlan:
        return cls(
            {
                Gateway.COMMAND_ID: str(uuid.uuid4()),
                Gateway.CLUSTER_ID: command.cluster_id,
                Gateway.ACTION: command.value(Gateway.ACTION, config.default_command_action),
                Gateway.NAMESPACE: command.namespace,
                Field.STEPS: list(config.policy_steps),
            }
        )

    @property
    def command_id(self) -> str:
        return self.data[Gateway.COMMAND_ID]

    @property
    def cluster_id(self) -> str:
        return self.data[Gateway.CLUSTER_ID]

    def ready_payload(self) -> dict[str, Any]:
        return {Field.PLAN: self.data}

    def dispatch_payload(self, config: CommandConfigPort) -> dict[str, Any]:
        return {
            Field.PLAN: self.data,
            Field.ROUTE: {
                Field.CHANNEL: config.agent_route_channel,
                Gateway.CLUSTER_ID: self.cluster_id,
            },
        }

    def queued_payload(self) -> dict[str, Any]:
        return {
            Gateway.COMMAND_ID: self.command_id,
            Gateway.CLUSTER_ID: self.cluster_id,
        }


class CommandPlanner(Protocol):
    def build(self, command: CommandPayload) -> CommandPlan: ...


class CommandDispatchPort(Protocol):
    async def dispatch(self, evt: dict[str, Any], plan: CommandPlan) -> None: ...


class DefaultCommandPlanner:
    def __init__(self, config: CommandConfigPort) -> None:
        self.config = config

    def build(self, command: CommandPayload) -> CommandPlan:
        return CommandPlan.from_payload(command, self.config)


class CommandDispatcher:
    def __init__(
        self,
        events: EventClient,
        commands: AgentCommandQueue,
        config: CommandConfigPort,
    ) -> None:
        self.events = events
        self.commands = commands
        self.config = config

    async def dispatch(self, evt: dict[str, Any], plan: CommandPlan) -> None:
        await self.emit(evt, EventSubject.COMMAND_DISPATCH_READY, plan.ready_payload())
        await self.emit(evt, EventSubject.COMMAND_DISPATCHED, plan.dispatch_payload(self.config))
        self.commands.queue_agent_command(
            evt[CORRELATION_ID],
            plan.data,
            self.config.command_status_queued,
        )
        await self.emit(evt, EventSubject.COMMAND_QUEUED_FOR_AGENT, plan.queued_payload())

    async def emit(self, evt: dict[str, Any], subject: str, payload: dict[str, Any]) -> None:
        await self.events.publish(
            subject,
            self.config.service_name,
            payload,
            evt[CORRELATION_ID],
        )
