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

    async def call() -> dict[str, str]:
        nonlocal calls
        calls += 1
        return {"delivery_id": "delivery-1"}

    def fail(exc: Exception) -> str:
        failed.append(exc)
        return "failed"

    result = asyncio.run(collect_delivery(call, lambda value: ("delivered", value), fail))

    assert result == [("delivered", {"delivery_id": "delivery-1"})]
    assert calls == 1
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

    async def call() -> None:
        raise asyncio.CancelledError

    def fail(exc: Exception) -> str:
        failed.append(exc)
        return "failed"

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(collect_delivery(call, lambda value: value, fail))

    assert failed == []


@pytest.mark.parametrize("failed_call", [False, True])
def test_deliver_does_not_hide_mapper_errors(failed_call: bool) -> None:
    upstream_error = ValueError("provider rejected request")
    mapper_error = LookupError("event mapping failed")

    async def call() -> str:
        if failed_call:
            raise upstream_error
        return "provider-result"

    def ok(_: Any) -> Any:
        if not failed_call:
            raise mapper_error
        return "unused"

    def fail(exc: Exception) -> Any:
        assert exc is upstream_error
        raise mapper_error

    with pytest.raises(LookupError) as caught:
        asyncio.run(collect_delivery(call, ok, fail))

    assert caught.value is mapper_error
