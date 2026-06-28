"""이벤트 타입 레지스트리(전역 계약, 카탈로그).

"어떤 이벤트가 있나"만 담당(정적, 전역 공유 계약).
- @events.reg(SUBJECT): body ↔ 이벤트 매핑.
- describe(): make events 로 한눈에 보는 표.

실제 구독/실행(런타임)은 packages/runtime/ 의 App + dispatch 담당.
이벤트 "정의"는 공유 계약이라 전역, "핸들러"는 서비스별이라 App 소유.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, fields
from typing import Any

from packages.contracts.event_bus.subjects import EventSubject


@dataclass(frozen=True)
class Subscription:
    """App.sub 가 만드는 핸들러 바인딩(subject ↔ body ↔ 함수)."""

    subject: EventSubject
    body_type: type
    fn: Callable[..., Any]
    wants_ctx: bool


class EventRegistry:
    """전역 이벤트 카탈로그(주소록). @events.reg 로 이벤트 타입이 적힌다."""

    def __init__(self) -> None:
        self._defs: dict[EventSubject, type] = {}
        self._handlers: dict[EventSubject, tuple[str, str]] = {}
        self._raw_handlers: list[tuple[str, str]] = []

    def reg(self, subject: EventSubject) -> Callable[[type], type]:
        def decorator(body_type: type) -> type:
            body_type.__subject__ = subject
            self._defs[subject] = body_type
            return body_type

        return decorator

    def note_handler(self, service: str, sub: Subscription) -> None:
        """App 이 자기 핸들러를 카탈로그에 알린다(make events 표시용)."""
        self._handlers[sub.subject] = (service, sub.fn.__name__)

    def note_raw_handler(self, service: str, handler: str) -> None:
        """전체(>) 구독 프로젝터를 카탈로그에 알린다."""
        self._raw_handlers.append((service, handler))

    def describe(self) -> str:
        rows = ["EVENTS (한눈에 보기)", ""]
        for subject, body_type in sorted(self._defs.items()):
            names = ", ".join(f.name for f in fields(body_type))
            service, handler = self._handlers.get(subject, ("-", "-"))
            rows.append(
                f"{subject:<28} {body_type.__name__:<26} "
                f"by={service}/{handler}  fields=({names})"
            )
        if self._raw_handlers:
            rows.append("")
            rows.append("ALL-EVENT 구독(프로젝터):")
            for service, handler in sorted(self._raw_handlers):
                rows.append(f"  {service}/{handler}  ← 모든 이벤트(>)")
        return "\n".join(rows)


events = EventRegistry()
