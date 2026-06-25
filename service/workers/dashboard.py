from __future__ import annotations

from typing import Any

from service.shared.core import Database, EventBus, publish_and_record


class DashboardProjectionWorkflow:
    def __init__(self, bus: EventBus, db: Database) -> None:
        self.bus = bus
        self.db = db

    async def handle(self, evt: dict[str, Any]) -> None:
        if evt["subject"] == "dashboard.updated":
            return
        status = "done" if evt["subject"] in {"safe_pr.created", "command.completed"} else "running"
        if evt["subject"].endswith("rejected") or evt["subject"].endswith("failed"):
            status = "attention"
        summary = f"{evt['subject']} from {evt['source']}"
        self.db.upsert_dashboard(evt, status, summary)
        await publish_and_record(
            self.bus,
            self.db,
            "dashboard.updated",
            "dashboard-projection-service",
            {"summary": summary, "status": status},
            evt["correlation_id"],
        )
