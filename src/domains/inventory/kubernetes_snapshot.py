"""Translate target-agent Kubernetes evidence into inventory read-model payloads."""

from __future__ import annotations

from collections import Counter
from typing import Any

from packages.contracts.event_bus.interfaces import JsonObject
from packages.kubernetes_provider import normalized_detected_provider


def kubernetes_evidence_to_inventory_snapshot(
    kubernetes: JsonObject,
    *,
    cluster_id: str,
    agent_id: str,
) -> JsonObject:
    cluster = _mapping(kubernetes.get("cluster"))
    collected_at = cluster.get("collected_at")
    resources = [
        *(_workload_resource(item) for item in _items(kubernetes, "workloads")),
        *(_pod_resource(item) for item in _items(kubernetes, "pods")),
        *(_node_resource(item, _items(kubernetes, "pods")) for item in _items(kubernetes, "nodes")),
        *(_service_resource(item) for item in _items(kubernetes, "services")),
        *(
            _event_resource(item, collected_at=collected_at)
            for item in _items(kubernetes, "events")
        ),
        *(_endpoint_resource(item) for item in _items(kubernetes, "endpoints")),
    ]
    resources_complete = _resources_complete(kubernetes)
    summary = _summary(kubernetes, resources_complete=resources_complete)
    return {
        "cluster_id": cluster_id,
        "agent_id": agent_id,
        "source": "cluster-agent:kubernetes",
        "collected_at": cluster.get("collected_at"),
        # Destructive replacement is safe only when every provider query completed and the
        # agent did not truncate any collection. Partial evidence must preserve prior rows.
        "replace": resources_complete,
        "resources": resources,
        "summary": summary,
        "health": {
            "status": "healthy" if resources else "empty",
            "provider_status": _mapping(kubernetes.get("provider_status")),
        },
        "usage": _usage_rollup(kubernetes),
    }


def _usage_rollup(kubernetes: JsonObject) -> JsonObject:
    """스냅샷 시점의 실측 활용 롤업 — cluster_usage_samples 시계열의 데이터 원천.

    agent 가 실제로 관측한 pod phase·재시작 수·node ready 만 집계한다(합성 값 금지).
    관측 대상이 하나도 없으면 빈 dict — 저장소가 usage 행을 만들지 않는다(기존 동작).
    """
    pods = _items(kubernetes, "pods")
    nodes = _items(kubernetes, "nodes")
    if not pods and not nodes:
        return {}
    phases = Counter(_text(pod.get("phase"), "Unknown") for pod in pods)
    usage = {
        "pod_total": len(pods),
        "pod_running": phases.get("Running", 0),
        "pod_pending": phases.get("Pending", 0),
        "pod_failed": phases.get("Failed", 0),
        "restart_total": sum(int(pod.get("restart_total") or 0) for pod in pods),
        "node_total": len(nodes),
        "node_ready": sum(1 for node in nodes if bool(node.get("ready"))),
    }
    pod_usage = _pod_usage(pods)
    node_usage = _node_usage(nodes)
    if pod_usage:
        usage["pods"] = pod_usage
    if node_usage:
        usage["nodes"] = node_usage

    cpu_pct = _cluster_pct(nodes, "cpu_mcores", "cpu_ratio")
    mem_pct = _cluster_pct(nodes, "mem_mib", "mem_ratio")
    if cpu_pct is not None:
        usage["cpu_pct"] = cpu_pct
    if mem_pct is not None:
        usage["mem_pct"] = mem_pct
    return usage


def _pod_usage(pods: list[JsonObject]) -> JsonObject:
    usage: JsonObject = {}
    for pod in pods:
        namespace = _text(pod.get("namespace"), "default")
        name = _text(pod.get("name"))
        if not name:
            continue
        payload: JsonObject = {}
        for source_key, target_key in (("cpu_mcores", "cpu_mcores"), ("mem_mib", "mem_mib")):
            value = _float_or_none(pod.get(source_key))
            if value is not None:
                payload[target_key] = value
        if payload:
            usage[f"{namespace}/{name}"] = payload
    return usage


def _node_usage(nodes: list[JsonObject]) -> JsonObject:
    usage: JsonObject = {}
    for node in nodes:
        name = _text(node.get("name"))
        if not name:
            continue
        payload: JsonObject = {}
        for source_key, target_key in (
            ("cpu_mcores", "cpu_mcores"),
            ("mem_mib", "mem_mib"),
            ("cpu_ratio", "cpu_ratio"),
            ("mem_ratio", "mem_ratio"),
        ):
            value = _float_or_none(node.get(source_key))
            if value is not None:
                payload[target_key] = value
        if payload:
            if "cpu_ratio" in payload:
                payload["cpu_pct"] = round(float(payload["cpu_ratio"]) * 100, 1)
            if "mem_ratio" in payload:
                payload["mem_pct"] = round(float(payload["mem_ratio"]) * 100, 1)
            usage[name] = payload
    return usage


def _cluster_pct(nodes: list[JsonObject], usage_key: str, ratio_key: str) -> float | None:
    observed = [
        (_float_or_none(node.get(usage_key)), _float_or_none(node.get(ratio_key))) for node in nodes
    ]
    ratios = [ratio for value, ratio in observed if value is not None and ratio is not None]
    if not ratios:
        return None
    return round(sum(ratios) / len(ratios) * 100, 1)


def _mapping(value: Any) -> JsonObject:
    return dict(value) if isinstance(value, dict) else {}


def _labels(item: JsonObject) -> JsonObject:
    return _mapping(item.get("labels"))


def _items(payload: JsonObject, key: str) -> list[JsonObject]:
    value = payload.get(key)
    return [dict(item) for item in value] if isinstance(value, list) else []


def _text(value: Any, default: str = "") -> str:
    return str(value) if value is not None else default


def _float_or_none(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _health(ok: bool) -> str:
    return "healthy" if ok else "degraded"


def _workload_resource(item: JsonObject) -> JsonObject:
    desired = int(item.get("desired_replicas") or 0)
    ready = int(item.get("ready_replicas") or 0)
    kind = _text(item.get("kind"), "Workload")
    return {
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": kind,
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), kind.lower()),
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": f"{ready}/{desired}",
        "health": _health(desired == 0 or ready >= desired),
        "labels": _labels(item),
        "summary": item,
        "raw": item,
    }


def _pod_resource(item: JsonObject) -> JsonObject:
    phase = _text(item.get("phase"), "Unknown")
    waiting = item.get("waiting_reasons") if isinstance(item.get("waiting_reasons"), list) else []
    containers = item.get("containers") if isinstance(item.get("containers"), list) else []
    conditions = item.get("conditions") if isinstance(item.get("conditions"), list) else []
    ready_condition = next(
        (
            condition
            for condition in conditions
            if isinstance(condition, dict) and condition.get("type") == "Ready"
        ),
        None,
    )
    ready = ready_condition is None or str(ready_condition.get("status")) == "True"
    return {
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), "pod"),
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": phase,
        "health": _health(phase == "Running" and not waiting and ready),
        "labels": _labels(item),
        "summary": {
            **item,
            "image": _first_container_image(containers),
        },
        "raw": item,
    }


def _node_resource(item: JsonObject, pods: list[JsonObject]) -> JsonObject:
    name = _text(item.get("name"), "node")
    ready = bool(item.get("ready"))
    return {
        "resource_type": "node",
        "api_version": "v1",
        "kind": "Node",
        "namespace": None,
        "name": name,
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": "Ready" if ready else "NotReady",
        "health": _health(ready),
        "labels": _labels(item),
        "summary": {
            **item,
            "pod_count": sum(1 for pod in pods if pod.get("node_name") == name),
        },
        "raw": item,
    }


def _service_resource(item: JsonObject) -> JsonObject:
    return {
        "resource_type": "service",
        "api_version": "v1",
        "kind": "Service",
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), "service"),
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": _text(item.get("type"), "Service"),
        "health": "healthy",
        "labels": _labels(item),
        "summary": item,
        "raw": item,
    }


def _event_resource(item: JsonObject, *, collected_at: object = None) -> JsonObject:
    name = _text(item.get("uid")) or ":".join(
        [
            _text(item.get("namespace"), "default"),
            _text(item.get("involved_kind"), "Object"),
            _text(item.get("involved_name"), "unknown"),
            _text(item.get("reason"), "event"),
        ]
    )
    event_type = _text(item.get("type"), "Normal")
    return {
        "resource_type": "event",
        "api_version": "v1",
        "kind": "Event",
        "namespace": _text(item.get("namespace"), "default"),
        "name": name,
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": event_type,
        "health": "degraded" if event_type.lower() == "warning" else "healthy",
        "labels": _labels(item),
        "summary": {**item, "collected_at": collected_at},
        "raw": item,
    }


def _endpoint_resource(item: JsonObject) -> JsonObject:
    return {
        "resource_type": "endpoint",
        "api_version": "discovery.k8s.io/v1",
        "kind": "EndpointSlice",
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), "endpoint"),
        "uid": item.get("uid"),
        "resource_version": item.get("resource_version"),
        "status": _text(item.get("address_type"), "unknown"),
        "health": "healthy",
        "labels": _labels(item),
        "summary": item,
        "raw": item,
    }


def _first_container_image(containers: list[Any]) -> str:
    for container in containers:
        if isinstance(container, dict) and container.get("image"):
            return str(container["image"])
    return ""


def _summary(kubernetes: JsonObject, *, resources_complete: bool) -> JsonObject:
    pods = _items(kubernetes, "pods")
    nodes = _items(kubernetes, "nodes")
    services = _items(kubernetes, "services")
    phases = Counter(_text(pod.get("phase"), "Unknown") for pod in pods)
    namespaces = sorted(
        {
            _text(item.get("namespace"))
            for key in ("pods", "workloads", "services", "events", "endpoints")
            for item in _items(kubernetes, key)
            if item.get("namespace")
        }
    )
    label_sources = [
        item
        for key in ("pods", "workloads", "nodes", "services", "events", "endpoints")
        for item in _items(kubernetes, key)
    ]
    collection_scopes = _items(kubernetes, "collection_scopes")
    live_inventory = all(not _text(scope.get("label_selector")) for scope in collection_scopes)
    event_capture = _kubernetes_event_capture(kubernetes)
    summary: JsonObject = {
        "namespaces": namespaces,
        "nodes": [
            {
                "name": _text(node.get("name"), "node"),
                "ready": bool(node.get("ready")),
                "pod_count": sum(1 for pod in pods if pod.get("node_name") == node.get("name")),
                "version": _text(_mapping(node.get("node_info")).get("kubeletVersion")),
            }
            for node in nodes
        ],
        "pod_phases": dict(phases),
        "services": len(services),
        "labels_complete": resources_complete
        and all(item.get("labels_complete") is True for item in label_sources),
        "resources_complete": resources_complete,
        # The all-namespace Event capture is intentionally separate from user-scoped
        # resources. Its facts are stored only for the Timeline producer; coverage/gap
        # remains on this snapshot until a dedicated Timeline coverage projection exists.
        "kubernetes_event_capture": event_capture,
        "kubernetes_event_facts": _kubernetes_event_facts(kubernetes, event_capture),
        # RCA test/label-selector snapshots are evidence, not authoritative fleet liveness.
        # Legacy payloads have no scope list and are treated as normal inventory.
        "live_inventory": live_inventory,
    }
    collection_limits = _mapping(kubernetes.get("collection_limits"))
    if collection_limits:
        summary["collection_limits"] = collection_limits
    detected_provider = normalized_detected_provider(kubernetes.get("detected_provider"))
    if detected_provider is not None:
        summary["detected_provider"] = detected_provider
    return summary


def _resources_complete(_kubernetes: JsonObject) -> bool:
    # This translator consumes evidence-job results. KubernetesSnapshotQuery is scoped to
    # one namespace and may also carry a label selector, so provider success proves query
    # success rather than full-cluster coverage. A dedicated authoritative sweep contract
    # must be introduced before this path may destructively replace cluster inventory.
    return False


def _kubernetes_event_capture(kubernetes: JsonObject) -> JsonObject:
    source_capture = _mapping(kubernetes.get("event_capture"))
    if source_capture:
        freshness = _mapping(source_capture.get("freshness"))
        coverage = _mapping(source_capture.get("coverage"))
        return {
            "complete": source_capture.get("complete") is True,
            "truncated": source_capture.get("truncated") is True,
            "reason": _text(source_capture.get("reason"), "invalid_capture_contract"),
            "freshness": {
                "observed_at": freshness.get("observed_at"),
                "max_age_seconds": freshness.get("max_age_seconds"),
            },
            "coverage": {
                key: coverage[key]
                for key in (
                    "scope",
                    "pagination",
                    "page_count",
                    "event_count",
                    "resource_version",
                    "gap",
                )
                if key in coverage
            },
        }
    collection_limits = _mapping(kubernetes.get("collection_limits"))
    limits = _mapping(collection_limits.get("lists"))
    event_limit = _mapping(limits.get("events"))
    return {
        "complete": False,
        "truncated": event_limit.get("truncated") is True,
        "reason": "not_requested",
        "freshness": {},
        "coverage": {
            "scope": "all_namespaces",
            "pagination": "continue",
            "gap": "not_requested",
        },
    }


def _kubernetes_event_facts(kubernetes: JsonObject, capture: JsonObject) -> list[JsonObject]:
    """Persist only a complete global Event fact list; partial lists never cross this boundary."""
    if (
        capture.get("complete") is not True
        or capture.get("truncated") is True
        or capture.get("reason") != "complete"
    ):
        return []
    source_capture = _mapping(kubernetes.get("event_capture"))
    source_facts = source_capture.get("events")
    if not isinstance(source_facts, list):
        return []
    facts: list[JsonObject] = []
    for fact in source_facts:
        if not isinstance(fact, dict):
            return []
        safe_fact = {
            key: fact[key]
            for key in (
                "uid",
                "api_version",
                "namespace",
                "name",
                "type",
                "count",
                "last_occurrence_at",
            )
            if key in fact
        }
        if not safe_fact.get("uid") or not safe_fact.get("name"):
            return []
        facts.append(safe_fact)
    return facts
