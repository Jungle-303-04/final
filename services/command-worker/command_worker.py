from __future__ import annotations

import uuid
from typing import Any, Final

from settings import (
    AGENT_ROUTE_CHANNEL,
    COMMAND_STATUS_QUEUED,
    DEFAULT_COMMAND_ACTION,
    POLICY_STEPS,
    SANDBOX_WRITE_REJECT_REASON,
    SERVICE_NAME,
)

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, SANDBOX_NAMESPACE
from packages.contracts.event_bus.fields import CORRELATION_ID, PAYLOAD
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway.fields import Gateway
from packages.contracts.interfaces import AgentCommandQueue


class Field:
    CHANNEL: Final[str] = "channel"
    PLAN: Final[str] = "plan"
    REASON: Final[str] = "reason"
    REQUESTED: Final[str] = "requested"
    ROUTE: Final[str] = "route"
    STEPS: Final[str] = "steps"


class CommandWorkflow:
    def __init__(self, events: EventClient, commands: AgentCommandQueue) -> None:
        self.events = events
        self.commands = commands

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt[PAYLOAD]
        namespace = payload.get(Gateway.NAMESPACE, SANDBOX_NAMESPACE)
        if namespace != SANDBOX_NAMESPACE:
            await self.events.publish(
                EventSubject.COMMAND_REJECTED,
                SERVICE_NAME,
                {Field.REASON: SANDBOX_WRITE_REJECT_REASON, Field.REQUESTED: payload},
                evt[CORRELATION_ID],
            )
            return

        plan = {
            Gateway.COMMAND_ID: str(uuid.uuid4()),
            Gateway.CLUSTER_ID: payload.get(
                Gateway.CLUSTER_ID,
                DEFAULT_TARGET_CLUSTER_ID,
            ),
            Gateway.ACTION: payload.get(Gateway.ACTION, DEFAULT_COMMAND_ACTION),
            Gateway.NAMESPACE: namespace,
            Field.STEPS: POLICY_STEPS,
        }
        await self.events.publish(
            EventSubject.COMMAND_DISPATCH_READY,
            SERVICE_NAME,
            {Field.PLAN: plan},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.COMMAND_DISPATCHED,
            SERVICE_NAME,
            {
                Field.PLAN: plan,
                Field.ROUTE: {
                    Field.CHANNEL: AGENT_ROUTE_CHANNEL,
                    Gateway.CLUSTER_ID: plan[Gateway.CLUSTER_ID],
                },
            },
            evt[CORRELATION_ID],
        )
        self.commands.queue_agent_command(evt[CORRELATION_ID], plan, COMMAND_STATUS_QUEUED)
        await self.events.publish(
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            SERVICE_NAME,
            {
                Gateway.COMMAND_ID: plan[Gateway.COMMAND_ID],
                Gateway.CLUSTER_ID: plan[Gateway.CLUSTER_ID],
            },
            evt[CORRELATION_ID],
        )
