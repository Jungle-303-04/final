from __future__ import annotations

from packages.config.settings import env
from packages.contracts.event_bus.interfaces import JsonObject

# evidence job 튜닝값 — env 미설정 시 기존 기본값과 동일한 기본값이 적용됨(배포 호환)
DEFAULT_EVIDENCE_JOB_LEASE_SECONDS_ENV = "EVIDENCE_JOB_LEASE_SECONDS"  # 잡 리스 유지 초(기본 60)
DEFAULT_EVIDENCE_JOB_LEASE_SECONDS = int(env(DEFAULT_EVIDENCE_JOB_LEASE_SECONDS_ENV, "60"))
DEFAULT_EVIDENCE_SOURCE_ID = "cluster-snapshot"
DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS_ENV = (
    "PENDING_EVIDENCE_EVENT_TTL_SECONDS"  # pending 창 회수 TTL 초(기본 120)
)
DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS = int(
    env(DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS_ENV, "120")
)
EVIDENCE_FAILURE_POLICY_STRICT = "strict"
EVIDENCE_JOB_STATUS_COMPLETED = "completed"
EVIDENCE_JOB_STATUS_FAILED = "failed"
EVIDENCE_JOB_STATUS_LEASED = "leased"
EVIDENCE_JOB_STATUS_QUEUED = "queued"
PENDING_EVIDENCE_EVENT_ID_PREFIX = "pending:"
TERMINAL_EVIDENCE_JOB_STATUSES = {
    EVIDENCE_JOB_STATUS_COMPLETED,
    EVIDENCE_JOB_STATUS_FAILED,
}


def evidence_key(
    workspace_id: str,
    cluster_id: str,
    source_id: str,
    window_start: str,
) -> str:
    """Build the shared key for one evidence window."""
    return ":".join([workspace_id, cluster_id, source_id, window_start])


def evidence_job_id(
    workspace_id: str,
    cluster_id: str,
    source_id: str,
    window_start: str,
    provider_key: str,
) -> str:
    """Build the unique job id for one provider in one window."""
    return ":".join([evidence_key(workspace_id, cluster_id, source_id, window_start), provider_key])


def empty_provider_payload(provider_key: str) -> object:
    """Return the empty payload shape for a failed provider."""
    if provider_key == "logs":
        return []
    return {}


def aggregate_evidence_payload(rows: list[JsonObject]) -> JsonObject | None:
    """Merge provider job results into one evidence payload.
    Return None until the window is ready to emit.
    """
    if not rows:
        return None
    if any(row["status"] not in TERMINAL_EVIDENCE_JOB_STATUSES for row in rows):
        return None
    if any(
        row["failure_policy"] == EVIDENCE_FAILURE_POLICY_STRICT
        and row["status"] == EVIDENCE_JOB_STATUS_FAILED
        for row in rows
    ):
        return None

    first = rows[0]
    payload: JsonObject = {
        "workspace_id": first["workspace_id"],
        "cluster_id": first["cluster_id"],
        "source_id": first["source_id"],
        "window_start": first["window_start"],
        "evidence_key": first["evidence_key"],
        "agent_id": first["agent_id"],
        "kubernetes": {},
    }
    for row in rows:
        provider_key = str(row["provider_key"])
        if row["status"] == EVIDENCE_JOB_STATUS_COMPLETED and isinstance(row["result"], dict):
            payload.update(row["result"])
        elif row["status"] == EVIDENCE_JOB_STATUS_FAILED:
            payload.setdefault(provider_key, empty_provider_payload(provider_key))
    return payload
