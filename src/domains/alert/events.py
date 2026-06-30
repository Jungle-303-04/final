"""alert-worker 이벤트 body."""

from __future__ import annotations

from dataclasses import dataclass

from domains.command.events import CommandRequestedBody
from packages.contracts.event_bus.bodies.base import EventBody, JsonObject
from packages.contracts.event_bus.registry import event
from packages.contracts.event_bus.subjects import EventSubject


@event(EventSubject.ALERT_REQUESTED)
@dataclass(frozen=True)
class AlertRequestedBody(EventBody):
    """alert.requested — 알람을 보내고, 통과 시 다음 이벤트를 이어 달라."""

    cluster_id: str
    namespace: str
    severity: str
    message: str
    reason: str
    next_command: CommandRequestedBody | None = None


@event(EventSubject.ALERT_DISPATCHED)
@dataclass(frozen=True)
class AlertDispatchedBody(EventBody):
    """alert.dispatched — 알람 전송 경계가 통과됐다."""

    cluster_id: str
    namespace: str
    severity: str
    channel: str
    mode: str


@event(EventSubject.ALERT_REJECTED)
@dataclass(frozen=True)
class AlertRejectedBody(EventBody):
    """alert.rejected — 알람/정책 게이트가 다음 실행을 막았다."""

    reason: str
    requested: JsonObject
