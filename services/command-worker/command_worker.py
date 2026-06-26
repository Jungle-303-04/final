from __future__ import annotations

import uuid
from typing import Any

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
from packages.contracts.gateway import fields as gateway_fields
from packages.contracts.interfaces import AgentCommandQueue

CHANNEL_FIELD = "channel"
PLAN_FIELD = "plan"
REASON_FIELD = "reason"
REQUESTED_FIELD = "requested"
ROUTE_FIELD = "route"
STEPS_FIELD = "steps"


class CommandWorkflow:
    def __init__(self, events: EventClient, commands: AgentCommandQueue) -> None:
        self.events = events
        self.commands = commands

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt[PAYLOAD]
        namespace = payload.get(gateway_fields.NAMESPACE, SANDBOX_NAMESPACE)
        if namespace != SANDBOX_NAMESPACE:
            await self.events.publish(
                EventSubject.COMMAND_REJECTED,
                SERVICE_NAME,
                {REASON_FIELD: SANDBOX_WRITE_REJECT_REASON, REQUESTED_FIELD: payload},
                evt[CORRELATION_ID],
            )
            return

        plan = {
            gateway_fields.COMMAND_ID: str(uuid.uuid4()),
            gateway_fields.CLUSTER_ID: payload.get(
                gateway_fields.CLUSTER_ID,
                DEFAULT_TARGET_CLUSTER_ID,
            ),
            gateway_fields.ACTION: payload.get(gateway_fields.ACTION, DEFAULT_COMMAND_ACTION),
            gateway_fields.NAMESPACE: namespace,
            STEPS_FIELD: POLICY_STEPS,
        }
        await self.events.publish(
            EventSubject.COMMAND_DISPATCH_READY,
            SERVICE_NAME,
            {PLAN_FIELD: plan},
            evt[CORRELATION_ID],
        )
        await self.events.publish(
            EventSubject.COMMAND_DISPATCHED,
            SERVICE_NAME,
            {
                PLAN_FIELD: plan,
                ROUTE_FIELD: {
                    CHANNEL_FIELD: AGENT_ROUTE_CHANNEL,
                    gateway_fields.CLUSTER_ID: plan[gateway_fields.CLUSTER_ID],
                },
            },
            evt[CORRELATION_ID],
        )
        self.commands.queue_agent_command(evt[CORRELATION_ID], plan, COMMAND_STATUS_QUEUED)
        await self.events.publish(
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            SERVICE_NAME,
            {
                gateway_fields.COMMAND_ID: plan[gateway_fields.COMMAND_ID],
                gateway_fields.CLUSTER_ID: plan[gateway_fields.CLUSTER_ID],
            },
            evt[CORRELATION_ID],
        )
