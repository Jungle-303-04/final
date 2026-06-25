from __future__ import annotations

import json
from typing import Any

from packages.shared.core import Database, EventBus


class AuditTimelineWorkflow:
    def __init__(self, _bus: EventBus, db: Database) -> None:
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        with self.db.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into audit_log (event_id, subject, source, correlation_id, payload)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (
                        evt["event_id"],
                        evt["subject"],
                        evt["source"],
                        evt["correlation_id"],
                        json.dumps(evt["payload"]),
                    ),
                )
