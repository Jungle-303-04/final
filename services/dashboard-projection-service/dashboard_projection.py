from __future__ import annotations

from typing import Any

from packages.shared.constants import DashboardStatus, EventSubject
from packages.shared.contracts import DashboardReadModel, EventPublisher, EventRecorder
from packages.shared.core import publish_and_record

SERVICE_NAME = "dashboard-projection-service"
TERMINAL_SUCCESS_SUBJECTS = {EventSubject.SAFE_PR_CREATED, EventSubject.COMMAND_COMPLETED}
REJECTED_SUBJECT_SUFFIX = "rejected"
FAILED_SUBJECT_SUFFIX = "failed"


class DashboardProjectionWorkflow:
    def __init__(
        self, bus: EventPublisher, dashboard: DashboardReadModel, events: EventRecorder
    ) -> None:
        self.bus = bus
        self.dashboard = dashboard
        self.events = events

    async def handle(self, evt: dict[str, Any]) -> None:
        if evt["subject"] == EventSubject.DASHBOARD_UPDATED:
            return
        status = (
            DashboardStatus.DONE
            if evt["subject"] in TERMINAL_SUCCESS_SUBJECTS
            else DashboardStatus.RUNNING
        )
        if evt["subject"].endswith(REJECTED_SUBJECT_SUFFIX) or evt["subject"].endswith(
            FAILED_SUBJECT_SUFFIX
        ):
            status = DashboardStatus.ATTENTION
        summary = f"{evt['subject']} from {evt['source']}"
        self.dashboard.upsert_dashboard(evt, status, summary)
        await publish_and_record(
            self.bus,
            self.events,
            EventSubject.DASHBOARD_UPDATED,
            SERVICE_NAME,
            {"summary": summary, "status": status},
            evt["correlation_id"],
        )
