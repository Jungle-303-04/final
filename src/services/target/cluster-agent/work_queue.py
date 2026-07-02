from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum

from packages.contracts.event_bus.interfaces import JsonObject


class QueueName(StrEnum):
    COMMAND_JOBS = "command_jobs"
    TELEMETRY_JOBS = "telemetry_jobs"
    OUTBOUND_SPOOL = "outbound_spool"


class WorkStatus(StrEnum):
    PENDING = "pending"
    LEASED = "leased"
    COMPLETED = "completed"
    FAILED = "failed"


class OutboundKind(StrEnum):
    COMMAND_RESULT = "command_result"
    TELEMETRY_EVIDENCE = "telemetry_evidence"


class LocalStoreConfig:
    DB_PATH_ENV = "TARGET_AGENT_LOCAL_DB_PATH"
    DEFAULT_DB_PATH = "/var/lib/target-agent/local-agent.db"
    DEFAULT_LEASE_SECONDS = 30
    DEFAULT_PRIORITY = 100
    HIGH_PRIORITY = 10
    LOW_PRIORITY = 200


@dataclass(frozen=True)
class QueueJob:
    id: int
    queue_name: str
    job_key: str
    payload: JsonObject
    priority: int
    status: str
    attempts: int
    locked_by: str | None
    locked_until: str | None
    last_error: str | None
    created_at: str
    updated_at: str


@dataclass(frozen=True)
class OutboundItem:
    id: int
    item_key: str
    kind: str
    payload: JsonObject
    priority: int
    status: str
    attempts: int
    locked_by: str | None
    locked_until: str | None
    next_attempt_at: str
    last_error: str | None
    created_at: str
    updated_at: str
