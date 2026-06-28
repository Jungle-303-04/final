from __future__ import annotations

from settings import Settings

from packages.contracts.dashboard.status import DashboardStatus
from packages.contracts.event_bus.interfaces import (
    EventClient,
    EventEnvelope,
)
from packages.contracts.event_bus.payloads import DashboardUpdatedPayload
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.interfaces import DashboardReadModel


class DashboardProjectionWorkflow:
    def __init__(
        self, events: EventClient, dashboard: DashboardReadModel
    ) -> None:
        self.events = events
        self.dashboard = dashboard

    async def handle(self, evt: EventEnvelope) -> None:
        if evt.subject == EventSubject.DASHBOARD_UPDATED:
            return
        status = (
            DashboardStatus.DONE
            if evt.subject in Settings.TERMINAL_SUCCESS_SUBJECTS
            else DashboardStatus.RUNNING
        )
        if (
            evt.subject.endswith(Settings.REJECTED_SUBJECT_SUFFIX)
            or evt.subject.endswith(Settings.FAILED_SUBJECT_SUFFIX)
            or evt.subject == EventSubject.DEAD_LETTER_CREATED
        ):
            status = DashboardStatus.ATTENTION
        summary = f"{evt.subject} from {evt.source}"
        self.dashboard.upsert_dashboard(evt, status, summary)
        await self.events.emit(
            EventSubject.DASHBOARD_UPDATED,
            Settings.SERVICE_NAME,
            DashboardUpdatedPayload(
                summary=summary, status=status
            ).to_payload(),
            evt.correlation_id,
        )
