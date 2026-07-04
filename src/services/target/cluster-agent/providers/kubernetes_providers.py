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
        return cls(cluster_id=read_config(TARGET_CLUSTER_ID_ENV, "target-cluster-01"))

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
        if allow_not_found and response.status_code == 404:
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
        snapshot["pods"] = [pod_summary(item) for item in items(payload.get("pods"))]
        snapshot["events"] = [event_summary(item) for item in items(payload.get("events"))]
        snapshot["nodes"] = [node_summary(item) for item in items(payload.get("nodes"))]
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
    for key in ("workloads", "pods", "events", "nodes", "services", "endpoints"):
        target.setdefault(key, [])
        target[key].extend(source.get(key, []))
    target.setdefault("provider_status", {})
    target["provider_status"].update(source.get("provider_status", {}))


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


def pod_summary(item: JsonObject) -> JsonObject:
    meta = metadata(item)
    pod_status = status(item)
    pod_spec = spec(item)
    owner_kind, owner_name = owner_ref(item)
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
        "restart_total": sum(int(container.get("restart_count", 0)) for container in containers),
        "waiting_reasons": [
            container.get("state_reason")
            for container in containers
            if container.get("state") == "waiting" and container.get("state_reason")
        ],
        "terminated_reasons": [
            container.get("state_reason")
            for container in containers
            if container.get("state") == "terminated" and container.get("state_reason")
        ],
    }


def container_summary(item: JsonObject) -> JsonObject:
    state = item.get("state", {}) if isinstance(item.get("state"), dict) else {}
    state_name = next(iter(state), None)
    state_payload = (
        state.get(state_name, {}) if state_name and isinstance(state.get(state_name), dict) else {}
    )
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
    }


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


def node_summary(item: JsonObject) -> JsonObject:
    node_status = status(item)
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
        "allocatable": node_status.get("allocatable", {}),
        "node_info": node_status.get("nodeInfo", {}),
    }


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
    return {
        "namespace": metadata(item).get("namespace"),
        "name": metadata(item).get("name"),
        "type": service_spec.get("type"),
        "cluster_ip": service_spec.get("clusterIP"),
        "ports": service_spec.get("ports", []),
        "selector": service_spec.get("selector", {}),
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
