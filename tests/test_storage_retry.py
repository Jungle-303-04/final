from __future__ import annotations

import asyncio

import pytest
from sqlalchemy.exc import OperationalError

from packages.storage.retry import (
    async_retry_db_conflict,
    retryable_db_conflict,
    sync_retry_db_conflict,
    to_thread_db_retry,
)


class DeadlockOrig(Exception):
    sqlstate = "40P01"


class SerializationOrig(Exception):
    sqlstate = "40001"


class LockTimeoutOrig(Exception):
    sqlstate = "55P03"


class NonRetryableOrig(Exception):
    sqlstate = "23505"


def operational_error(orig: Exception) -> OperationalError:
    return OperationalError("select", {}, orig)


def test_retryable_db_conflict_recognizes_postgres_lock_states() -> None:
    assert retryable_db_conflict(operational_error(DeadlockOrig()))
    assert retryable_db_conflict(operational_error(SerializationOrig()))
    assert retryable_db_conflict(operational_error(LockTimeoutOrig()))


def test_retryable_db_conflict_recognizes_lock_timeout_text() -> None:
    exc = OperationalError(
        "select",
        {},
        Exception("canceling statement due to lock timeout"),
    )
    assert retryable_db_conflict(exc)


def test_retryable_db_conflict_rejects_non_transient_errors() -> None:
    assert not retryable_db_conflict(operational_error(NonRetryableOrig()))


def test_sync_retry_db_conflict_retries_then_succeeds() -> None:
    calls = 0

    def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise operational_error(LockTimeoutOrig())
        return "ok"

    assert sync_retry_db_conflict(flaky, base_delay=0) == "ok"
    assert calls == 2


def test_async_retry_db_conflict_retries_then_succeeds() -> None:
    calls = 0

    async def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise operational_error(DeadlockOrig())
        return "ok"

    assert asyncio.run(async_retry_db_conflict(flaky, base_delay=0)) == "ok"
    assert calls == 2


def test_to_thread_db_retry_retries_then_succeeds() -> None:
    calls = 0

    def flaky() -> str:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise operational_error(LockTimeoutOrig())
        return "ok"

    assert asyncio.run(to_thread_db_retry(flaky, base_delay=0)) == "ok"
    assert calls == 2


def test_sync_retry_db_conflict_does_not_retry_non_transient_errors() -> None:
    calls = 0

    def broken() -> str:
        nonlocal calls
        calls += 1
        raise operational_error(NonRetryableOrig())

    with pytest.raises(OperationalError):
        sync_retry_db_conflict(broken, base_delay=0)
    assert calls == 1
