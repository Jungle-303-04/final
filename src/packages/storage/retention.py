"""Bounded storage retention policies executed by command-janitor."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from packages.config.environments import normalize_environment
from packages.config.settings import env

OUTBOX_SENT_RETENTION_HOURS_ENV = "OUTBOX_SENT_RETENTION_HOURS"
EVENT_RETENTION_DAYS_ENV = "EVENT_RETENTION_DAYS"
AUDIT_LOG_RETENTION_DAYS_ENV = "AUDIT_LOG_RETENTION_DAYS"
AUDIT_LOG_RETENTION_ENABLED_ENV = "AUDIT_LOG_RETENTION_ENABLED"
DB_RETENTION_DELETE_LIMIT_ENV = "DB_RETENTION_DELETE_LIMIT"

DEMO_DATA_RETENTION_ENABLED_ENV = "DEMO_DATA_RETENTION_ENABLED"
DEMO_DATA_RETENTION_HOURS_ENV = "DEMO_DATA_RETENTION_HOURS"
DEMO_DATA_RETENTION_SCOPES_ENV = "DEMO_DATA_RETENTION_SCOPES"
DEMO_DATA_RETENTION_DELETE_LIMIT_ENV = "DEMO_DATA_RETENTION_DELETE_LIMIT"

DEFAULT_OUTBOX_SENT_RETENTION_HOURS = "24"
DEFAULT_EVENT_RETENTION_DAYS = "7"
DEFAULT_AUDIT_LOG_RETENTION_DAYS = "7"
DEFAULT_DB_RETENTION_DELETE_LIMIT = "1000"
DEFAULT_DEMO_DATA_RETENTION_HOURS = "24"
DEFAULT_DEMO_DATA_RETENTION_DELETE_LIMIT = "500"

DEMO_RUNTIME_ENVIRONMENTS = frozenset({"dev", "development", "demo", "sandbox", "local"})
DEMO_RETENTION_SCOPES = frozenset(
    {
        "observations",
        "events",
        "incidents",
        "rca",
        "evidence",
        "timeline",
        "commands",
        "projections",
    }
)

# These authorities are intentionally not expressible as demo retention scopes.
# Audit deletion remains a separate, explicit legal-policy switch.
PROTECTED_RETENTION_AUTHORITIES = (
    "identity",
    "workspace",
    "cluster-registration",
    "gitops-configuration",
    "audit-log",
    "alert-history",
)


@dataclass(frozen=True)
class DemoRetentionPolicy:
    enabled: bool
    retention_hours: int
    delete_limit: int
    scopes: tuple[str, ...]


@dataclass(frozen=True)
class RetentionSweepResult:
    outbox_sent: int = 0
    events: int = 0
    audit_log: int = 0
    demo_deleted: tuple[tuple[str, int], ...] = ()

    @property
    def total(self) -> int:
        return (
            self.outbox_sent
            + self.events
            + self.audit_log
            + sum(count for _table, count in self.demo_deleted)
        )

    def metrics(self) -> dict[str, int]:
        return {
            "outbox_sent": self.outbox_sent,
            "events": self.events,
            "audit_log": self.audit_log,
            **{f"demo_{table}": count for table, count in self.demo_deleted},
            "total": self.total,
        }


def demo_retention_policy() -> DemoRetentionPolicy:
    """Return a fail-closed policy requiring environment, enablement, and scopes."""

    retention_hours = _positive_int(
        DEMO_DATA_RETENTION_HOURS_ENV,
        DEFAULT_DEMO_DATA_RETENTION_HOURS,
    )
    delete_limit = _positive_int(
        DEMO_DATA_RETENTION_DELETE_LIMIT_ENV,
        DEFAULT_DEMO_DATA_RETENTION_DELETE_LIMIT,
    )
    app_env = normalize_environment(env("APP_ENV", ""))
    requested = _enabled(env(DEMO_DATA_RETENTION_ENABLED_ENV, "false"))
    scopes = _demo_scopes(env(DEMO_DATA_RETENTION_SCOPES_ENV, ""))
    return DemoRetentionPolicy(
        enabled=requested and app_env in DEMO_RUNTIME_ENVIRONMENTS and bool(scopes),
        retention_hours=retention_hours,
        delete_limit=delete_limit,
        scopes=scopes,
    )


async def sweep_storage_retention(db: Any, *, now: datetime | None = None) -> RetentionSweepResult:
    """Delete at most one bounded batch per configured retention target."""

    observed_at = now or datetime.now(UTC)
    limit = _positive_int(DB_RETENTION_DELETE_LIMIT_ENV, DEFAULT_DB_RETENTION_DELETE_LIMIT)
    outbox_cutoff = observed_at - timedelta(
        hours=_positive_int(
            OUTBOX_SENT_RETENTION_HOURS_ENV,
            DEFAULT_OUTBOX_SENT_RETENTION_HOURS,
        )
    )
    event_cutoff = observed_at - timedelta(
        days=_positive_int(EVENT_RETENTION_DAYS_ENV, DEFAULT_EVENT_RETENTION_DAYS)
    )
    policy = demo_retention_policy()
    demo_deleted: dict[str, int] = {}
    if policy.enabled:
        demo_deleted = await db.delete_demo_data_older_than(
            observed_at - timedelta(hours=policy.retention_hours),
            scopes=policy.scopes,
            limit=policy.delete_limit,
        )

    # The demo transaction removes event-processing children before this
    # legacy event-ledger sweep can remove their logical parent records.
    outbox_count = await db.delete_sent_outbox_older_than(outbox_cutoff, limit=limit)
    event_count = await db.delete_events_older_than(event_cutoff, limit=limit)
    audit_count = 0
    if _enabled(env(AUDIT_LOG_RETENTION_ENABLED_ENV, "false")):
        audit_cutoff = observed_at - timedelta(
            days=_positive_int(
                AUDIT_LOG_RETENTION_DAYS_ENV,
                DEFAULT_AUDIT_LOG_RETENTION_DAYS,
            )
        )
        audit_count = await db.delete_audit_logs_older_than(audit_cutoff, limit=limit)

    return RetentionSweepResult(
        outbox_sent=outbox_count,
        events=event_count,
        audit_log=audit_count,
        demo_deleted=tuple(sorted((name, int(count)) for name, count in demo_deleted.items())),
    )


def _demo_scopes(value: str) -> tuple[str, ...]:
    scopes = tuple(sorted({item.strip().casefold() for item in value.split(",") if item.strip()}))
    unknown = set(scopes) - DEMO_RETENTION_SCOPES
    if unknown:
        raise ValueError(f"unknown demo retention scopes: {', '.join(sorted(unknown))}")
    return scopes


def _positive_int(name: str, default: str) -> int:
    try:
        value = int(env(name, default))
    except ValueError as exc:
        raise ValueError(f"{name} must be a positive integer") from exc
    if value < 1:
        raise ValueError(f"{name} must be a positive integer")
    return value


def _enabled(value: str) -> bool:
    normalized = value.strip().casefold()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"", "0", "false", "no", "off"}:
        return False
    raise ValueError("retention enablement must be a boolean")
