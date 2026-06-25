from __future__ import annotations

import json
import uuid
from typing import Any

from packages.shared.constants import DEFAULT_TARGET_CLUSTER_ID, SANDBOX_NAMESPACE, EventSubject
from packages.shared.core import Database, EventBus, publish_and_record

SERVICE_NAME = "command-worker"
AGENT_ROUTE_CHANNEL = "agent-poll"
POLICY_STEPS = ["validate policy", "route target cluster", "queue for agent"]
DEFAULT_COMMAND_ACTION = "rollout_restart"
SANDBOX_WRITE_REJECT_REASON = "only sandbox namespace writes are allowed"
COMMAND_STATUS_QUEUED = "queued"


class CommandWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        namespace = payload.get("namespace", SANDBOX_NAMESPACE)
        if namespace != SANDBOX_NAMESPACE:
            await publish_and_record(
                self.bus,
                self.db,
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
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.COMMAND_DISPATCH_READY,
            SERVICE_NAME,
            {"plan": plan},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.COMMAND_DISPATCHED,
            SERVICE_NAME,
            {
                "plan": plan,
                "route": {"channel": AGENT_ROUTE_CHANNEL, "cluster_id": plan["cluster_id"]},
            },
            evt["correlation_id"],
        )
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into agent_commands (
                        command_id,
                        correlation_id,
                        cluster_id,
                        action,
                        payload,
                        status,
                        updated_at
                    )
                    values (%s, %s, %s, %s, %s, %s, now())
                    on conflict (command_id) do nothing
                    """,
                    (
                        plan["command_id"],
                        evt["correlation_id"],
                        plan["cluster_id"],
                        plan["action"],
                        json.dumps(plan),
                        COMMAND_STATUS_QUEUED,
                    ),
                )
        await publish_and_record(
            self.bus,
            self.db,
            EventSubject.COMMAND_QUEUED_FOR_AGENT,
            SERVICE_NAME,
            {"command_id": plan["command_id"], "cluster_id": plan["cluster_id"]},
            evt["correlation_id"],
        )
