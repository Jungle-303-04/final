"""dashboard 이벤트 body + 상태값."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject


class DashboardStatus(StrEnum):
    RUNNING = "running"
    DONE = "done"
    ATTENTION = "attention"


@event(EventSubject.DASHBOARD_UPDATED)
@dataclass(frozen=True)
class DashboardUpdatedBody(EventBody):
    """dashboard.updated — 대시보드 카드가 갱신됐다."""

    summary: str
    status: str
