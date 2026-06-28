"""demo(ping↔pong) 이벤트 body — 프레임워크 한 바퀴 학습용.

흐름:
    POST /demo/ping               (API 입구)
      → demo.ping.requested
      → ping-worker               (@app.sub 워커: 비즈니스 로직)
      → demo.pong.requested
      → ping-gateway              (outbound 게이트웨이: 외부 호출)
      → POST /demo/callback       (외부로 다시 나감)
      → demo.pong.delivered / demo.pong.failed
"""

from __future__ import annotations

from dataclasses import dataclass

from packages.contracts.event_bus.bodies.base import EventBody
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import EventSubject


@events.reg(EventSubject.DEMO_PING_REQUESTED)
@dataclass(frozen=True)
class DemoPingRequestedBody(EventBody):
    """API 가 받은 ping(입구 이벤트)."""

    message: str


@events.reg(EventSubject.DEMO_PONG_REQUESTED)
@dataclass(frozen=True)
class DemoPongRequestedBody(EventBody):
    """워커 → 게이트웨이: reply_to 로 외부 호출 요청."""

    message: str
    reply_to: str


@events.reg(EventSubject.DEMO_PONG_DELIVERED)
@dataclass(frozen=True)
class DemoPongDeliveredBody(EventBody):
    """게이트웨이: 외부 호출 성공."""

    reply_to: str
    status: str


@events.reg(EventSubject.DEMO_PONG_FAILED)
@dataclass(frozen=True)
class DemoPongFailedBody(EventBody):
    """게이트웨이: 외부 호출 실패."""

    reply_to: str
    error: str
