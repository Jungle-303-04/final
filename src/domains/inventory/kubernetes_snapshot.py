"""Translate target-agent Kubernetes evidence into inventory read-model payloads."""

from __future__ import annotations

from collections import Counter
from typing import Any

from packages.contracts.event_bus.interfaces import JsonObject


def kubernetes_evidence_to_inventory_snapshot(
    kubernetes: JsonObject,
    *,
    cluster_id: str,
    agent_id: str,
) -> JsonObject:
    cluster = _mapping(kubernetes.get("cluster"))
    resources = [
        *(_workload_resource(item) for item in _items(kubernetes, "workloads")),
        *(_pod_resource(item) for item in _items(kubernetes, "pods")),
        *(_node_resource(item, _items(kubernetes, "pods")) for item in _items(kubernetes, "nodes")),
        *(_service_resource(item) for item in _items(kubernetes, "services")),
        *(_event_resource(item) for item in _items(kubernetes, "events")),
        *(_endpoint_resource(item) for item in _items(kubernetes, "endpoints")),
    ]
    summary = _summary(kubernetes)
    return {
        "cluster_id": cluster_id,
        "agent_id": agent_id,
        "source": "cluster-agent:kubernetes",
        "collected_at": cluster.get("collected_at"),
        "replace": True,
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
    return {
        "pod_total": len(pods),
        "pod_running": phases.get("Running", 0),
        "pod_pending": phases.get("Pending", 0),
        "pod_failed": phases.get("Failed", 0),
        "restart_total": sum(int(pod.get("restart_total") or 0) for pod in pods),
        "node_total": len(nodes),
        "node_ready": sum(1 for node in nodes if bool(node.get("ready"))),
    }


def _mapping(value: Any) -> JsonObject:
    return dict(value) if isinstance(value, dict) else {}


def _items(payload: JsonObject, key: str) -> list[JsonObject]:
    value = payload.get(key)
    return [dict(item) for item in value] if isinstance(value, list) else []


def _text(value: Any, default: str = "") -> str:
    return str(value) if value is not None else default


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
        "status": f"{ready}/{desired}",
        "health": _health(desired == 0 or ready >= desired),
        "summary": item,
        "raw": item,
    }


def _pod_resource(item: JsonObject) -> JsonObject:
    phase = _text(item.get("phase"), "Unknown")
    waiting = item.get("waiting_reasons") if isinstance(item.get("waiting_reasons"), list) else []
    containers = item.get("containers") if isinstance(item.get("containers"), list) else []
    return {
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), "pod"),
        "uid": item.get("uid"),
        "status": phase,
        "health": _health(phase == "Running" and not waiting),
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
        "status": "Ready" if ready else "NotReady",
        "health": _health(ready),
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
        "status": _text(item.get("type"), "Service"),
        "health": "healthy",
        "summary": item,
        "raw": item,
    }


def _event_resource(item: JsonObject) -> JsonObject:
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
        "status": event_type,
        "health": "degraded" if event_type.lower() == "warning" else "healthy",
        "summary": item,
        "raw": item,
    }


def _endpoint_resource(item: JsonObject) -> JsonObject:
    return {
        "resource_type": "endpoint",
        "api_version": "discovery.k8s.io/v1",
        "kind": "EndpointSlice",
        "namespace": _text(item.get("namespace"), "default"),
        "name": _text(item.get("name"), "endpoint"),
        "status": _text(item.get("address_type"), "unknown"),
        "health": "healthy",
        "summary": item,
        "raw": item,
    }


def _first_container_image(containers: list[Any]) -> str:
    for container in containers:
        if isinstance(container, dict) and container.get("image"):
            return str(container["image"])
    return ""


def _summary(kubernetes: JsonObject) -> JsonObject:
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
    return {
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
    }
