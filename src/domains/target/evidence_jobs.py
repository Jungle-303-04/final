from __future__ import annotations

from packages.contracts.event_bus.interfaces import JsonObject

DEFAULT_EVIDENCE_JOB_LEASE_SECONDS = 60
DEFAULT_EVIDENCE_SOURCE_ID = "cluster-snapshot"
DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS = 120
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
    return ":".join([workspace_id, cluster_id, source_id, window_start])


def evidence_job_id(
    workspace_id: str,
    cluster_id: str,
    source_id: str,
    window_start: str,
    provider_key: str,
) -> str:
    return ":".join([evidence_key(workspace_id, cluster_id, source_id, window_start), provider_key])


def empty_provider_payload(provider_key: str) -> object:
    if provider_key == "logs":
        return []
    return {}


def aggregate_evidence_payload(rows: list[JsonObject]) -> JsonObject | None:
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
