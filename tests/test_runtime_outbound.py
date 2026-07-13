from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Any

import pytest

from packages.runtime.outbound import deliver


async def collect_delivery(
    call: Callable[[], Awaitable[Any]],
    ok: Callable[[Any], Any],
    fail: Callable[[Exception], Any],
) -> list[Any]:
    return [item async for item in deliver(call, ok, fail)]


def test_deliver_yields_success_mapping_after_one_external_call() -> None:
    calls = 0
    failed: list[Exception] = []
    received: list[object] = []
    provider_result = object()
    mapped_result = object()

    async def call() -> object:
        nonlocal calls
        calls += 1
        return provider_result

    def ok(value: object) -> object:
        received.append(value)
        return mapped_result

    def fail(exc: Exception) -> str:
        failed.append(exc)
        return "failed"

    result = asyncio.run(collect_delivery(call, ok, fail))

    assert result == [mapped_result]
    assert calls == 1
    assert received == [provider_result]
    assert failed == []


def test_deliver_yields_failure_mapping_with_original_exception() -> None:
    upstream_error = RuntimeError("provider unavailable")
    received: list[Exception] = []

    async def call() -> None:
        raise upstream_error

    def fail(exc: Exception) -> tuple[str, Exception]:
        received.append(exc)
        return ("failed", exc)

    result = asyncio.run(collect_delivery(call, lambda value: ("delivered", value), fail))

    assert result == [("failed", upstream_error)]
    assert received == [upstream_error]


def test_deliver_does_not_convert_cancellation_to_failure() -> None:
    failed: list[Exception] = []
    cancelled = asyncio.CancelledError()

    async def call() -> None:
        raise cancelled

    def fail(exc: Exception) -> str:
        failed.append(exc)
        return "failed"

    with pytest.raises(asyncio.CancelledError) as caught:
        asyncio.run(collect_delivery(call, lambda value: value, fail))

    assert caught.value is cancelled
    assert failed == []


@pytest.mark.parametrize("failed_call", [False, True])
def test_deliver_does_not_hide_mapper_errors(failed_call: bool) -> None:
    upstream_error = ValueError("provider rejected request")
    mapper_error = LookupError("event mapping failed")
    ok_calls = 0
    fail_calls = 0

    async def call() -> str:
        if failed_call:
            raise upstream_error
        return "provider-result"

    def ok(_: Any) -> Any:
        nonlocal ok_calls
        ok_calls += 1
        if not failed_call:
            raise mapper_error
        return "unused"

    def fail(exc: Exception) -> Any:
        nonlocal fail_calls
        fail_calls += 1
        assert exc is upstream_error
        raise mapper_error

    with pytest.raises(LookupError) as caught:
        asyncio.run(collect_delivery(call, ok, fail))

    assert caught.value is mapper_error
    assert ok_calls == int(not failed_call)
    assert fail_calls == int(failed_call)
