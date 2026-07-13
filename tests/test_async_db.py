from __future__ import annotations

import asyncio
import threading
from typing import Any

import pytest

from packages.runtime import async_db
from packages.runtime.async_db import AsyncDb


class _DatabaseDouble:
    label = "database-double"

    async def async_value(self, value: int) -> int:
        return value * 2

    def sync_value(self, value: int, *, increment: int = 0) -> tuple[int, int]:
        return value + increment, threading.get_ident()

    def fail(self, message: str) -> None:
        raise LookupError(message)


def test_async_and_non_callable_attributes_are_forwarded_without_thread_hop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unexpected_to_thread(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError(f"unexpected to_thread call: {args!r} {kwargs!r}")

    monkeypatch.setattr(async_db.asyncio, "to_thread", unexpected_to_thread)
    wrapped = AsyncDb(_DatabaseDouble())

    assert wrapped.label == "database-double"
    assert asyncio.run(wrapped.async_value(3)) == 6


def test_sync_method_uses_to_thread_and_forwards_arguments_without_active_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[tuple[Any, ...], dict[str, Any]]] = []

    async def recording_to_thread(function: Any, *args: Any, **kwargs: Any) -> Any:
        calls.append((args, kwargs))
        return function(*args, **kwargs)

    monkeypatch.setattr(async_db, "has_active_connection", lambda: False)
    monkeypatch.setattr(async_db.asyncio, "to_thread", recording_to_thread)
    wrapped = AsyncDb(_DatabaseDouble())

    result, _thread_id = asyncio.run(wrapped.sync_value(4, increment=5))

    assert result == 9
    assert calls == [((4,), {"increment": 5})]


def test_sync_method_reuses_current_thread_with_active_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def unexpected_to_thread(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError(f"unexpected to_thread call: {args!r} {kwargs!r}")

    monkeypatch.setattr(async_db, "has_active_connection", lambda: True)
    monkeypatch.setattr(async_db.asyncio, "to_thread", unexpected_to_thread)
    wrapped = AsyncDb(_DatabaseDouble())
    caller_thread = threading.get_ident()

    result, method_thread = asyncio.run(wrapped.sync_value(7, increment=2))

    assert result == 9
    assert method_thread == caller_thread


def test_sync_method_exception_propagates_from_to_thread(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def direct_to_thread(function: Any, *args: Any, **kwargs: Any) -> Any:
        return function(*args, **kwargs)

    monkeypatch.setattr(async_db, "has_active_connection", lambda: False)
    monkeypatch.setattr(async_db.asyncio, "to_thread", direct_to_thread)
    wrapped = AsyncDb(_DatabaseDouble())

    with pytest.raises(LookupError, match="database failed"):
        asyncio.run(wrapped.fail("database failed"))


def test_missing_attribute_preserves_attribute_error() -> None:
    wrapped = AsyncDb(_DatabaseDouble())

    with pytest.raises(AttributeError):
        _ = wrapped.missing
