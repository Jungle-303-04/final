"""Persisted debug-query adapter for authenticated browser log streams."""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
import uuid
from collections import deque
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlencode

from fastapi import HTTPException, Request

from domains.command.debug_queries import (
    LOG_STREAM_QUERY_METADATA_KEY,
    LOG_STREAM_QUERY_NAME_PREFIX,
    QueuedDebugQuery,
    queue_debug_query,
)
from domains.identity.dependencies import require_cluster_access
from packages.config.constants import Command, CommandStatus
from packages.contracts.gateway.requests import AgentDebugQueryRequest
from packages.contracts.identity import Permission
from packages.contracts.log_stream import (
    LogStreamConnected,
    LogStreamEnd,
    LogStreamError,
    LogStreamLog,
    LogStreamPodAdded,
    LogStreamPodRemoved,
)
from packages.security.log_lines import redact_log_line, truncate_log_line

WorkloadLogKind = Literal["deployments", "statefulsets", "daemonsets"]

WORKLOAD_KIND_NAMES: dict[WorkloadLogKind, str] = {
    "deployments": "Deployment",
    "statefulsets": "StatefulSet",
    "daemonsets": "DaemonSet",
}
LOG_STREAM_PROTOCOL = "log-stream.v1"
LOG_QUERY_RANGE_SECONDS = 30
LOG_STREAM_BATCH_LIMIT = 20
LOG_STREAM_RESULT_TIMEOUT_SECONDS = 20.0
LOG_STREAM_STATUS_POLL_SECONDS = 0.25
LOG_STREAM_BATCH_INTERVAL_SECONDS = 2.0
LOG_STREAM_DISCONNECT_POLL_SECONDS = 0.1
MAX_DEDUPE_IDS = 2000
MAX_AI_LOG_EVIDENCE = 20
TARGET_NOT_FOUND = "log stream target not found"
KUBERNETES_NAME_RE = re.compile(r"^[a-z0-9](?:[-a-z0-9.]*[a-z0-9])?$")
KUBERNETES_NAMESPACE_RE = re.compile(r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$")
KUBERNETES_CONTAINER_RE = re.compile(r"^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$")


@dataclass(frozen=True)
class LogStreamTarget:
    target_type: Literal["pod", "workload"]
    cluster_id: str
    namespace: str
    name: str
    kind: str
    resource_type: str
    pods: tuple[str, ...]
    container: str | None = None

    def metadata(self) -> dict[str, Any]:
        return {
            "protocol": LOG_STREAM_PROTOCOL,
            "target_type": self.target_type,
            "cluster_id": self.cluster_id,
            "namespace": self.namespace,
            "name": self.name,
            "kind": self.kind,
            "resource_type": self.resource_type,
            "pods": list(self.pods),
            "container": self.container,
        }

    def link(self) -> str:
        detail = "/".join((self.kind, self.namespace, self.name))
        return "/resources?" + urlencode(
            {
                "clusters": self.cluster_id,
                "resources.types": self.resource_type,
                "detail": detail,
            }
        )


@dataclass(frozen=True)
class PersistedLogEvidence:
    event: LogStreamLog
    link: str


class BoundedDedupe:
    def __init__(self, max_items: int = MAX_DEDUPE_IDS) -> None:
        self.max_items = max_items
        self.ids: set[str] = set()
        self.order: deque[str] = deque()

    def add(self, value: str) -> bool:
        if value in self.ids:
            return False
        self.ids.add(value)
        self.order.append(value)
        while len(self.order) > self.max_items:
            self.ids.discard(self.order.popleft())
        return True


def resolve_pod_target(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    cluster_id: str,
    namespace: str,
    name: str,
    container: str | None,
) -> LogStreamTarget:
    _require_log_access(db, current, workspace_id, cluster_id)
    resource = _inventory_resource(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="pod",
        kind="Pod",
        namespace=namespace,
        name=name,
    )
    if resource is None or not _container_exists(resource, container):
        raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND)
    return LogStreamTarget(
        target_type="pod",
        cluster_id=cluster_id,
        namespace=namespace,
        name=name,
        kind="Pod",
        resource_type="pod",
        pods=(name,),
        container=container,
    )


def resolve_workload_target(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    cluster_id: str,
    kind: WorkloadLogKind,
    namespace: str,
    name: str,
    container: str | None,
) -> LogStreamTarget:
    _require_log_access(db, current, workspace_id, cluster_id)
    kubernetes_kind = WORKLOAD_KIND_NAMES[kind]
    resource = _inventory_resource(
        db,
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource_type="workload",
        kind=kubernetes_kind,
        namespace=namespace,
        name=name,
    )
    if resource is None:
        raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND)
    related_reader = getattr(db, "list_related_inventory_resources", None)
    if not callable(related_reader):
        raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND)
    related = related_reader(
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        resource=resource,
        limit=1000,
    )
    pods = [
        pod
        for pod in (related.get("pods") if isinstance(related, dict) else []) or []
        if isinstance(pod, dict)
        and str(pod.get("cluster_id") or "") == cluster_id
        and str(pod.get("namespace") or "") == namespace
        and str(pod.get("resource_type") or "").lower() == "pod"
        and str(pod.get("kind") or "").lower() == "pod"
    ]
    if container is not None and not any(_container_exists(pod, container) for pod in pods):
        raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND)
    pod_names = tuple(
        sorted({str(pod.get("name") or "") for pod in pods if str(pod.get("name") or "")})
    )
    return LogStreamTarget(
        target_type="workload",
        cluster_id=cluster_id,
        namespace=namespace,
        name=name,
        kind=kubernetes_kind,
        resource_type="workload",
        pods=pod_names,
        container=container,
    )


def queue_log_query(
    db: Any,
    *,
    workspace_id: str,
    user_id: str,
    target: LogStreamTarget,
    correlation_id: str | None = None,
) -> QueuedDebugQuery:
    query_name = f"{LOG_STREAM_QUERY_NAME_PREFIX}{uuid.uuid4().hex}"
    query = {
        "source": "loki",
        "name": query_name,
        "description": "Opsia bounded browser log stream batch",
        "query": safe_logql(target),
        "range_seconds": LOG_QUERY_RANGE_SECONDS,
        LOG_STREAM_QUERY_METADATA_KEY: target.metadata(),
    }
    queued = queue_debug_query(
        db,
        AgentDebugQueryRequest(
            cluster_id=target.cluster_id,
            query=query,
            reason="bounded browser log stream",
        ),
        workspace_id=workspace_id,
        requested_by=user_id,
        correlation_id=correlation_id,
    )
    if not queued.inserted:
        raise RuntimeError("failed to persist unique log stream command")
    return queued


def safe_logql(target: LogStreamTarget) -> str:
    labels = [f"k8s_namespace_name={json.dumps(target.namespace)}"]
    if target.pods:
        if len(target.pods) == 1:
            labels.append(f"k8s_pod_name={json.dumps(target.pods[0])}")
        else:
            alternatives = "|".join(_safe_pod_regex(name) for name in target.pods)
            labels.append(f"k8s_pod_name=~{json.dumps(f'^(?:{alternatives})$')}")
    else:
        # Kubernetes names cannot contain underscores. This selector is a safe,
        # guaranteed no-match query that still yields a persisted stream handle.
        labels.append('k8s_pod_name="__opsia_no_pod__"')
    if target.container is not None:
        labels.append(f"k8s_container_name={json.dumps(target.container)}")
    return "{" + ",".join(labels) + "}"


async def stream_log_events(
    request: Request,
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    initial_target: LogStreamTarget,
    initial_query: QueuedDebugQuery,
):
    yield LogStreamConnected(stream_id=initial_query.command_id)
    known_pods = set(initial_target.pods)
    for pod in sorted(known_pods):
        yield LogStreamPodAdded(pod=pod)
    if not known_pods:
        yield LogStreamEnd(reason="no_pods")
        return

    target = initial_target
    query = initial_query
    dedupe = BoundedDedupe()
    for batch_index in range(LOG_STREAM_BATCH_LIMIT):
        if await _is_disconnected(request):
            return
        row = await _wait_for_command(request, db, workspace_id, query, current, target)
        if row is None:
            if await _is_disconnected(request):
                return
            yield LogStreamError(code="agent_timeout", retryable=True)
            return
        if str(row.get("status") or "") != CommandStatus.COMPLETED:
            yield LogStreamError(code="agent_failed", retryable=True)
            return

        try:
            target = _reresolve_target(db, current, workspace_id, target)
        except HTTPException:
            yield LogStreamError(code="target_unavailable", retryable=False)
            return

        current_pods = set(target.pods)
        for pod in sorted(current_pods - known_pods):
            yield LogStreamPodAdded(pod=pod)
        for pod in sorted(known_pods - current_pods):
            yield LogStreamPodRemoved(pod=pod)
        known_pods = current_pods

        for evidence in extract_log_evidence(row, target=target, limit=1000):
            if dedupe.add(evidence.event.id):
                yield evidence.event

        if batch_index + 1 >= LOG_STREAM_BATCH_LIMIT:
            yield LogStreamEnd(reason="window_complete")
            return
        if await _wait_or_disconnect(request, LOG_STREAM_BATCH_INTERVAL_SECONDS):
            return
        if not known_pods:
            yield LogStreamEnd(reason="no_pods")
            return
        try:
            target = _reresolve_target(db, current, workspace_id, target)
            query = queue_log_query(
                db,
                workspace_id=workspace_id,
                user_id=str(current.user_id),
                target=target,
                correlation_id=initial_query.correlation_id,
            )
        except HTTPException:
            yield LogStreamError(code="target_unavailable", retryable=False)
            return
        except RuntimeError:
            yield LogStreamError(code="stream_unavailable", retryable=True)
            return


async def read_log_stream_evidence(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    stream_id: str,
    limit: int = MAX_AI_LOG_EVIDENCE,
) -> list[PersistedLogEvidence]:
    row = await db.get_agent_command(stream_id, workspace_id)
    if row is None or not _owned_log_query(row, current=current, expected=None):
        return []
    target = _target_from_command(row)
    correlation_id = row.get("correlation_id")
    if (
        target is None
        or str(row.get("cluster_id") or "") != target.cluster_id
        or not isinstance(correlation_id, str)
        or not correlation_id
        or str(row.get("status") or "") != CommandStatus.COMPLETED
    ):
        return []
    try:
        current_target = _reresolve_target(db, current, workspace_id, target)
    except HTTPException:
        return []
    reader = getattr(db, "list_agent_commands_by_correlation", None)
    if not callable(reader):
        return []
    rows = await reader(
        workspace_id,
        correlation_id,
        limit=LOG_STREAM_BATCH_LIMIT,
    )
    if not isinstance(rows, list) or not rows or len(rows) > LOG_STREAM_BATCH_LIMIT:
        return []

    logical_identity = _logical_target_identity(target)
    if _logical_target_identity(current_target) != logical_identity:
        return []
    completed: list[tuple[dict[str, Any], LogStreamTarget]] = []
    command_ids: set[str] = set()
    for candidate in rows:
        if not isinstance(candidate, dict):
            return []
        command_id = candidate.get("command_id")
        candidate_target = _target_from_command(candidate)
        if (
            not isinstance(command_id, str)
            or not command_id
            or command_id in command_ids
            or candidate.get("correlation_id") != correlation_id
            or not _owned_log_query(candidate, current=current, expected=None)
            or candidate_target is None
            or str(candidate.get("cluster_id") or "") != candidate_target.cluster_id
            or _logical_target_identity(candidate_target) != logical_identity
        ):
            return []
        command_ids.add(command_id)
        if str(candidate.get("status") or "") == CommandStatus.COMPLETED:
            completed.append((candidate, candidate_target))
    if stream_id not in command_ids:
        return []

    unique: list[PersistedLogEvidence] = []
    seen = BoundedDedupe(max_items=max(1, min(limit, MAX_AI_LOG_EVIDENCE)))
    evidence_limit = max(1, min(limit, MAX_AI_LOG_EVIDENCE))
    for candidate, candidate_target in completed:
        for item in extract_log_evidence(
            candidate,
            target=candidate_target,
            limit=evidence_limit - len(unique),
        ):
            if seen.add(item.event.id):
                unique.append(item)
            if len(unique) >= evidence_limit:
                return unique
    return unique


def _logical_target_identity(target: LogStreamTarget) -> tuple[str, ...]:
    return (
        target.target_type,
        target.cluster_id,
        target.namespace,
        target.name,
        target.kind,
        target.resource_type,
        target.container or "",
    )


def extract_log_evidence(
    row: dict[str, Any],
    *,
    target: LogStreamTarget,
    limit: int,
) -> list[PersistedLogEvidence]:
    result = row.get("result") if isinstance(row.get("result"), dict) else {}
    batches = result.get("result") if isinstance(result, dict) else None
    if not isinstance(batches, list):
        return []
    expected_query = _command_query(row)
    expected_name = str(expected_query.get("name") or "")
    expected_logql = str(expected_query.get("query") or "")
    evidence: list[PersistedLogEvidence] = []
    for batch in batches:
        if not isinstance(batch, dict):
            continue
        if (
            batch.get("source") != "loki"
            or batch.get("query_name") != expected_name
            or batch.get("query") != expected_logql
            or not isinstance(batch.get("redaction_summary"), dict)
            or batch["redaction_summary"].get("applied") is not True
        ):
            continue
        streams = batch.get("streams")
        if not isinstance(streams, list):
            continue
        for stream_payload in streams:
            evidence.extend(
                _stream_evidence(stream_payload, target=target, limit=limit - len(evidence))
            )
            if len(evidence) >= limit:
                return evidence
    return evidence


def _stream_evidence(
    payload: object,
    *,
    target: LogStreamTarget,
    limit: int,
) -> list[PersistedLogEvidence]:
    if limit <= 0 or not isinstance(payload, dict):
        return []
    labels = payload.get("stream") if isinstance(payload.get("stream"), dict) else {}
    namespace = _stream_label(labels, ("k8s_namespace_name", "namespace"))
    pod = _stream_label(labels, ("k8s_pod_name", "pod", "pod_name", "kubernetes_pod_name"))
    container = _stream_label(
        labels,
        ("k8s_container_name", "container", "container_name", "kubernetes_container_name"),
    )
    if (
        namespace != target.namespace
        or pod not in set(target.pods)
        or not container
        or (target.container is not None and container != target.container)
    ):
        return []
    values = payload.get("values")
    if not isinstance(values, list):
        return []
    evidence: list[PersistedLogEvidence] = []
    for value in values:
        if not isinstance(value, dict) or not isinstance(value.get("line"), str):
            continue
        raw_timestamp = value.get("timestamp")
        observed_at = _observed_at(raw_timestamp)
        if observed_at is None:
            continue
        redacted = redact_log_line(value["line"])
        line, defense_truncated = truncate_log_line(redacted)
        line_truncated = bool(value.get("line_truncated")) or defense_truncated
        line_id = _line_id(
            target.cluster_id,
            namespace,
            pod,
            container,
            str(raw_timestamp),
            line,
        )
        event = LogStreamLog(
            id=line_id,
            observed_at=observed_at,
            pod=pod,
            container=container,
            line=line,
            line_truncated=line_truncated,
        )
        evidence.append(PersistedLogEvidence(event=event, link=target.link()))
        if len(evidence) >= limit:
            return evidence
    return evidence


async def _wait_for_command(
    request: Request,
    db: Any,
    workspace_id: str,
    query: QueuedDebugQuery,
    current: Any,
    target: LogStreamTarget,
) -> dict[str, Any] | None:
    deadline = time.monotonic() + LOG_STREAM_RESULT_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if await _is_disconnected(request):
            return None
        row = await db.get_agent_command(query.command_id, workspace_id)
        if row is not None and not _owned_log_query(row, current=current, expected=query):
            return None
        if row is not None and str(row.get("cluster_id") or "") != target.cluster_id:
            return None
        if row is not None and str(row.get("status") or "") in {
            CommandStatus.COMPLETED,
            CommandStatus.FAILED,
        }:
            return row
        if await _wait_or_disconnect(request, LOG_STREAM_STATUS_POLL_SECONDS):
            return None
    return None


def _owned_log_query(
    row: dict[str, Any],
    *,
    current: Any,
    expected: QueuedDebugQuery | None,
) -> bool:
    if str(row.get("action") or "") != Command.TELEMETRY_QUERY_RUN_ACTION:
        return False
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    if payload.get("requested_by") != getattr(current, "user_id", None):
        return False
    if expected is not None and payload != expected.plan:
        return False
    query = _command_query(row)
    metadata = (
        query.get(LOG_STREAM_QUERY_METADATA_KEY)
        if isinstance(query.get(LOG_STREAM_QUERY_METADATA_KEY), dict)
        else {}
    )
    return metadata.get("protocol") == LOG_STREAM_PROTOCOL


def _target_from_command(row: dict[str, Any]) -> LogStreamTarget | None:
    query = _command_query(row)
    value = query.get(LOG_STREAM_QUERY_METADATA_KEY)
    if not isinstance(value, dict) or value.get("protocol") != LOG_STREAM_PROTOCOL:
        return None
    target_type = value.get("target_type")
    if target_type not in {"pod", "workload"}:
        return None
    if target_type == "pod" and (value.get("kind") != "Pod" or value.get("resource_type") != "pod"):
        return None
    if target_type == "workload" and (
        value.get("kind") not in set(WORKLOAD_KIND_NAMES.values())
        or value.get("resource_type") != "workload"
    ):
        return None
    try:
        target = LogStreamTarget(
            target_type=target_type,
            cluster_id=str(value["cluster_id"]),
            namespace=str(value["namespace"]),
            name=str(value["name"]),
            kind=str(value["kind"]),
            resource_type=str(value["resource_type"]),
            pods=tuple(str(pod) for pod in value.get("pods") or ()),
            container=(str(value["container"]) if value.get("container") is not None else None),
        )
    except (KeyError, TypeError, ValueError):
        return None
    if not _valid_persisted_target(target):
        return None
    if (
        query.get("source") != "loki"
        or not str(query.get("name") or "").startswith(LOG_STREAM_QUERY_NAME_PREFIX)
        or query.get("query") != safe_logql(target)
        or query.get("range_seconds") != LOG_QUERY_RANGE_SECONDS
    ):
        return None
    return target


def _valid_persisted_target(target: LogStreamTarget) -> bool:
    if (
        not target.cluster_id
        or len(target.cluster_id) > 512
        or not KUBERNETES_NAMESPACE_RE.fullmatch(target.namespace)
        or len(target.namespace) > 63
        or not KUBERNETES_NAME_RE.fullmatch(target.name)
        or len(target.name) > 253
        or len(target.pods) > 1000
        or len(set(target.pods)) != len(target.pods)
        or any(len(pod) > 253 or KUBERNETES_NAME_RE.fullmatch(pod) is None for pod in target.pods)
        or (
            target.container is not None
            and (
                len(target.container) > 63
                or KUBERNETES_CONTAINER_RE.fullmatch(target.container) is None
            )
        )
    ):
        return False
    return target.target_type != "pod" or target.pods == (target.name,)


def _command_query(row: dict[str, Any]) -> dict[str, Any]:
    plan = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    body = plan.get("payload") if isinstance(plan.get("payload"), dict) else {}
    query = body.get("query")
    return query if isinstance(query, dict) else {}


def _reresolve_target(
    db: Any,
    current: Any,
    workspace_id: str,
    target: LogStreamTarget,
) -> LogStreamTarget:
    if target.target_type == "pod":
        return resolve_pod_target(
            db,
            current=current,
            workspace_id=workspace_id,
            cluster_id=target.cluster_id,
            namespace=target.namespace,
            name=target.name,
            container=target.container,
        )
    kind = next(
        (key for key, value in WORKLOAD_KIND_NAMES.items() if value == target.kind),
        None,
    )
    if kind is None:
        raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND)
    return resolve_workload_target(
        db,
        current=current,
        workspace_id=workspace_id,
        cluster_id=target.cluster_id,
        kind=kind,
        namespace=target.namespace,
        name=target.name,
        container=target.container,
    )


def _inventory_resource(db: Any, **identity: Any) -> dict[str, Any] | None:
    reader = getattr(db, "get_inventory_resource", None)
    if not callable(reader):
        return None
    resource = reader(**identity)
    return resource if isinstance(resource, dict) else None


def _require_log_access(
    db: Any,
    current: Any,
    workspace_id: str,
    cluster_id: str,
) -> None:
    try:
        for permission in (Permission.INVENTORY_READ.value, Permission.EVIDENCE_READ.value):
            require_cluster_access(db, current, workspace_id, cluster_id, permission)
    except HTTPException as exc:
        if exc.status_code == 403:
            raise HTTPException(status_code=404, detail=TARGET_NOT_FOUND) from exc
        raise


def _container_exists(resource: dict[str, Any], container: str | None) -> bool:
    if container is None:
        return True
    summary = resource.get("summary") if isinstance(resource.get("summary"), dict) else {}
    containers = summary.get("containers") if isinstance(summary.get("containers"), list) else []
    return any(
        isinstance(item, dict) and str(item.get("name") or "") == container for item in containers
    )


def _safe_pod_regex(value: str) -> str:
    # Kubernetes DNS names are validated at the HTTP/inventory boundary. Dot is
    # the only regex metacharacter allowed by that alphabet.
    return value.replace(".", r"\.")


def _stream_label(stream: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        value = stream.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _observed_at(value: object) -> datetime | None:
    if isinstance(value, int) or (isinstance(value, str) and value.isdigit()):
        try:
            nanoseconds = int(value)
            return datetime.fromtimestamp(nanoseconds / 1_000_000_000, tz=UTC)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.utcoffset() is not None else None
    return None


def _line_id(
    cluster_id: str,
    namespace: str,
    pod: str,
    container: str,
    timestamp_identity: str,
    line: str,
) -> str:
    canonical = "\x1f".join((cluster_id, namespace, pod, container, timestamp_identity, line))
    return f"log-{hashlib.sha256(canonical.encode()).hexdigest()[:32]}"


async def _is_disconnected(request: Request) -> bool:
    return bool(await request.is_disconnected())


async def _wait_or_disconnect(request: Request, seconds: float) -> bool:
    deadline = time.monotonic() + max(0.0, seconds)
    while time.monotonic() < deadline:
        if await _is_disconnected(request):
            return True
        await asyncio.sleep(
            min(LOG_STREAM_DISCONNECT_POLL_SECONDS, max(0.0, deadline - time.monotonic()))
        )
    return await _is_disconnected(request)
