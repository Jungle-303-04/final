from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any, Final, Protocol

from command_config import CommandConfigPort
from command_policy import Payload

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
class Plan:
    data: dict[str, Any]

    @classmethod
    def build(cls, command: Payload, config: CommandConfigPort) -> Plan:
        return cls(
            {
                Gateway.COMMAND_ID: str(uuid.uuid4()),
                Gateway.CLUSTER_ID: command.cluster_id or config.default_cluster_id,
                Gateway.ACTION: command.action or config.default_command_action,
                Gateway.NAMESPACE: command.namespace or config.default_namespace,
                Field.STEPS: list(config.policy_steps),
            }
        )

    @property
    def command_id(self) -> str:
        return self.data[Gateway.COMMAND_ID]

    @property
    def cluster_id(self) -> str:
        return self.data[Gateway.CLUSTER_ID]

    def ready_event_payload(self) -> dict[str, Any]:
        return {Field.PLAN: self.data}

    def dispatched_event_payload(self, config: CommandConfigPort) -> dict[str, Any]:
        return {
            Field.PLAN: self.data,
            Field.ROUTE: {
                Field.CHANNEL: config.agent_route_channel,
                Gateway.CLUSTER_ID: self.cluster_id,
            },
        }

    def queued_event_payload(self) -> dict[str, Any]:
        return {
            Gateway.COMMAND_ID: self.command_id,
            Gateway.CLUSTER_ID: self.cluster_id,
        }


class Planner(Protocol):
    def build(self, command: Payload) -> Plan: ...


class DispatchPort(Protocol):
    async def dispatch(self, evt: dict[str, Any], plan: Plan) -> None: ...


class DefaultPlanner:
    def __init__(self, config: CommandConfigPort) -> None:
        self.config = config

    def build(self, command: Payload) -> Plan:
        return Plan.build(command, self.config)


class Dispatcher:
    def __init__(
        self,
        events: EventClient,
        commands: AgentCommandQueue,
        config: CommandConfigPort,
    ) -> None:
        self.events = events
        self.commands = commands
        self.config = config

    async def dispatch(self, evt: dict[str, Any], plan: Plan) -> None:
        await self.publish_event(
            evt,
            EventSubject.COMMAND_DISPATCH_READY,
            plan.ready_event_payload(),
        )
        await self.publish_event(
            evt,
            EventSubject.COMMAND_DISPATCHED,
            plan.dispatched_event_payload(self.config),
        )
        self.commands.queue_agent_command(
            evt[CORRELATION_ID],
            plan.data,
            self.config.command_status_queued,
        )
        await self.publish_event(
            evt,
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            plan.queued_event_payload(),
        )

    async def publish_event(
        self,
        evt: dict[str, Any],
        subject: str,
        payload: dict[str, Any],
    ) -> None:
        await self.events.publish(
            subject,
            self.config.service_name,
            payload,
            evt[CORRELATION_ID],
        )
