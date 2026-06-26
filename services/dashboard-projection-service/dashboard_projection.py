from __future__ import annotations

from typing import Any

from settings import Settings

from packages.contracts.dashboard.status import DashboardStatus
from packages.contracts.event_bus.interfaces import EventClient
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.interfaces import DashboardReadModel


class DashboardProjectionWorkflow:
    def __init__(self, events: EventClient, dashboard: DashboardReadModel) -> None:
        self.events = events
        self.dashboard = dashboard

    async def handle(self, evt: dict[str, Any]) -> None:
        if evt["subject"] == EventSubject.DASHBOARD_UPDATED:
            return
        status = (
            DashboardStatus.DONE
            if evt["subject"] in Settings.TERMINAL_SUCCESS_SUBJECTS
            else DashboardStatus.RUNNING
        )
        if (
            evt["subject"].endswith(Settings.REJECTED_SUBJECT_SUFFIX)
            or evt["subject"].endswith(Settings.FAILED_SUBJECT_SUFFIX)
            or evt["subject"] == EventSubject.DEAD_LETTER_CREATED
        ):
            status = DashboardStatus.ATTENTION
        summary = f"{evt['subject']} from {evt['source']}"
        self.dashboard.upsert_dashboard(evt, status, summary)
        await self.events.publish(
            EventSubject.DASHBOARD_UPDATED,
            Settings.SERVICE_NAME,
            {"summary": summary, "status": status},
            evt["correlation_id"],
        )
