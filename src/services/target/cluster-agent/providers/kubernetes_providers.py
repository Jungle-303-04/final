from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import httpx
from kubernetes_api import (
    kubernetes_api_base_url,
    kubernetes_client,
    kubernetes_headers,
    service_account_token,
)
from queries import KubernetesSnapshotQuery
from telemetry_registry import telemetry

from config import KUBERNETES_API_TIMEOUT_SECONDS, TARGET_CLUSTER_ID_ENV
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.target import TARGET_NAMESPACE
from providers.base import ConfigReader


@telemetry.source(
    source="kubernetes",
    evidence_key="kubernetes",
    query_type=KubernetesSnapshotQuery,
)
class KubernetesSnapshotProvider:
    span_name = "kubernetes.collect"
    query_count_attribute = "kubernetes.query_count"
    result_count_attribute = "kubernetes.result_count"
    timeout_seconds = KUBERNETES_API_TIMEOUT_SECONDS
    failure_message = "kubernetes snapshot collection failed"
    queries: tuple[KubernetesSnapshotQuery, ...] = ()

    def __init__(
        self,
        *,
        cluster_id: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.cluster_id = cluster_id
        self.transport = transport

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> KubernetesSnapshotProvider:
        return cls(cluster_id=read_config(TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID))

    async def query(
        self,
        _client: httpx.AsyncClient,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        namespace = telemetry_query.namespace or TARGET_NAMESPACE
        if not base_url or not token:
            return {
                "status": "unavailable",
                "reason": "kubernetes api is not configured",
                "namespace": namespace,
                "cluster_id": self.cluster_id,
            }

        headers = kubernetes_headers(token)
        async with kubernetes_client(self.transport) as client:
            return {
                "status": "success",
                "namespace": namespace,
                "cluster_id": self.cluster_id,
                "collected_at": datetime.now(UTC).isoformat(),
                "pods": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/pods",
                ),
                "events": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/events",
                ),
                "nodes": await self.get_json(client, base_url, headers, "/api/v1/nodes"),
                "pod_metrics": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/metrics.k8s.io/v1beta1/namespaces/{namespace}/pods",
                    allow_not_found=True,
                ),
                "node_metrics": await self.get_json(
                    client,
                    base_url,
                    headers,
                    "/apis/metrics.k8s.io/v1beta1/nodes",
                    allow_not_found=True,
                ),
                "deployments": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/deployments",
                ),
                "statefulsets": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/statefulsets",
                ),
                "daemonsets": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/daemonsets",
                ),
                "replicasets": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/replicasets",
                ),
                "services": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/services",
                ),
                "endpointslices": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/discovery.k8s.io/v1/namespaces/{namespace}/endpointslices",
                    allow_not_found=True,
                ),
            }

    async def get_json(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        path: str,
        *,
        allow_not_found: bool = False,
    ) -> JsonObject:
        response = await client.get(f"{base_url}{path}", headers=headers)
        if allow_not_found and response.status_code in {403, 404}:
            return {"items": []}
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {"items": []}

    def empty_results(self) -> JsonObject:
        return empty_snapshot(self.cluster_id)

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
        payload: JsonObject,
    ) -> None:
        normalized = self.normalize_payload(payload, telemetry_query)
        merge_snapshot(results, normalized)

    def build_response(self, results: JsonObject) -> JsonObject:
        return results

    def normalize_payload(
        self,
        payload: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        snapshot = empty_snapshot(self.cluster_id)
        status = str(payload.get("status") or "success")
        namespace = str(payload.get("namespace") or telemetry_query.namespace or TARGET_NAMESPACE)
        snapshot["cluster"] = {
            "cluster_id": str(payload.get("cluster_id") or self.cluster_id),
            "namespace": namespace,
            "collected_at": str(payload.get("collected_at") or datetime.now(UTC).isoformat()),
        }
        pod_metrics = pod_metrics_by_key(items(payload.get("pod_metrics")))
        node_metrics = node_metrics_by_name(items(payload.get("node_metrics")))
        snapshot["pods"] = [
            pod_summary(
                item,
                pod_metrics.get(
                    (
                        str(metadata(item).get("namespace") or namespace),
                        str(metadata(item).get("name") or ""),
                    )
                ),
            )
            for item in items(payload.get("pods"))
        ]
        snapshot["events"] = [event_summary(item) for item in items(payload.get("events"))]
        snapshot["nodes"] = [
            node_summary(item, node_metrics.get(str(metadata(item).get("name") or "")))
            for item in items(payload.get("nodes"))
        ]
        snapshot["workloads"] = [
            *workload_summaries("Deployment", items(payload.get("deployments"))),
            *workload_summaries("StatefulSet", items(payload.get("statefulsets"))),
            *workload_summaries("DaemonSet", items(payload.get("daemonsets"))),
            *workload_summaries("ReplicaSet", items(payload.get("replicasets"))),
        ]
        snapshot["services"] = [service_summary(item) for item in items(payload.get("services"))]
        snapshot["endpoints"] = [
            endpoint_slice_summary(item) for item in items(payload.get("endpointslices"))
        ]
        snapshot["provider_status"] = {
            telemetry_query.query_name: {
                "status": status,
                "namespace": namespace,
                "reason": payload.get("reason", ""),
                "counts": {
                    "pods": len(snapshot["pods"]),
                    "events": len(snapshot["events"]),
                    "nodes": len(snapshot["nodes"]),
                    "pod_metrics": len(pod_metrics),
                    "node_metrics": len(node_metrics),
                    "workloads": len(snapshot["workloads"]),
                    "services": len(snapshot["services"]),
                    "endpoints": len(snapshot["endpoints"]),
                },
            }
        }
        return snapshot


def empty_snapshot(cluster_id: str) -> JsonObject:
    return {
        "cluster": {"cluster_id": cluster_id},
        "workloads": [],
        "pods": [],
        "events": [],
        "nodes": [],
        "services": [],
        "endpoints": [],
        "provider_status": {},
    }


def merge_snapshot(target: JsonObject, source: JsonObject) -> None:
    target["cluster"] = {**dict(target.get("cluster", {})), **dict(source.get("cluster", {}))}
    for key in ("workloads", "pods", "events", "services", "endpoints"):
        target.setdefault(key, [])
        target[key].extend(source.get(key, []))
    merge_cluster_scoped_nodes(target, source)
    target.setdefault("provider_status", {})
    target["provider_status"].update(source.get("provider_status", {}))


def merge_cluster_scoped_nodes(target: JsonObject, source: JsonObject) -> None:
    # namespace별 snapshot이 같은 /api/v1/nodes 결과를 반복 수집하므로 node는 cluster scope로 병합한다.
    by_key: dict[str, JsonObject] = {}
    for node in [*target.get("nodes", []), *source.get("nodes", [])]:
        if not isinstance(node, dict):
            continue
        key = str(node.get("uid") or node.get("name") or "")
        if not key:
            continue
        by_key[key] = node
    target["nodes"] = list(by_key.values())


def items(payload: Any) -> list[JsonObject]:
    if not isinstance(payload, dict):
        return []
    raw_items = payload.get("items", [])
    if not isinstance(raw_items, list):
        return []
    return [item for item in raw_items if isinstance(item, dict)]


def metadata(item: JsonObject) -> JsonObject:
    value = item.get("metadata", {})
    return value if isinstance(value, dict) else {}


def status(item: JsonObject) -> JsonObject:
    value = item.get("status", {})
    return value if isinstance(value, dict) else {}


def spec(item: JsonObject) -> JsonObject:
    value = item.get("spec", {})
    return value if isinstance(value, dict) else {}


def safe_labels(item: JsonObject, limit: int = 12) -> JsonObject:
    labels = metadata(item).get("labels", {})
    if not isinstance(labels, dict):
        return {}
    return {str(key): str(value) for key, value in list(labels.items())[:limit]}


def owner_ref(item: JsonObject) -> tuple[str | None, str | None]:
    refs = metadata(item).get("ownerReferences", [])
    if not isinstance(refs, list) or not refs:
        return None, None
    ref = refs[0] if isinstance(refs[0], dict) else {}
    return as_text(ref.get("kind")), as_text(ref.get("name"))


def as_text(value: Any) -> str | None:
    return str(value) if value is not None else None


def pod_summary(item: JsonObject, metrics: JsonObject | None = None) -> JsonObject:
    meta = metadata(item)
    pod_status = status(item)
    pod_spec = spec(item)
    owner_kind, owner_name = owner_ref(item)
    measured = dict(metrics or {})
    containers = [
        container_summary(container)
        for container in pod_status.get("containerStatuses", [])
        if isinstance(container, dict)
    ]
    return {
        "uid": meta.get("uid"),
        "name": meta.get("name"),
        "namespace": meta.get("namespace"),
        "node_name": pod_spec.get("nodeName"),
        "phase": pod_status.get("phase"),
        "reason": pod_status.get("reason"),
        "message": pod_status.get("message"),
        "start_time": pod_status.get("startTime"),
        "labels": safe_labels(item),
        "owner_kind": owner_kind,
        "owner_name": owner_name,
        "workload_key": workload_key(meta.get("namespace"), owner_kind, owner_name),
        "pod_ip": pod_status.get("podIP"),
        "host_ip": pod_status.get("hostIP"),
        "conditions": pod_status.get("conditions", []),
        "containers": containers,
        "cpu_mcores": measured.get("cpu_mcores"),
        "mem_mib": measured.get("mem_mib"),
        "restart_total": sum(int(container.get("restart_count", 0)) for container in containers),
        "waiting_reasons": [
            container.get("state_reason")
            for container in containers
            if container.get("state") == "waiting" and container.get("state_reason")
        ],
        # 현재 terminated 상태와 직전(lastState) terminated 사유를 함께 승격 —
        # crashloop 중 waiting 으로 관측돼도 OOMKilled 등 크래시 사유가 보존된다.
        "terminated_reasons": [
            *(
                container.get("state_reason")
                for container in containers
                if container.get("state") == "terminated" and container.get("state_reason")
            ),
            *(
                container.get("last_state_reason")
                for container in containers
                if container.get("last_state") == "terminated"
                and container.get("last_state_reason")
            ),
        ],
    }


def container_summary(item: JsonObject) -> JsonObject:
    state_name, state_payload = container_state(item, "state")
    # crashloop 파드는 현재 state 가 waiting(CrashLoopBackOff)이고 직전 크래시의
    # 종료 사유/exit code 는 lastState.terminated 에 있다 — RCA 원인 판별
    # (OOMKilled/137 vs exit 1)에 필수라 함께 요약한다.
    last_state_name, last_state_payload = container_state(item, "lastState")
    return {
        "name": item.get("name"),
        "image": item.get("image"),
        "ready": item.get("ready"),
        "restart_count": item.get("restartCount", 0),
        "state": state_name,
        "state_reason": state_payload.get("reason"),
        "state_message": state_payload.get("message"),
        "exit_code": state_payload.get("exitCode"),
        "started_at": state_payload.get("startedAt"),
        "finished_at": state_payload.get("finishedAt"),
        "last_state": last_state_name,
        "last_state_reason": last_state_payload.get("reason"),
        "last_exit_code": last_state_payload.get("exitCode"),
    }


def container_state(item: JsonObject, key: str) -> tuple[str | None, JsonObject]:
    state = item.get(key, {}) if isinstance(item.get(key), dict) else {}
    state_name = next(iter(state), None)
    state_payload = (
        state.get(state_name, {}) if state_name and isinstance(state.get(state_name), dict) else {}
    )
    return state_name, state_payload if isinstance(state_payload, dict) else {}


def event_summary(item: JsonObject) -> JsonObject:
    meta = metadata(item)
    involved = item.get("involvedObject", {})
    if not isinstance(involved, dict):
        involved = {}
    source = item.get("source", {})
    if not isinstance(source, dict):
        source = {}
    return {
        "uid": meta.get("uid"),
        "namespace": meta.get("namespace"),
        "type": item.get("type"),
        "reason": item.get("reason"),
        "message": item.get("message"),
        "count": item.get("count"),
        "first_timestamp": item.get("firstTimestamp") or item.get("eventTime"),
        "last_timestamp": item.get("lastTimestamp") or item.get("eventTime"),
        "reporting_component": item.get("reportingComponent") or source.get("component"),
        "involved_kind": involved.get("kind"),
        "involved_name": involved.get("name"),
        "involved_uid": involved.get("uid"),
    }


def node_summary(item: JsonObject, metrics: JsonObject | None = None) -> JsonObject:
    node_status = status(item)
    allocatable = node_status.get("allocatable", {}) if isinstance(node_status, dict) else {}
    measured = dict(metrics or {})
    cpu_mcores = as_float(measured.get("cpu_mcores"))
    mem_mib = as_float(measured.get("mem_mib"))
    allocatable_cpu = parse_cpu_mcores(
        allocatable.get("cpu") if isinstance(allocatable, dict) else None
    )
    allocatable_mem = parse_memory_mib(
        allocatable.get("memory") if isinstance(allocatable, dict) else None
    )
    conditions = node_status.get("conditions", [])
    ready_condition = next(
        (
            condition
            for condition in conditions
            if isinstance(condition, dict) and condition.get("type") == "Ready"
        ),
        {},
    )
    return {
        "name": metadata(item).get("name"),
        "ready": ready_condition.get("status") == "True",
        "conditions": conditions,
        "taints": spec(item).get("taints", []),
        "capacity": node_status.get("capacity", {}),
        "allocatable": allocatable,
        "cpu_mcores": cpu_mcores,
        "mem_mib": mem_mib,
        "cpu_ratio": safe_ratio(cpu_mcores, allocatable_cpu),
        "mem_ratio": safe_ratio(mem_mib, allocatable_mem),
        "node_info": node_status.get("nodeInfo", {}),
    }


def pod_metrics_by_key(rows: list[JsonObject]) -> dict[tuple[str, str], JsonObject]:
    result: dict[tuple[str, str], JsonObject] = {}
    for item in rows:
        meta = metadata(item)
        namespace = str(meta.get("namespace") or "")
        name = str(meta.get("name") or "")
        if namespace and name:
            result[(namespace, name)] = pod_metric_summary(item)
    return result


def node_metrics_by_name(rows: list[JsonObject]) -> dict[str, JsonObject]:
    result: dict[str, JsonObject] = {}
    for item in rows:
        name = str(metadata(item).get("name") or "")
        if name:
            result[name] = metric_usage_summary(item)
    return result


def pod_metric_summary(item: JsonObject) -> JsonObject:
    containers = item.get("containers") if isinstance(item.get("containers"), list) else []
    cpu = 0.0
    memory = 0.0
    seen = False
    for container in containers:
        if not isinstance(container, dict):
            continue
        usage = container.get("usage") if isinstance(container.get("usage"), dict) else {}
        cpu_value = parse_cpu_mcores(usage.get("cpu"))
        mem_value = parse_memory_mib(usage.get("memory"))
        if cpu_value is not None:
            cpu += cpu_value
            seen = True
        if mem_value is not None:
            memory += mem_value
            seen = True
    return {"cpu_mcores": cpu if seen else None, "mem_mib": memory if seen else None}


def metric_usage_summary(item: JsonObject) -> JsonObject:
    usage = item.get("usage") if isinstance(item.get("usage"), dict) else {}
    return {
        "cpu_mcores": parse_cpu_mcores(usage.get("cpu")),
        "mem_mib": parse_memory_mib(usage.get("memory")),
    }


def parse_cpu_mcores(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    try:
        if text.endswith("n"):
            return float(text[:-1]) / 1_000_000
        if text.endswith("u"):
            return float(text[:-1]) / 1_000
        if text.endswith("m"):
            return float(text[:-1])
        return float(text) * 1000
    except ValueError:
        return None


def parse_memory_mib(value: Any) -> float | None:
    text = str(value or "").strip()
    if not text:
        return None
    units = {
        "Ki": 1 / 1024,
        "Mi": 1,
        "Gi": 1024,
        "Ti": 1024 * 1024,
        "K": 1000 / 1024 / 1024,
        "M": 1000 * 1000 / 1024 / 1024,
        "G": 1000 * 1000 * 1000 / 1024 / 1024,
    }
    for suffix, multiplier in units.items():
        if text.endswith(suffix):
            try:
                return float(text[: -len(suffix)]) * multiplier
            except ValueError:
                return None
    try:
        return float(text) / 1024 / 1024
    except ValueError:
        return None


def safe_ratio(value: float | None, total: float | None) -> float | None:
    if value is None or total is None or total <= 0:
        return None
    return value / total


def as_float(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def workload_summaries(kind: str, rows: list[JsonObject]) -> list[JsonObject]:
    return [workload_summary(kind, item) for item in rows]


def workload_summary(kind: str, item: JsonObject) -> JsonObject:
    meta = metadata(item)
    workload_status = status(item)
    return {
        "kind": kind,
        "namespace": meta.get("namespace"),
        "name": meta.get("name"),
        "generation": meta.get("generation"),
        "observed_generation": workload_status.get("observedGeneration"),
        "desired_replicas": spec(item).get("replicas"),
        "ready_replicas": workload_status.get("readyReplicas", 0),
        "available_replicas": workload_status.get("availableReplicas", 0),
        "updated_replicas": workload_status.get("updatedReplicas", 0),
        "unavailable_replicas": workload_status.get("unavailableReplicas", 0),
        "conditions": workload_status.get("conditions", []),
        "selector": spec(item).get("selector", {}),
    }


def service_summary(item: JsonObject) -> JsonObject:
    service_spec = spec(item)
    service_status = status(item)
    load_balancer = service_status.get("loadBalancer", {})
    ingress = load_balancer.get("ingress", []) if isinstance(load_balancer, dict) else []
    external_hosts = [
        str(entry.get("hostname") or entry.get("ip"))
        for entry in ingress
        if isinstance(entry, dict) and (entry.get("hostname") or entry.get("ip"))
    ]
    return {
        "namespace": metadata(item).get("namespace"),
        "name": metadata(item).get("name"),
        "type": service_spec.get("type"),
        "cluster_ip": service_spec.get("clusterIP"),
        "ports": service_spec.get("ports", []),
        "selector": service_spec.get("selector", {}),
        "load_balancer": {"ingress": ingress},
        "external_hosts": external_hosts,
        "external_url": f"http://{external_hosts[0]}" if external_hosts else None,
    }


def endpoint_slice_summary(item: JsonObject) -> JsonObject:
    endpoint_spec = item
    return {
        "namespace": metadata(item).get("namespace"),
        "name": metadata(item).get("name"),
        "address_type": endpoint_spec.get("addressType"),
        "endpoint_count": len(endpoint_spec.get("endpoints", [])),
        "ports": endpoint_spec.get("ports", []),
    }


def workload_key(namespace: Any, kind: str | None, name: str | None) -> str | None:
    if not namespace or not kind or not name:
        return None
    return f"{namespace}/{kind}/{name}"
