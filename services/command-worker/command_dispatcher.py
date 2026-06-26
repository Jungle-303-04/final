from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Final

from command_policy import CommandPayload
from settings import Settings

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
    def from_payload(cls, command: CommandPayload) -> CommandPlan:
        return cls(
            {
                Gateway.COMMAND_ID: str(uuid.uuid4()),
                Gateway.CLUSTER_ID: command.cluster_id,
                Gateway.ACTION: command.action,
                Gateway.NAMESPACE: command.namespace,
                Field.STEPS: Settings.POLICY_STEPS,
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

    def dispatch_payload(self) -> dict[str, Any]:
        return {
            Field.PLAN: self.data,
            Field.ROUTE: {
                Field.CHANNEL: Settings.AGENT_ROUTE_CHANNEL,
                Gateway.CLUSTER_ID: self.cluster_id,
            },
        }

    def queued_payload(self) -> dict[str, Any]:
        return {
            Gateway.COMMAND_ID: self.command_id,
            Gateway.CLUSTER_ID: self.cluster_id,
        }


class CommandDispatcher:
    def __init__(self, events: EventClient, commands: AgentCommandQueue) -> None:
        self.events = events
        self.commands = commands

    async def dispatch(self, evt: dict[str, Any], plan: CommandPlan) -> None:
        await self.emit(evt, EventSubject.COMMAND_DISPATCH_READY, plan.ready_payload())
        await self.emit(evt, EventSubject.COMMAND_DISPATCHED, plan.dispatch_payload())
        self.commands.queue_agent_command(
            evt[CORRELATION_ID],
            plan.data,
            Settings.COMMAND_STATUS_QUEUED,
        )
        await self.emit(evt, EventSubject.COMMAND_QUEUED_FOR_AGENT, plan.queued_payload())

    async def emit(self, evt: dict[str, Any], subject: str, payload: dict[str, Any]) -> None:
        await self.events.publish(
            subject,
            Settings.SERVICE_NAME,
            payload,
            evt[CORRELATION_ID],
        )
