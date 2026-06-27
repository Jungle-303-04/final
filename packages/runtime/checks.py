"""런타임 사전조건 검사(guard).

어기면 부팅(등록) 시점에 명확한 예외로 fail fast 한다. 에러 메시지 문자열은
여기에만 모은다 — 핵심 로직(App)은 require_* 호출만 해서 읽기 쉽게 유지한다.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any


def require_registered(payload_type: type) -> Any:
    """payload 가 @events.reg 로 등록돼 __subject__ 를 갖는지. 반환=subject."""
    subject = getattr(payload_type, "__subject__", None)
    if subject is None:
        raise TypeError(
            f"{payload_type.__name__} 은 @events.reg 로 먼저 등록해야 한다"
        )
    return subject


def require_handler_signature(fn: Callable[..., Any]) -> bool:
    """핸들러가 (evt) 또는 (evt, ctx) 형태인지. 반환=ctx 를 받는지 여부."""
    params = [
        p
        for p in inspect.signature(fn).parameters.values()
        if p.name != "self"
    ]
    if not 1 <= len(params) <= 2:
        raise TypeError(
            f"{fn.__name__} 은 (evt) 또는 (evt, ctx) 형태여야 한다"
        )
    return len(params) == 2


def require_unique_handler(handlers: dict[Any, Any], subject: Any) -> None:
    """한 subject 에 핸들러가 중복 등록되지 않았는지."""
    if subject in handlers:
        existing = handlers[subject].fn.__name__
        raise TypeError(f"{subject} 구독자가 이미 있다: {existing}")


def require_single_handler(service: str, handlers: dict[Any, Any]) -> None:
    """App 이 정확히 핸들러 1개를 갖는지(한 pod = 한 subject)."""
    if len(handlers) != 1:
        raise RuntimeError(
            f"{service}: 핸들러가 정확히 1개여야 한다(현재 {len(handlers)})"
        )
