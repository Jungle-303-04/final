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
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.interfaces import AgentCommandQueue


class CommandWorkflow:
    def __init__(self, events: EventClient, commands: AgentCommandQueue) -> None:
        self.events = events
        self.commands = commands

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        namespace = payload.get("namespace", SANDBOX_NAMESPACE)
        if namespace != SANDBOX_NAMESPACE:
            await self.events.publish(
                EventSubject.COMMAND_REJECTED,
                SERVICE_NAME,
                {"reason": SANDBOX_WRITE_REJECT_REASON, "requested": payload},
                evt["correlation_id"],
            )
            return

        plan = {
            "command_id": str(uuid.uuid4()),
            "cluster_id": payload.get("cluster_id", DEFAULT_TARGET_CLUSTER_ID),
            "action": payload.get("action", DEFAULT_COMMAND_ACTION),
            "namespace": namespace,
            "steps": POLICY_STEPS,
        }
        await self.events.publish(
            EventSubject.COMMAND_DISPATCH_READY,
            SERVICE_NAME,
            {"plan": plan},
            evt["correlation_id"],
        )
        await self.events.publish(
            EventSubject.COMMAND_DISPATCHED,
            SERVICE_NAME,
            {
                "plan": plan,
                "route": {"channel": AGENT_ROUTE_CHANNEL, "cluster_id": plan["cluster_id"]},
            },
            evt["correlation_id"],
        )
        self.commands.queue_agent_command(evt["correlation_id"], plan, COMMAND_STATUS_QUEUED)
        await self.events.publish(
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            SERVICE_NAME,
            {"command_id": plan["command_id"], "cluster_id": plan["cluster_id"]},
            evt["correlation_id"],
        )
