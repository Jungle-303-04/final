"""DB 보존 정책 실행기 — 대형 payload 테이블을 작은 배치로 정리한다."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from packages.config.settings import env

OUTBOX_SENT_RETENTION_HOURS_ENV = "OUTBOX_SENT_RETENTION_HOURS"
EVENT_RETENTION_DAYS_ENV = "EVENT_RETENTION_DAYS"
AUDIT_LOG_RETENTION_DAYS_ENV = "AUDIT_LOG_RETENTION_DAYS"
DB_RETENTION_DELETE_LIMIT_ENV = "DB_RETENTION_DELETE_LIMIT"

DEFAULT_OUTBOX_SENT_RETENTION_HOURS = "24"
DEFAULT_EVENT_RETENTION_DAYS = "7"
DEFAULT_AUDIT_LOG_RETENTION_DAYS = "7"
DEFAULT_DB_RETENTION_DELETE_LIMIT = "1000"


@dataclass(frozen=True)
class RetentionSweepResult:
    outbox_sent: int = 0
    events: int = 0
    audit_log: int = 0

    @property
    def total(self) -> int:
        return self.outbox_sent + self.events + self.audit_log


async def sweep_storage_retention(db: Any, *, now: datetime | None = None) -> RetentionSweepResult:
    """환경변수 기준 보존 기간을 지난 row 를 각 테이블에서 한 배치씩 정리한다."""
    observed_at = now or datetime.now(UTC)
    limit = max(1, int(env(DB_RETENTION_DELETE_LIMIT_ENV, DEFAULT_DB_RETENTION_DELETE_LIMIT)))
    outbox_cutoff = observed_at - timedelta(
        hours=max(1, int(env(OUTBOX_SENT_RETENTION_HOURS_ENV, DEFAULT_OUTBOX_SENT_RETENTION_HOURS)))
    )
    event_cutoff = observed_at - timedelta(
        days=max(1, int(env(EVENT_RETENTION_DAYS_ENV, DEFAULT_EVENT_RETENTION_DAYS)))
    )
    audit_cutoff = observed_at - timedelta(
        days=max(1, int(env(AUDIT_LOG_RETENTION_DAYS_ENV, DEFAULT_AUDIT_LOG_RETENTION_DAYS)))
    )
    return RetentionSweepResult(
        outbox_sent=await db.delete_sent_outbox_older_than(outbox_cutoff, limit=limit),
        events=await db.delete_events_older_than(event_cutoff, limit=limit),
        audit_log=await db.delete_audit_logs_older_than(audit_cutoff, limit=limit),
    )
