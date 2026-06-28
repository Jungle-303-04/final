"""런타임 사전조건 가드 — 어기면 부팅(등록) 시점 fail-fast."""

from __future__ import annotations

import inspect
from collections.abc import Callable
from typing import Any

from packages.config.errors import fail, require


def require_registered(body_type: type) -> Any:
    subject = getattr(body_type, "__subject__", None)
    require(subject is not None, f"{body_type.__name__} 은 @events.reg 로 먼저 등록해야 한다", TypeError)
    return subject


def require_handler_signature(fn: Callable[..., Any]) -> bool:
    params = [p for p in inspect.signature(fn).parameters.values() if p.name != "self"]
    require(1 <= len(params) <= 2, f"{fn.__name__} 은 (evt) 또는 (evt, ctx) 형태여야 한다", TypeError)
    return len(params) == 2


def require_unique_handler(handlers: dict[Any, Any], subject: Any) -> None:
    if subject in handlers:
        fail(f"{subject} 구독자가 이미 있다: {handlers[subject].fn.__name__}", TypeError)


def require_single_handler(service: str, handlers: dict[Any, Any]) -> None:
    require(len(handlers) == 1, f"{service}: 핸들러가 정확히 1개여야 한다(현재 {len(handlers)})", RuntimeError)
