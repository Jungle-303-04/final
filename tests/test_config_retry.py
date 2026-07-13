from __future__ import annotations

import asyncio
import logging

import pytest

from packages.config import retry as config_retry
from packages.config.logs import CONTEXT_KEY


def test_retry_dependency_returns_after_first_success_without_sleep(monkeypatch) -> None:
    calls = 0

    async def attempt() -> None:
        nonlocal calls
        calls += 1

    async def forbidden_sleep(_delay: float) -> None:
        raise AssertionError("successful dependency must not sleep")

    monkeypatch.setattr(config_retry.asyncio, "sleep", forbidden_sleep)

    asyncio.run(config_retry.retry_dependency(attempt, label="nats", limit=3, delay=7))

    assert calls == 1


def test_retry_dependency_retries_with_exact_context_then_succeeds(monkeypatch, caplog) -> None:
    calls = 0
    sleeps: list[float] = []

    async def attempt() -> None:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise ConnectionError("dependency is starting")

    async def record_sleep(delay: float) -> None:
        sleeps.append(delay)

    monkeypatch.setattr(config_retry.asyncio, "sleep", record_sleep)
    caplog.set_level(logging.WARNING, logger=config_retry.LOGGER.name)

    asyncio.run(config_retry.retry_dependency(attempt, label="postgres", limit=4, delay=0.25))

    records = [record for record in caplog.records if record.getMessage() == "dependency_waiting"]
    assert calls == 3
    assert sleeps == [0.25, 0.25]
    assert [getattr(record, CONTEXT_KEY) for record in records] == [
        {
            "dependency": "postgres",
            "attempt": 1,
            "limit": 4,
            "exception_type": "ConnectionError",
        },
        {
            "dependency": "postgres",
            "attempt": 2,
            "limit": 4,
            "exception_type": "ConnectionError",
        },
    ]


def test_retry_dependency_fails_after_exact_attempt_limit(monkeypatch, caplog) -> None:
    calls = 0

    async def attempt() -> None:
        nonlocal calls
        calls += 1
        raise OSError("database unavailable")

    async def no_wait(_delay: float) -> None:
        return None

    monkeypatch.setattr(config_retry.asyncio, "sleep", no_wait)
    caplog.set_level(logging.WARNING, logger=config_retry.LOGGER.name)

    with pytest.raises(RuntimeError, match=r"^\[event-system\] postgres 연결 실패$"):
        asyncio.run(config_retry.retry_dependency(attempt, label="postgres", limit=3, delay=0))

    records = [record for record in caplog.records if record.getMessage() == "dependency_waiting"]
    assert calls == 3
    assert [getattr(record, CONTEXT_KEY)["attempt"] for record in records] == [1, 2, 3]
    assert all(getattr(record, CONTEXT_KEY)["limit"] == 3 for record in records)


def test_retry_dependency_zero_limit_fails_without_attempt_or_sleep(monkeypatch) -> None:
    async def forbidden_attempt() -> None:
        raise AssertionError("zero retry limit must not call dependency")

    async def forbidden_sleep(_delay: float) -> None:
        raise AssertionError("zero retry limit must not sleep")

    monkeypatch.setattr(config_retry.asyncio, "sleep", forbidden_sleep)

    with pytest.raises(RuntimeError, match=r"^\[event-system\] nats 연결 실패$"):
        asyncio.run(
            config_retry.retry_dependency(forbidden_attempt, label="nats", limit=0, delay=1)
        )


def test_retry_dependency_propagates_task_cancellation_without_retry(monkeypatch, caplog) -> None:
    calls = 0

    async def forbidden_sleep(_delay: float) -> None:
        raise AssertionError("task cancellation must not enter retry delay")

    monkeypatch.setattr(config_retry.asyncio, "sleep", forbidden_sleep)
    caplog.set_level(logging.WARNING, logger=config_retry.LOGGER.name)

    async def run() -> None:
        nonlocal calls
        entered = asyncio.Event()
        blocked = asyncio.Event()

        async def attempt() -> None:
            nonlocal calls
            calls += 1
            entered.set()
            await blocked.wait()

        task = asyncio.create_task(
            config_retry.retry_dependency(attempt, label="nats", limit=5, delay=1)
        )
        await entered.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())

    assert calls == 1
    assert not [record for record in caplog.records if record.getMessage() == "dependency_waiting"]
