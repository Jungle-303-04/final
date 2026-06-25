from __future__ import annotations

import json
import uuid
from typing import Any

from service.shared.core import Database, EventBus, publish_and_record


class CommandWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        payload = evt["payload"]
        namespace = payload.get("namespace", "sandbox")
        if namespace != "sandbox":
            await publish_and_record(
                self.bus,
                self.db,
                "command.rejected",
                "command-worker",
                {"reason": "only sandbox namespace writes are allowed", "requested": payload},
                evt["correlation_id"],
            )
            return

        plan = {
            "command_id": str(uuid.uuid4()),
            "cluster_id": payload.get("cluster_id", "target-cluster-01"),
            "action": payload.get("action", "rollout_restart"),
            "namespace": namespace,
            "steps": ["validate policy", "route target cluster", "queue for agent"],
        }
        await publish_and_record(
            self.bus,
            self.db,
            "command.dispatch.ready",
            "command-worker",
            {"plan": plan},
            evt["correlation_id"],
        )
        await publish_and_record(
            self.bus,
            self.db,
            "command.dispatched",
            "command-worker",
            {"plan": plan, "route": {"channel": "agent-poll", "cluster_id": plan["cluster_id"]}},
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
                    values (%s, %s, %s, %s, %s, 'queued', now())
                    on conflict (command_id) do nothing
                    """,
                    (
                        plan["command_id"],
                        evt["correlation_id"],
                        plan["cluster_id"],
                        plan["action"],
                        json.dumps(plan),
                    ),
                )
        await publish_and_record(
            self.bus,
            self.db,
            "command.queued_for_agent",
            "command-worker",
            {"command_id": plan["command_id"], "cluster_id": plan["cluster_id"]},
            evt["correlation_id"],
        )
