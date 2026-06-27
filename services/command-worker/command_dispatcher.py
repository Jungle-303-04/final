from __future__ import annotations

import uuid
from typing import Any, Protocol

from command_config import CommandConfigPort
from command_policy import Lookup

from packages.contracts.event_bus.interfaces import EventClient, EventEnvelope
from packages.contracts.event_bus.payloads import (
    CommandDispatchedPayload,
    CommandDispatchReadyPayload,
    CommandQueuedForAgentPayload,
    Plan,
    Route,
)
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import AgentCommandQueue


class Planner(Protocol):
    def build(self, command: Lookup) -> Plan: ...


class DispatchPort(Protocol):
    async def dispatch(self, evt: EventEnvelope, plan: Plan) -> None: ...


class DefaultPlanner:
    def __init__(self, config: CommandConfigPort) -> None:
        self.config = config

    def build(self, command: Lookup) -> Plan:
        config = self.config
        return Plan(
            command_id=str(uuid.uuid4()),
            cluster_id=command.value(
                Gateway.CLUSTER_ID, config.default_cluster_id
            ),
            action=command.value(Gateway.ACTION, config.default_command_action),
            namespace=command.value(
                Gateway.NAMESPACE, config.default_namespace
            ),
            steps=list(config.policy_steps),
        )


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

    async def dispatch(self, evt: EventEnvelope, plan: Plan) -> None:
        await self.emit(
            evt,
            EventSubject.COMMAND_DISPATCH_READY,
            CommandDispatchReadyPayload(plan=plan).to_payload(),
        )
        await self.emit(
            evt,
            EventSubject.COMMAND_DISPATCHED,
            CommandDispatchedPayload(
                plan=plan,
                route=Route(
                    channel=self.config.agent_route_channel,
                    cluster_id=plan.cluster_id,
                ),
            ).to_payload(),
        )
        await self.commands.queue_agent_command(
            evt.correlation_id,
            plan.to_payload(),
            self.config.command_status_queued,
        )
        await self.emit(
            evt,
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            CommandQueuedForAgentPayload(
                command_id=plan.command_id, cluster_id=plan.cluster_id
            ).to_payload(),
        )

    async def emit(
        self,
        evt: EventEnvelope,
        subject: str,
        payload: dict[str, Any],
    ) -> None:
        await self.events.publish(
            subject,
            self.config.service_name,
            payload,
            evt.correlation_id,
        )
