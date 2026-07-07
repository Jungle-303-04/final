from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from packages.storage.retention import sweep_storage_retention


class RetentionProbeDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, datetime, int]] = []

    async def delete_sent_outbox_older_than(self, cutoff: datetime, *, limit: int) -> int:
        self.calls.append(("outbox", cutoff, limit))
        return 1

    async def delete_events_older_than(self, cutoff: datetime, *, limit: int) -> int:
        self.calls.append(("events", cutoff, limit))
        return 2

    async def delete_audit_logs_older_than(self, cutoff: datetime, *, limit: int) -> int:
        self.calls.append(("audit_log", cutoff, limit))
        return 3


def test_storage_retention_uses_env_cutoffs_and_batch_limit(monkeypatch) -> None:
    monkeypatch.setenv("OUTBOX_SENT_RETENTION_HOURS", "12")
    monkeypatch.setenv("EVENT_RETENTION_DAYS", "5")
    monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", "9")
    monkeypatch.setenv("DB_RETENTION_DELETE_LIMIT", "77")
    db = RetentionProbeDb()
    now = datetime(2026, 7, 8, 5, 0, tzinfo=UTC)

    result = asyncio.run(sweep_storage_retention(db, now=now))

    assert result.total == 6
    assert db.calls == [
        ("outbox", now - timedelta(hours=12), 77),
        ("events", now - timedelta(days=5), 77),
        ("audit_log", now - timedelta(days=9), 77),
    ]


def test_storage_retention_defaults_match_operational_policy(monkeypatch) -> None:
    for name in (
        "OUTBOX_SENT_RETENTION_HOURS",
        "EVENT_RETENTION_DAYS",
        "AUDIT_LOG_RETENTION_DAYS",
        "DB_RETENTION_DELETE_LIMIT",
    ):
        monkeypatch.delenv(name, raising=False)
    db = RetentionProbeDb()
    now = datetime(2026, 7, 8, 5, 0, tzinfo=UTC)

    asyncio.run(sweep_storage_retention(db, now=now))

    assert db.calls == [
        ("outbox", now - timedelta(hours=24), 1000),
        ("events", now - timedelta(days=7), 1000),
        ("audit_log", now - timedelta(days=7), 1000),
    ]
