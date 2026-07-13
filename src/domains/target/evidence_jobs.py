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


def normalize_evidence_provider_result(provider_key: str, result: JsonObject) -> JsonObject:
    """리스된 provider bucket 하나만 집계 계약에 남긴다.

    구형 agent는 bucket 내부 값만 보낼 수 있고, 잘못된 클라이언트는 여러 bucket과
    전송 메타데이터를 함께 보낼 수 있다. 두 형식을 모두 받되 리스된 provider 외 값은
    증거 본문으로 승격하지 않는다.
    """
    if provider_key in result:
        return {provider_key: result[provider_key]}
    return {provider_key: result}


def merge_evidence_provider_payload(payload: JsonObject, provider_payload: JsonObject) -> None:
    """Merge one provider payload without dropping existing metadata keys."""
    provider_metadata = provider_payload.get("metadata")
    if isinstance(provider_metadata, dict):
        current_metadata = payload.get("metadata")
        merged_metadata = dict(current_metadata) if isinstance(current_metadata, dict) else {}
        merged_metadata.update(provider_metadata)
        if isinstance(current_metadata, dict) and "rca_test" in current_metadata:
            merged_metadata["rca_test"] = current_metadata["rca_test"]
        payload["metadata"] = merged_metadata
        provider_payload = {
            key: value for key, value in provider_payload.items() if key != "metadata"
        }
    payload.update(provider_payload)


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
    release_context = common_release_context(rows)
    if release_context:
        payload["release_context"] = release_context
        correlation_id = release_context.get("correlation_id")
        if isinstance(correlation_id, str) and correlation_id:
            payload["correlation_id"] = correlation_id
        run_id = release_context.get("rca_test_run_id")
        scenario_id = release_context.get("scenario_id")
        if isinstance(run_id, str) and run_id and isinstance(scenario_id, str) and scenario_id:
            rca_test_metadata: JsonObject = {"run_id": run_id, "scenario_id": scenario_id}
            pod_names = release_context.get("pod_names")
            if isinstance(pod_names, list):
                normalized_names = [str(name).strip() for name in pod_names if str(name).strip()]
                if normalized_names:
                    rca_test_metadata["pod_names"] = list(dict.fromkeys(normalized_names))[:32]
            payload["metadata"] = {"rca_test": rca_test_metadata}
    for row in rows:
        provider_key = str(row["provider_key"])
        if row["status"] == EVIDENCE_JOB_STATUS_COMPLETED and isinstance(row["result"], dict):
            merge_evidence_provider_payload(
                payload,
                normalize_evidence_provider_result(provider_key, row["result"]),
            )
        elif row["status"] == EVIDENCE_JOB_STATUS_FAILED:
            payload.setdefault(provider_key, empty_provider_payload(provider_key))
    promote_release_target(payload, release_context)
    return payload


def common_release_context(rows: list[JsonObject]) -> JsonObject:
    """provider job snapshot에 보존된 공통 수집 문맥을 evidence body로 승격한다."""
    contexts: list[JsonObject] = []
    for row in rows:
        provider_policy = row.get("provider_policy")
        if not isinstance(provider_policy, dict):
            continue
        context = provider_policy.get("release_context")
        if isinstance(context, dict) and context:
            contexts.append(context)
    if not contexts:
        return {}
    first = contexts[0]
    return first if all(context == first for context in contexts[1:]) else {}


def promote_release_target(payload: JsonObject, release_context: JsonObject) -> None:
    """Keep the server-owned Deployment target instead of the Pod's ReplicaSet owner."""
    if release_context.get("evidence_scope") != "rca_test_run":
        return
    kind = release_context.get("resource_kind")
    name = release_context.get("resource_name")
    namespace = release_context.get("namespace")
    kubernetes = payload.get("kubernetes")
    if not isinstance(kubernetes, dict) or not isinstance(kind, str) or not isinstance(name, str):
        return
    if not kind or not name:
        return
    kubernetes["resource"] = {
        "kind": kind,
        "name": name,
        "namespace": namespace if isinstance(namespace, str) and namespace else None,
    }
