"""dashboard-projection-service 이벤트 payload."""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.payloads.base import EventPayload
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@events.reg(EventSubject.DASHBOARD_UPDATED)
@dataclass(frozen=True)
class DashboardUpdatedPayload(EventPayload):
    """dashboard.updated — 대시보드 카드가 갱신됐다."""

    summary: str
    status: str
