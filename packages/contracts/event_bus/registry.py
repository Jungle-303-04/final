"""이벤트 타입 레지스트리(전역 계약, 카탈로그).

"어떤 이벤트가 있나"만 담당한다(정적, 전역 공유 계약).
- @events.reg(SUBJECT): 이 payload가 이 이벤트다.
- describe(): make events 로 한눈에 보는 표.

실제 구독/실행(런타임)은 packages/runtime/ 의 App + dispatch 가 한다.
이벤트 "정의"는 공유 계약이라 전역, "핸들러"는 서비스별이라 App 소유.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, fields
from typing import Any

from packages.contracts.event_bus.subjects import EventSubject


@dataclass(frozen=True)
class Subscription:
    """App.sub 가 만드는 핸들러 바인딩(subject ↔ payload ↔ 함수)."""

    subject: EventSubject
    payload_type: type
    fn: Callable[..., Any]
    wants_ctx: bool


class EventRegistry:
    """전역 이벤트 카탈로그(주소록). @events.reg 로 이벤트 타입이 적힌다."""

    def __init__(self) -> None:
        self._defs: dict[EventSubject, type] = {}
        self._handlers: dict[EventSubject, tuple[str, str]] = {}

    def reg(self, subject: EventSubject) -> Callable[[type], type]:
        def decorator(payload_type: type) -> type:
            payload_type.__subject__ = subject
            self._defs[subject] = payload_type
            return payload_type

        return decorator

    def note_handler(self, service: str, sub: Subscription) -> None:
        """App 이 자기 핸들러를 카탈로그에 알린다(make events 표시용)."""
        self._handlers[sub.subject] = (service, sub.fn.__name__)

    def describe(self) -> str:
        rows = ["EVENTS (한눈에 보기)", ""]
        for subject, payload_type in sorted(self._defs.items()):
            names = ", ".join(f.name for f in fields(payload_type))
            service, handler = self._handlers.get(subject, ("-", "-"))
            rows.append(
                f"{subject:<28} {payload_type.__name__:<26} "
                f"by={service}/{handler}  payload=({names})"
            )
        return "\n".join(rows)


events = EventRegistry()
