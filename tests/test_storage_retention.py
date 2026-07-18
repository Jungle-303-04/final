from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from packages.storage.retention import (
    PROTECTED_RETENTION_AUTHORITIES,
    demo_retention_policy,
    sweep_storage_retention,
)


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

    async def delete_demo_data_older_than(
        self,
        cutoff: datetime,
        *,
        scopes: tuple[str, ...],
        limit: int,
    ) -> dict[str, int]:
        self.calls.append((f"demo:{','.join(scopes)}", cutoff, limit))
        return {"timeline_events": 4, "evidence": 2}


def test_storage_retention_uses_env_cutoffs_and_batch_limit(monkeypatch) -> None:
    monkeypatch.setenv("OUTBOX_SENT_RETENTION_HOURS", "12")
    monkeypatch.setenv("EVENT_RETENTION_DAYS", "5")
    monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", "9")
    monkeypatch.setenv("AUDIT_LOG_RETENTION_ENABLED", "true")
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
        "AUDIT_LOG_RETENTION_ENABLED",
        "DB_RETENTION_DELETE_LIMIT",
        "DEMO_DATA_RETENTION_ENABLED",
        "DEMO_DATA_RETENTION_HOURS",
        "DEMO_DATA_RETENTION_SCOPES",
        "DEMO_DATA_RETENTION_DELETE_LIMIT",
        "APP_ENV",
    ):
        monkeypatch.delenv(name, raising=False)
    db = RetentionProbeDb()
    now = datetime(2026, 7, 8, 5, 0, tzinfo=UTC)

    asyncio.run(sweep_storage_retention(db, now=now))

    assert db.calls == [
        ("outbox", now - timedelta(hours=24), 1000),
        ("events", now - timedelta(days=7), 1000),
    ]


def test_demo_retention_requires_demo_environment_enablement_and_explicit_scopes(
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEMO_DATA_RETENTION_ENABLED", "true")
    monkeypatch.setenv("DEMO_DATA_RETENTION_SCOPES", "timeline,evidence,commands")
    monkeypatch.setenv("DEMO_DATA_RETENTION_HOURS", "24")
    monkeypatch.setenv("DEMO_DATA_RETENTION_DELETE_LIMIT", "250")

    monkeypatch.setenv("APP_ENV", "production")
    assert demo_retention_policy().enabled is False

    monkeypatch.setenv("APP_ENV", "demo")
    policy = demo_retention_policy()
    assert policy.enabled is True
    assert policy.retention_hours == 24
    assert policy.delete_limit == 250
    assert policy.scopes == ("commands", "evidence", "timeline")


def test_demo_retention_sweeps_one_cutoff_and_returns_per_table_metrics(monkeypatch) -> None:
    monkeypatch.setenv("APP_ENV", "demo")
    monkeypatch.setenv("DEMO_DATA_RETENTION_ENABLED", "true")
    monkeypatch.setenv("DEMO_DATA_RETENTION_SCOPES", "timeline,evidence")
    monkeypatch.setenv("DEMO_DATA_RETENTION_HOURS", "24")
    monkeypatch.setenv("DEMO_DATA_RETENTION_DELETE_LIMIT", "50")
    monkeypatch.setenv("AUDIT_LOG_RETENTION_ENABLED", "false")
    db = RetentionProbeDb()
    now = datetime(2026, 7, 8, 5, 0, tzinfo=UTC)

    result = asyncio.run(sweep_storage_retention(db, now=now))

    assert db.calls[0] == ("demo:evidence,timeline", now - timedelta(hours=24), 50)
    assert result.demo_deleted == (("evidence", 2), ("timeline_events", 4))
    assert result.metrics()["total"] == 9


def test_demo_retention_policy_rejects_unknown_scope_and_excludes_authorities(
    monkeypatch,
) -> None:
    monkeypatch.setenv("APP_ENV", "demo")
    monkeypatch.setenv("DEMO_DATA_RETENTION_ENABLED", "true")
    monkeypatch.setenv("DEMO_DATA_RETENTION_SCOPES", "timeline,audit")

    with pytest.raises(ValueError, match="unknown demo retention scopes"):
        demo_retention_policy()

    assert PROTECTED_RETENTION_AUTHORITIES == (
        "identity",
        "workspace",
        "cluster-registration",
        "gitops-configuration",
        "audit-log",
        "alert-history",
    )
