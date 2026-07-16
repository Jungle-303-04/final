from __future__ import annotations

import math
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

from config import (
    KUBERNETES_API_TIMEOUT_SECONDS,
    KUBERNETES_EVENT_CAPTURE_FRESHNESS_SECONDS,
    KUBERNETES_EVENT_CAPTURE_MAX_ITEMS,
    KUBERNETES_EVENT_CAPTURE_MAX_PAGES,
    KUBERNETES_EVENT_CAPTURE_PAGE_SIZE,
    TARGET_CLUSTER_ID_ENV,
)
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.kubernetes_discovery import (
    MAX_API_DISCOVERY_DOCUMENTS,
    normalize_api_resource_discovery,
)
from packages.contracts.target import TARGET_NAMESPACE
from packages.kubernetes_provider import detect_kubernetes_provider
from packages.kubernetes_quantity import cpu_millicores, memory_mebibytes
from providers.base import ConfigReader
from providers.collection_limits import (
    attach_collection_limits,
    limit_payload_list,
    limit_payload_size,
)
from providers.kubernetes_utils import (
    K8S_ENDPOINT_SLICE_SERVICE_NAME_LABEL,
    K8S_KIND_DEPLOYMENT,
    K8S_KIND_REPLICA_SET,
    K8S_RESOURCE_DEPLOYMENTS,
    K8S_RESOURCE_ENDPOINT_SLICES,
    K8S_RESOURCE_PODS,
    K8S_RESOURCE_REPLICASETS,
    K8S_RESOURCE_SERVICES,
    compact_dict,
    items,
    metadata,
    spec,
    status,
)

K8S_SNAPSHOT_ENDPOINTS_KEY = "endpoints"
K8S_SNAPSHOT_EVENTS_KEY = "events"
K8S_EVENT_CAPTURE_KEY = "event_capture"
K8S_EVENT_CAPTURE_EVENTS_KEY = "events"
K8S_SNAPSHOT_NODES_KEY = "nodes"
K8S_SNAPSHOT_WORKLOADS_KEY = "workloads"
K8S_STATEFULSETS_KEY = "statefulsets"
K8S_DAEMONSETS_KEY = "daemonsets"
K8S_JOBS_KEY = "jobs"
K8S_CRONJOBS_KEY = "cronjobs"
K8S_API_RESOURCE_DISCOVERY_KEY = "api_resource_discovery"
K8S_CRD_DISCOVERY_PATH = "/apis/apiextensions.k8s.io/v1/customresourcedefinitions"

MAX_KUBERNETES_PODS = 500
MAX_KUBERNETES_EVENTS = 200
MAX_KUBERNETES_NODES = 100
MAX_KUBERNETES_WORKLOADS = 500
MAX_KUBERNETES_SERVICES = 300
MAX_KUBERNETES_ENDPOINTS = 300
KUBERNETES_LIST_LIMITS = {
    K8S_RESOURCE_PODS: MAX_KUBERNETES_PODS,
    K8S_SNAPSHOT_EVENTS_KEY: MAX_KUBERNETES_EVENTS,
    K8S_SNAPSHOT_NODES_KEY: MAX_KUBERNETES_NODES,
    K8S_SNAPSHOT_WORKLOADS_KEY: MAX_KUBERNETES_WORKLOADS,
    K8S_RESOURCE_SERVICES: MAX_KUBERNETES_SERVICES,
    K8S_SNAPSHOT_ENDPOINTS_KEY: MAX_KUBERNETES_ENDPOINTS,
}
KUBERNETES_NAMESPACED_LIST_KEYS = {
    K8S_RESOURCE_PODS,
    K8S_SNAPSHOT_EVENTS_KEY,
    K8S_SNAPSHOT_WORKLOADS_KEY,
    K8S_RESOURCE_SERVICES,
    K8S_SNAPSHOT_ENDPOINTS_KEY,
}

EVENT_CAPTURE_REASON_COMPLETE = "complete"
EVENT_CAPTURE_REASON_ITEM_LIMIT = "item_limit_exceeded"
EVENT_CAPTURE_REASON_PAGE_LIMIT = "page_limit_exceeded"
EVENT_CAPTURE_REASON_INVALID_RESPONSE = "invalid_response"
EVENT_CAPTURE_REASON_INVALID_EVENT = "invalid_event_contract"
EVENT_CAPTURE_REASON_NETWORK = "network_error"
EVENT_CAPTURE_REASON_NOT_CONFIGURED = "not_configured"
EVENT_CAPTURE_REASON_NOT_REQUESTED = "not_requested"
EVENT_CAPTURE_REASON_RBAC_DENIED = "rbac_denied"
EVENT_CAPTURE_REASON_TIMEOUT = "timeout"

EVENT_REASON_BACK_OFF = "BackOff"
EVENT_REASON_FAILED = "Failed"
EVENT_REASON_FAILED_MOUNT = "FailedMount"
EVENT_REASON_FAILED_SCHEDULING = "FailedScheduling"
EVENT_REASON_OOM_KILLING = "OOMKilling"
EVENT_REASON_UNHEALTHY = "Unhealthy"

EVENT_CATEGORY_BACKOFF = "backoff"
EVENT_CATEGORY_CONFIG_MOUNT = "config_or_volume_mount"
EVENT_CATEGORY_CONTAINER_RESTART = "container_restart"
EVENT_CATEGORY_IMAGE_PULL = "image_pull"
EVENT_CATEGORY_OOM = "oom_killed"
EVENT_CATEGORY_PROBE = "probe"
EVENT_CATEGORY_SCHEDULING = "scheduling"

EVENT_SIGNAL_ERR_IMAGE_PULL = "ErrImagePull"
EVENT_SIGNAL_FAILED_SCHEDULING = EVENT_REASON_FAILED_SCHEDULING
EVENT_SIGNAL_IMAGE_PULL_BACKOFF = "ImagePullBackOff"
EVENT_SIGNAL_OOM_KILLED = "OOMKilled"

EVENT_SYMPTOM_CRASH_LOOP = "CrashLoopBackOff"
EVENT_SYMPTOM_FAILED_MOUNT = EVENT_REASON_FAILED_MOUNT
EVENT_SYMPTOM_FAILED_SCHEDULING = EVENT_REASON_FAILED_SCHEDULING
EVENT_SYMPTOM_IMAGE_PULL = EVENT_SIGNAL_IMAGE_PULL_BACKOFF
EVENT_SYMPTOM_PROBE_FAILURE = "ProbeFailure"

PROBE_SIGNAL_DEFAULT = "ProbeFailed"
PROBE_SIGNAL_LIVENESS = "LivenessProbeFailed"
PROBE_SIGNAL_READINESS = "ReadinessProbeFailed"
PROBE_SIGNAL_STARTUP = "StartupProbeFailed"

SCHEDULING_CAUSE_PATTERNS = (
    ("insufficient_cpu", ("insufficient cpu",)),
    ("insufficient_memory", ("insufficient memory",)),
    ("node_selector_mismatch", ("node affinity/selector", "node selector")),
    ("taint_toleration_mismatch", ("taint", "toleration")),
    ("pod_count_limit", ("too many pods",)),
    ("volume_node_affinity_conflict", ("volume node affinity conflict",)),
)


@telemetry.source(
    source="kubernetes",
    evidence_key="kubernetes",
    query_type=KubernetesSnapshotQuery,
)
class KubernetesSnapshotProvider:
    """Collect Kubernetes state for one target cluster.
    It builds the kubernetes evidence bucket.
    """

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
        """Store the cluster id and an optional HTTP transport for tests."""
        self.cluster_id = cluster_id
        self.transport = transport

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> KubernetesSnapshotProvider:
        """Create the provider from agent config values."""
        return cls(cluster_id=read_config(TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID))

    async def query(
        self,
        _client: httpx.AsyncClient,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        """Read Kubernetes objects from the target namespace.
        Return the raw API results in one payload.
        """
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        if telemetry_query.is_cluster_api_discovery:
            async with kubernetes_client(self.transport) as client:
                return await self.query_cluster_api_discovery(
                    base_url=base_url,
                    token=token,
                    client=client,
                )
        if telemetry_query.is_cluster_wide_event_capture:
            async with kubernetes_client(self.transport) as client:
                return await self.query_cluster_wide_event_capture(
                    base_url=base_url,
                    token=token,
                    client=client,
                )
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
                K8S_RESOURCE_PODS: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/{K8S_RESOURCE_PODS}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_SNAPSHOT_EVENTS_KEY: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/events",
                ),
                K8S_SNAPSHOT_NODES_KEY: await self.get_json(
                    client, base_url, headers, "/api/v1/nodes"
                ),
                "pod_metrics": await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/metrics.k8s.io/v1beta1/namespaces/{namespace}/{K8S_RESOURCE_PODS}",
                    allow_not_found=True,
                ),
                "node_metrics": await self.get_json(
                    client,
                    base_url,
                    headers,
                    "/apis/metrics.k8s.io/v1beta1/nodes",
                    allow_not_found=True,
                ),
                K8S_RESOURCE_DEPLOYMENTS: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/{K8S_RESOURCE_DEPLOYMENTS}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_STATEFULSETS_KEY: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/{K8S_STATEFULSETS_KEY}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_DAEMONSETS_KEY: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/{K8S_DAEMONSETS_KEY}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_RESOURCE_REPLICASETS: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/apps/v1/namespaces/{namespace}/{K8S_RESOURCE_REPLICASETS}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_JOBS_KEY: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/batch/v1/namespaces/{namespace}/{K8S_JOBS_KEY}",
                    allow_not_found=True,
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_CRONJOBS_KEY: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/batch/v1/namespaces/{namespace}/{K8S_CRONJOBS_KEY}",
                    allow_not_found=True,
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_RESOURCE_SERVICES: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/api/v1/namespaces/{namespace}/{K8S_RESOURCE_SERVICES}",
                    label_selector=telemetry_query.label_selector,
                ),
                K8S_RESOURCE_ENDPOINT_SLICES: await self.get_json(
                    client,
                    base_url,
                    headers,
                    f"/apis/discovery.k8s.io/v1/namespaces/{namespace}/{K8S_RESOURCE_ENDPOINT_SLICES}",
                    allow_not_found=True,
                ),
            }

    async def query_cluster_api_discovery(
        self,
        *,
        base_url: str | None,
        token: str | None,
        client: httpx.AsyncClient,
    ) -> JsonObject:
        """Collect the authorized API catalog while preserving partial RBAC evidence."""
        collected_at = datetime.now(UTC).isoformat()
        if not base_url or not token:
            return {
                "status": "unavailable",
                "cluster_id": self.cluster_id,
                "collected_at": collected_at,
                "documents": [],
                "custom_resource_definitions": None,
                "reason_codes": ["kubernetes_api_not_configured"],
                "truncated": False,
            }

        headers = kubernetes_headers(token)
        documents: list[JsonObject] = []
        reason_codes: list[str] = []
        core_versions = await self._discovery_versions(
            client=client,
            base_url=base_url,
            headers=headers,
            path="/api",
            collection_key="versions",
            failure_reason="core_versions_failed",
            reason_codes=reason_codes,
        )
        for group_version in core_versions[:MAX_API_DISCOVERY_DOCUMENTS]:
            document = await self._discovery_document(
                client=client,
                base_url=base_url,
                headers=headers,
                path=f"/api/{group_version}",
            )
            if document is None:
                reason_codes.append(f"group_version_failed:{group_version}")
                continue
            documents.append(document)
        group_versions = await self._discovery_group_versions(
            client=client,
            base_url=base_url,
            headers=headers,
            reason_codes=reason_codes,
        )
        version_count = len(core_versions) + len(group_versions)
        truncated = version_count > MAX_API_DISCOVERY_DOCUMENTS
        remaining = max(MAX_API_DISCOVERY_DOCUMENTS - len(core_versions), 0)
        for group_version in group_versions[:remaining]:
            document = await self._discovery_document(
                client=client,
                base_url=base_url,
                headers=headers,
                path=f"/apis/{group_version}",
            )
            if document is None:
                reason_codes.append(f"group_version_failed:{group_version}")
                continue
            documents.append(document)

        custom_resource_definitions = await self._custom_resource_definitions(
            client=client,
            base_url=base_url,
            headers=headers,
            reason_codes=reason_codes,
        )
        return {
            "status": "success" if not reason_codes and not truncated else "partial",
            "cluster_id": self.cluster_id,
            "collected_at": collected_at,
            "documents": documents,
            "custom_resource_definitions": custom_resource_definitions,
            "reason_codes": sorted(set(reason_codes)),
            "truncated": truncated,
        }

    async def _discovery_versions(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        path: str,
        collection_key: str,
        failure_reason: str,
        reason_codes: list[str],
    ) -> list[str]:
        try:
            response = await client.get(f"{base_url}{path}", headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            reason_codes.append(failure_reason)
            return []
        values = payload.get(collection_key) if isinstance(payload, dict) else None
        if not isinstance(values, list):
            reason_codes.append(f"{failure_reason}:invalid")
            return []
        return sorted(
            {value.strip() for value in values if isinstance(value, str) and value.strip()}
        )

    async def _discovery_group_versions(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        reason_codes: list[str],
    ) -> list[str]:
        try:
            response = await client.get(f"{base_url}/apis", headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            reason_codes.append("api_groups_failed")
            return []
        groups = payload.get("groups") if isinstance(payload, dict) else None
        if not isinstance(groups, list):
            reason_codes.append("api_groups_invalid")
            return []
        versions: set[str] = set()
        for group in groups:
            if not isinstance(group, dict):
                continue
            raw_versions = group.get("versions")
            if not isinstance(raw_versions, list):
                continue
            versions.update(
                str(version.get("groupVersion")).strip()
                for version in raw_versions
                if isinstance(version, dict) and str(version.get("groupVersion") or "").strip()
            )
        return sorted(versions)

    async def _discovery_document(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        path: str,
    ) -> JsonObject | None:
        try:
            response = await client.get(f"{base_url}{path}", headers=headers)
            response.raise_for_status()
            payload = response.json()
        except (httpx.HTTPError, ValueError):
            return None
        return payload if isinstance(payload, dict) else None

    async def _custom_resource_definitions(
        self,
        *,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        reason_codes: list[str],
    ) -> list[JsonObject] | None:
        try:
            response = await client.get(f"{base_url}{K8S_CRD_DISCOVERY_PATH}", headers=headers)
        except httpx.HTTPError:
            reason_codes.append("crd_discovery_failed")
            return None
        if response.status_code in {401, 403}:
            reason_codes.append("crd_discovery_forbidden")
            return None
        if response.is_error:
            reason_codes.append(f"crd_discovery_http_{response.status_code}")
            return None
        try:
            payload = response.json()
        except ValueError:
            reason_codes.append("crd_discovery_invalid")
            return None
        return items(payload)

    async def query_cluster_wide_event_capture(
        self,
        *,
        base_url: str,
        token: str,
        client: httpx.AsyncClient,
    ) -> JsonObject:
        """List every Event through continuation tokens and return explicit coverage proof.

        This path is deliberately isolated from normal namespace snapshots. It returns
        only narrow Timeline facts and never raises a collection error into the generic
        evidence loop: a denied, timed-out, or bounded list must become visible gap
        evidence while remaining unsafe for Timeline append.
        """
        collected_at = datetime.now(UTC).isoformat()
        if not base_url or not token:
            return event_capture_query_result(
                cluster_id=self.cluster_id,
                collected_at=collected_at,
                capture=event_capture_failure(EVENT_CAPTURE_REASON_NOT_CONFIGURED),
            )

        headers = kubernetes_headers(token)
        continuation: str | None = None
        page_count = 0
        resource_version: str | None = None
        facts: dict[str, JsonObject] = {}
        while True:
            if page_count >= KUBERNETES_EVENT_CAPTURE_MAX_PAGES:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_PAGE_LIMIT,
                        truncated=True,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            params: dict[str, str | int] = {"limit": KUBERNETES_EVENT_CAPTURE_PAGE_SIZE}
            if continuation:
                params["continue"] = continuation
            try:
                response = await client.get(
                    f"{base_url}/api/v1/events",
                    headers=headers,
                    params=params,
                )
            except httpx.TimeoutException:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_TIMEOUT,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            except httpx.NetworkError:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_NETWORK,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            if response.status_code in {401, 403}:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_RBAC_DENIED,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            if response.is_error:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        f"http_{response.status_code}",
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            try:
                page = response.json()
            except ValueError:
                page = None
            if not isinstance(page, dict):
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_INVALID_RESPONSE,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            page_items = items(page)
            if len(facts) + len(page_items) > KUBERNETES_EVENT_CAPTURE_MAX_ITEMS:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_failure(
                        EVENT_CAPTURE_REASON_ITEM_LIMIT,
                        truncated=True,
                        page_count=page_count,
                        event_count=len(facts),
                        resource_version=resource_version,
                    ),
                )
            page_metadata = metadata(page)
            current_resource_version = as_text(page_metadata.get("resourceVersion"))
            if current_resource_version:
                resource_version = current_resource_version
            for item in page_items:
                fact = event_timeline_fact(item)
                if fact is None:
                    return event_capture_query_result(
                        cluster_id=self.cluster_id,
                        collected_at=collected_at,
                        capture=event_capture_failure(
                            EVENT_CAPTURE_REASON_INVALID_EVENT,
                            page_count=page_count,
                            event_count=len(facts),
                            resource_version=resource_version,
                        ),
                    )
                facts[str(fact["uid"])] = fact
            page_count += 1
            next_continuation = page_metadata.get("continue")
            continuation = str(next_continuation) if next_continuation else None
            if continuation is None:
                return event_capture_query_result(
                    cluster_id=self.cluster_id,
                    collected_at=collected_at,
                    capture=event_capture_complete(
                        facts=tuple(facts[uid] for uid in sorted(facts)),
                        page_count=page_count,
                        resource_version=resource_version,
                    ),
                )

    async def get_json(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        path: str,
        *,
        allow_not_found: bool = False,
        label_selector: str | None = None,
    ) -> JsonObject:
        """Call one Kubernetes API path and return a JSON object."""
        response = await client.get(
            f"{base_url}{path}",
            headers=headers,
            params={"labelSelector": label_selector} if label_selector else None,
        )
        if allow_not_found and response.status_code in {403, 404}:
            return {"items": []}
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, dict) else {"items": []}

    def empty_results(self) -> JsonObject:
        """Create an empty Kubernetes evidence bucket for this cluster."""
        return empty_snapshot(self.cluster_id)

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one query payload and merge it into the bucket."""
        normalized = self.normalize_payload(payload, telemetry_query)
        merge_snapshot(results, normalized)

    def build_response(self, results: JsonObject) -> JsonObject:
        """Return the finished Kubernetes evidence bucket."""
        return limit_kubernetes_snapshot(results)

    def normalize_payload(
        self,
        payload: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        """Turn raw Kubernetes API lists into small evidence summaries."""
        if telemetry_query.is_cluster_api_discovery:
            return self.normalize_cluster_api_discovery(payload, telemetry_query)
        if telemetry_query.is_cluster_wide_event_capture:
            return self.normalize_cluster_wide_event_capture(payload, telemetry_query)
        snapshot = empty_snapshot(self.cluster_id)
        status = str(payload.get("status") or "success")
        namespace = str(payload.get("namespace") or telemetry_query.namespace or TARGET_NAMESPACE)
        snapshot["cluster"] = {
            "cluster_id": str(payload.get("cluster_id") or self.cluster_id),
            "namespace": namespace,
            "collected_at": str(payload.get("collected_at") or datetime.now(UTC).isoformat()),
        }
        snapshot["collection_scopes"] = [
            {
                "namespace": namespace,
                "label_selector": telemetry_query.label_selector,
            }
        ]
        pod_metrics = pod_metrics_by_key(items(payload.get("pod_metrics")))
        node_metrics = node_metrics_by_name(items(payload.get("node_metrics")))
        raw_nodes = items(payload.get(K8S_SNAPSHOT_NODES_KEY))
        detected_provider = detect_kubernetes_provider(raw_nodes)
        if detected_provider is not None:
            snapshot["detected_provider"] = detected_provider
        raw_pods = scoped_items(payload.get(K8S_RESOURCE_PODS), telemetry_query.label_selector)
        raw_workloads = {
            K8S_KIND_DEPLOYMENT: scoped_items(
                payload.get(K8S_RESOURCE_DEPLOYMENTS), telemetry_query.label_selector
            ),
            "StatefulSet": scoped_items(
                payload.get(K8S_STATEFULSETS_KEY), telemetry_query.label_selector
            ),
            "DaemonSet": scoped_items(
                payload.get(K8S_DAEMONSETS_KEY), telemetry_query.label_selector
            ),
            K8S_KIND_REPLICA_SET: active_replicasets(
                scoped_items(payload.get(K8S_RESOURCE_REPLICASETS), telemetry_query.label_selector)
            ),
            "Job": scoped_items(payload.get(K8S_JOBS_KEY), telemetry_query.label_selector),
            "CronJob": scoped_items(payload.get(K8S_CRONJOBS_KEY), telemetry_query.label_selector),
        }
        raw_services = scoped_items(
            payload.get(K8S_RESOURCE_SERVICES), telemetry_query.label_selector
        )
        selected_names = {
            str(metadata(item).get("name") or "")
            for item in [*raw_pods, *(row for rows in raw_workloads.values() for row in rows)]
            if metadata(item).get("name")
        }
        selected_uids = {
            str(metadata(item).get("uid") or "")
            for item in [*raw_pods, *(row for rows in raw_workloads.values() for row in rows)]
            if metadata(item).get("uid")
        }
        snapshot[K8S_RESOURCE_PODS] = [
            pod_summary(
                item,
                pod_metrics.get(
                    (
                        str(metadata(item).get("namespace") or namespace),
                        str(metadata(item).get("name") or ""),
                    )
                ),
            )
            for item in raw_pods
        ]
        snapshot[K8S_SNAPSHOT_EVENTS_KEY] = [
            event_summary(item)
            for item in scoped_events(
                items(payload.get(K8S_SNAPSHOT_EVENTS_KEY)),
                selected_names,
                selected_uids,
                telemetry_query.label_selector,
            )
        ]
        snapshot[K8S_SNAPSHOT_NODES_KEY] = [
            node_summary(item, node_metrics.get(str(metadata(item).get("name") or "")))
            for item in raw_nodes
        ]
        snapshot[K8S_SNAPSHOT_WORKLOADS_KEY] = [
            *(
                summary
                for kind, rows in raw_workloads.items()
                for summary in workload_summaries(kind, rows)
            ),
        ]
        snapshot[K8S_RESOURCE_SERVICES] = [service_summary(item) for item in raw_services]
        service_names = {str(metadata(item).get("name") or "") for item in raw_services}
        snapshot[K8S_SNAPSHOT_ENDPOINTS_KEY] = [
            endpoint_slice_summary(item)
            for item in scoped_endpoint_slices(
                items(payload.get(K8S_RESOURCE_ENDPOINT_SLICES)),
                service_names,
                telemetry_query.label_selector,
            )
        ]
        snapshot["provider_status"] = {
            telemetry_query.query_name: {
                "status": status,
                "namespace": namespace,
                "reason": payload.get("reason", ""),
                "counts": {
                    K8S_RESOURCE_PODS: len(snapshot[K8S_RESOURCE_PODS]),
                    K8S_SNAPSHOT_EVENTS_KEY: len(snapshot[K8S_SNAPSHOT_EVENTS_KEY]),
                    K8S_SNAPSHOT_NODES_KEY: len(snapshot[K8S_SNAPSHOT_NODES_KEY]),
                    "pod_metrics": len(pod_metrics),
                    "node_metrics": len(node_metrics),
                    K8S_SNAPSHOT_WORKLOADS_KEY: len(snapshot[K8S_SNAPSHOT_WORKLOADS_KEY]),
                    K8S_RESOURCE_SERVICES: len(snapshot[K8S_RESOURCE_SERVICES]),
                    K8S_SNAPSHOT_ENDPOINTS_KEY: len(snapshot[K8S_SNAPSHOT_ENDPOINTS_KEY]),
                },
            }
        }
        return snapshot

    def normalize_cluster_api_discovery(
        self,
        payload: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        """Normalize dynamic resources into a bounded, reusable cluster catalog."""
        snapshot = empty_snapshot(self.cluster_id)
        collected_at = str(payload.get("collected_at") or datetime.now(UTC).isoformat())
        documents = payload.get("documents")
        definitions = payload.get("custom_resource_definitions")
        observation = normalize_api_resource_discovery(
            documents=documents if isinstance(documents, list) else [],
            custom_resource_definitions=definitions if isinstance(definitions, list) else None,
            observed_at=collected_at,
            reason_codes=(
                payload.get("reason_codes") if isinstance(payload.get("reason_codes"), list) else ()
            ),
            truncated=payload.get("truncated") is True,
        ).model_dump(mode="json")
        snapshot["cluster"] = {
            "cluster_id": str(payload.get("cluster_id") or self.cluster_id),
            "collected_at": collected_at,
        }
        snapshot[K8S_API_RESOURCE_DISCOVERY_KEY] = observation
        snapshot["provider_status"] = {
            telemetry_query.query_name: {
                "status": str(payload.get("status") or observation["completeness"]),
                "reason_codes": observation["reason_codes"],
                "resource_count": len(observation["resources"]),
            }
        }
        return snapshot

    def normalize_cluster_wide_event_capture(
        self,
        payload: JsonObject,
        telemetry_query: KubernetesSnapshotQuery,
    ) -> JsonObject:
        """Keep all-namespace Event coverage separate from user-scoped inventory lists."""
        snapshot = empty_snapshot(self.cluster_id)
        collected_at = str(payload.get("collected_at") or datetime.now(UTC).isoformat())
        capture = event_capture_from_payload(payload.get(K8S_EVENT_CAPTURE_KEY))
        snapshot["cluster"] = {
            "cluster_id": str(payload.get("cluster_id") or self.cluster_id),
            "collected_at": collected_at,
        }
        snapshot[K8S_EVENT_CAPTURE_KEY] = capture
        snapshot["provider_status"] = {
            telemetry_query.query_name: {
                "status": str(payload.get("status") or "success"),
                "reason": capture["reason"],
                "event_capture": capture["coverage"],
            }
        }
        return snapshot


def empty_snapshot(cluster_id: str) -> JsonObject:
    """Build the empty shape used by Kubernetes evidence."""
    return {
        "cluster": {"cluster_id": cluster_id},
        "collection_scopes": [],
        K8S_SNAPSHOT_WORKLOADS_KEY: [],
        K8S_RESOURCE_PODS: [],
        K8S_SNAPSHOT_EVENTS_KEY: [],
        K8S_SNAPSHOT_NODES_KEY: [],
        K8S_RESOURCE_SERVICES: [],
        K8S_SNAPSHOT_ENDPOINTS_KEY: [],
        # A missing global collector is an explicit coverage gap, not an empty
        # all-namespace Event list. Timeline must therefore fail closed.
        K8S_EVENT_CAPTURE_KEY: event_capture_failure(EVENT_CAPTURE_REASON_NOT_REQUESTED),
        "provider_status": {},
    }


def merge_snapshot(target: JsonObject, source: JsonObject) -> None:
    """Add one normalized snapshot into another snapshot."""
    target["cluster"] = {**dict(target.get("cluster", {})), **dict(source.get("cluster", {}))}
    target.setdefault("collection_scopes", [])
    target["collection_scopes"].extend(source.get("collection_scopes", []))
    if "detected_provider" not in target and source.get("detected_provider"):
        target["detected_provider"] = source["detected_provider"]
    if isinstance(source.get(K8S_API_RESOURCE_DISCOVERY_KEY), dict):
        target[K8S_API_RESOURCE_DISCOVERY_KEY] = dict(source[K8S_API_RESOURCE_DISCOVERY_KEY])
    source_event_capture = source.get(K8S_EVENT_CAPTURE_KEY)
    if isinstance(source_event_capture, dict) and source_event_capture.get("reason") != (
        EVENT_CAPTURE_REASON_NOT_REQUESTED
    ):
        target[K8S_EVENT_CAPTURE_KEY] = dict(source_event_capture)
    for key in (
        K8S_SNAPSHOT_WORKLOADS_KEY,
        K8S_RESOURCE_PODS,
        K8S_SNAPSHOT_EVENTS_KEY,
        K8S_RESOURCE_SERVICES,
        K8S_SNAPSHOT_ENDPOINTS_KEY,
    ):
        target.setdefault(key, [])
        target[key].extend(source.get(key, []))
    merge_cluster_scoped_nodes(target, source)
    target.setdefault("provider_status", {})
    target["provider_status"].update(source.get("provider_status", {}))


def event_capture_query_result(
    *,
    cluster_id: str,
    collected_at: str,
    capture: JsonObject,
) -> JsonObject:
    """Build the isolated raw result for the all-namespace Event collector."""
    normalized_capture = dict(capture)
    freshness = dict(normalized_capture.get("freshness") or {})
    freshness["observed_at"] = collected_at
    normalized_capture["freshness"] = freshness
    return {
        "status": "success" if normalized_capture.get("complete") is True else "partial",
        "cluster_id": cluster_id,
        "collected_at": collected_at,
        K8S_EVENT_CAPTURE_KEY: normalized_capture,
    }


def event_capture_complete(
    *,
    facts: tuple[JsonObject, ...],
    page_count: int,
    resource_version: str | None,
) -> JsonObject:
    """Return the only capture shape Timeline is permitted to consume."""
    coverage: JsonObject = {
        "scope": "all_namespaces",
        "pagination": "continue",
        "page_count": page_count,
        "event_count": len(facts),
    }
    if resource_version:
        coverage["resource_version"] = resource_version
    return {
        "complete": True,
        "truncated": False,
        "reason": EVENT_CAPTURE_REASON_COMPLETE,
        "freshness": event_capture_freshness(),
        "coverage": coverage,
        K8S_EVENT_CAPTURE_EVENTS_KEY: list(facts),
    }


def event_capture_failure(
    reason: str,
    *,
    truncated: bool = False,
    page_count: int = 0,
    event_count: int = 0,
    resource_version: str | None = None,
) -> JsonObject:
    """Return safe coverage/gap evidence without a partial fact list."""
    coverage: JsonObject = {
        "scope": "all_namespaces",
        "pagination": "continue",
        "page_count": page_count,
        "event_count": event_count,
        "gap": reason,
    }
    if resource_version:
        coverage["resource_version"] = resource_version
    return {
        "complete": False,
        "truncated": truncated,
        "reason": reason,
        "freshness": event_capture_freshness(),
        "coverage": coverage,
        K8S_EVENT_CAPTURE_EVENTS_KEY: [],
    }


def event_capture_freshness() -> JsonObject:
    """State the maximum safe age explicitly instead of assuming a polling cadence."""
    return {
        "observed_at": datetime.now(UTC).isoformat(),
        "max_age_seconds": KUBERNETES_EVENT_CAPTURE_FRESHNESS_SECONDS,
    }


def event_capture_from_payload(value: object) -> JsonObject:
    """Copy only the declared capture fields when creating evidence output."""
    if not isinstance(value, dict):
        return event_capture_failure(EVENT_CAPTURE_REASON_INVALID_RESPONSE)
    capture = dict(value)
    facts = capture.get(K8S_EVENT_CAPTURE_EVENTS_KEY)
    capture[K8S_EVENT_CAPTURE_EVENTS_KEY] = list(facts) if isinstance(facts, list) else []
    return capture


def event_timeline_fact(item: JsonObject) -> JsonObject | None:
    """Reduce one Kubernetes Event to the safe UID/count/occurrence fact contract."""
    event_metadata = metadata(item)
    uid = as_text(event_metadata.get("uid"))
    name = as_text(event_metadata.get("name"))
    namespace = as_text(event_metadata.get("namespace"))
    series = item.get("series")
    series_body = series if isinstance(series, dict) else {}
    last_occurrence_at = (
        as_text(series_body.get("lastObservedTime"))
        or as_text(item.get("lastTimestamp"))
        or as_text(item.get("eventTime"))
        or as_text(event_metadata.get("creationTimestamp"))
    )
    if not uid or not name or not last_occurrence_at:
        return None
    return compact_dict(
        {
            "uid": uid,
            "api_version": as_text(item.get("apiVersion")) or "v1",
            "namespace": namespace,
            "name": name,
            "resource_version": as_text(event_metadata.get("resourceVersion")),
            "type": as_text(item.get("type")),
            "count": event_occurrence_count(series_body.get("count") or item.get("count")),
            "last_occurrence_at": last_occurrence_at,
        }
    )


def event_occurrence_count(value: object) -> int:
    """Use the Kubernetes Event's count when valid, otherwise its first occurrence."""
    if isinstance(value, bool):
        return 1
    try:
        count = int(value) if value is not None else 1
    except (TypeError, ValueError):
        return 1
    return count if count >= 1 else 1


def merge_cluster_scoped_nodes(target: JsonObject, source: JsonObject) -> None:
    # namespace별 snapshot이 같은 /api/v1/nodes 결과를 반복 수집하므로 node는 cluster scope로 병합한다.
    by_key: dict[str, JsonObject] = {}
    for node in [
        *target.get(K8S_SNAPSHOT_NODES_KEY, []),
        *source.get(K8S_SNAPSHOT_NODES_KEY, []),
    ]:
        if not isinstance(node, dict):
            continue
        key = str(node.get("uid") or node.get("name") or "")
        if not key:
            continue
        by_key[key] = node
    target[K8S_SNAPSHOT_NODES_KEY] = list(by_key.values())


def limit_kubernetes_snapshot(snapshot: JsonObject) -> JsonObject:
    """Limit large Kubernetes lists before the result is sent."""
    limits: JsonObject = {}
    for key, max_items in KUBERNETES_LIST_LIMITS.items():
        group_key = namespace_group_key if key in KUBERNETES_NAMESPACED_LIST_KEYS else None
        limit_payload_list(snapshot, key, max_items, limits, group_key=group_key)
    limit_payload_size(
        snapshot,
        list_keys=KUBERNETES_LIST_LIMITS,
        limits=limits,
        group_keys={key: namespace_group_key for key in KUBERNETES_NAMESPACED_LIST_KEYS},
    )
    attach_collection_limits(snapshot, limits)
    return snapshot


def namespace_group_key(item: object) -> str:
    """Return a namespace key so truncation keeps groups represented."""
    if isinstance(item, dict):
        namespace = item.get("namespace")
        if namespace not in (None, ""):
            return str(namespace)
    return "<cluster>"


RCA_TEST_LABEL = "kubeheal.io/rca-test"
RCA_TEST_RUN_LABEL = "kubeheal.io/rca-test-run"
RCA_TEST_RESOURCE_PREFIX = "rca-test-"
EVIDENCE_IDENTITY_LABELS = (
    RCA_TEST_RUN_LABEL,
    RCA_TEST_LABEL,
    "node.kubernetes.io/instance-type",
    "beta.kubernetes.io/instance-type",
    "topology.kubernetes.io/zone",
    "failure-domain.beta.kubernetes.io/zone",
    "karpenter.sh/capacity-type",
)
LIVE_SCOPED_EVENT_KINDS = frozenset({"Pod", K8S_KIND_REPLICA_SET})


def scoped_items(payload: Any, label_selector: str | None) -> list[JsonObject]:
    rows = items(payload)
    if label_selector:
        key, separator, value = label_selector.partition("=")
        if not separator:
            return []
        return [row for row in rows if resource_labels(row).get(key) == value]
    return [
        row
        for row in rows
        if resource_labels(row).get(RCA_TEST_LABEL) != "true"
        and RCA_TEST_RUN_LABEL not in resource_labels(row)
    ]


def active_replicasets(rows: list[JsonObject]) -> list[JsonObject]:
    """일반 snapshot에서는 현재 replica가 남은 ReplicaSet만 반환한다."""
    active: list[JsonObject] = []
    for row in rows:
        desired = spec(row).get("replicas")
        replica_status = status(row)
        observed = (
            replica_status.get("replicas"),
            replica_status.get("readyReplicas"),
            replica_status.get("availableReplicas"),
        )
        if desired is None or any(has_positive_replica_count(value) for value in observed):
            active.append(row)
            continue
        if has_positive_replica_count(desired):
            active.append(row)
    return active


def has_positive_replica_count(value: object) -> bool:
    count = as_float(value)
    return count is not None and count > 0


def scoped_events(
    rows: list[JsonObject],
    selected_names: set[str],
    selected_uids: set[str],
    label_selector: str | None,
) -> list[JsonObject]:
    scoped: list[JsonObject] = []
    for row in rows:
        involved = row.get("involvedObject")
        involved_body = involved if isinstance(involved, dict) else {}
        kind = str(involved_body.get("kind") or "")
        name = str(involved_body.get("name") or "")
        uid = str(involved_body.get("uid") or "")
        matches_current_resource = name in selected_names or (uid and uid in selected_uids)
        if label_selector:
            if matches_current_resource:
                scoped.append(row)
        elif not name.startswith(RCA_TEST_RESOURCE_PREFIX) and (
            kind not in LIVE_SCOPED_EVENT_KINDS or matches_current_resource
        ):
            scoped.append(row)
    return scoped


def scoped_endpoint_slices(
    rows: list[JsonObject],
    service_names: set[str],
    label_selector: str | None,
) -> list[JsonObject]:
    if label_selector:
        return [
            row
            for row in rows
            if str(resource_labels(row).get(K8S_ENDPOINT_SLICE_SERVICE_NAME_LABEL) or "")
            in service_names
            or any(
                str(metadata(row).get("name") or "").startswith(f"{service_name}-")
                for service_name in service_names
            )
        ]
    return [
        row
        for row in rows
        if not str(metadata(row).get("name") or "").startswith(RCA_TEST_RESOURCE_PREFIX)
    ]


def resource_labels(item: JsonObject) -> JsonObject:
    """Return all labels for filtering; output compaction belongs to safe_labels()."""
    labels = metadata(item).get("labels", {})
    return labels if isinstance(labels, dict) else {}


def safe_labels(item: JsonObject, limit: int = 12) -> JsonObject:
    """Copy bounded labels while preserving evidence identity labels first."""
    labels = metadata(item).get("labels", {})
    if not isinstance(labels, dict) or limit <= 0:
        return {}
    compact: JsonObject = {}
    for key in EVIDENCE_IDENTITY_LABELS:
        if key in labels and len(compact) < limit:
            compact[key] = str(labels[key])
    for raw_key, raw_value in labels.items():
        key = str(raw_key)
        if key in compact:
            continue
        if len(compact) >= limit:
            break
        compact[key] = str(raw_value)
    return compact


def bounded_label_summary(item: JsonObject) -> JsonObject:
    """Return bounded labels plus an honest completeness bit for downstream facets."""
    all_labels = resource_labels(item)
    labels = safe_labels(item)
    return {"labels": labels, "labels_complete": len(labels) == len(all_labels)}


def owner_ref(item: JsonObject) -> tuple[str | None, str | None]:
    """Return the first owner kind and name for a Kubernetes object."""
    refs = metadata(item).get("ownerReferences", [])
    if not isinstance(refs, list) or not refs:
        return None, None
    ref = refs[0] if isinstance(refs[0], dict) else {}
    return as_text(ref.get("kind")), as_text(ref.get("name"))


def owner_references_complete(item: JsonObject) -> bool:
    """Whether the compact first-owner representation preserved every owner reference."""
    refs = metadata(item).get("ownerReferences", [])
    return isinstance(refs, list) and len(refs) <= 1


def owner_uid(item: JsonObject) -> str | None:
    """Preserve the Kubernetes owner identity needed to survive same-name recreation."""
    refs = metadata(item).get("ownerReferences", [])
    if not isinstance(refs, list) or not refs or not isinstance(refs[0], dict):
        return None
    return as_text(refs[0].get("uid"))


def as_text(value: Any) -> str | None:
    """Turn a value into text while keeping None as None."""
    return str(value) if value is not None else None


def pod_summary(item: JsonObject, metrics: JsonObject | None = None) -> JsonObject:
    """Build a small pod summary for evidence consumers."""
    meta = metadata(item)
    pod_status = status(item)
    pod_spec = spec(item)
    owner_kind, owner_name = owner_ref(item)
    measured = dict(metrics or {})
    cpu_request_mcores, mem_request_mib = pod_request_totals(pod_spec)
    containers = [
        container_summary(container)
        for container in pod_status.get("containerStatuses", [])
        if isinstance(container, dict)
    ]
    return {
        "uid": meta.get("uid"),
        "resource_version": meta.get("resourceVersion"),
        "name": meta.get("name"),
        "namespace": meta.get("namespace"),
        "node_name": pod_spec.get("nodeName"),
        "phase": pod_status.get("phase"),
        "reason": pod_status.get("reason"),
        "message": pod_status.get("message"),
        "start_time": pod_status.get("startTime"),
        **bounded_label_summary(item),
        "owner_kind": owner_kind,
        "owner_name": owner_name,
        "owner_uid": owner_uid(item),
        "owner_references_complete": owner_references_complete(item),
        "workload_key": workload_key(meta.get("namespace"), owner_kind, owner_name),
        "pod_ip": pod_status.get("podIP"),
        "host_ip": pod_status.get("hostIP"),
        "conditions": pod_status.get("conditions", []),
        "containers": containers,
        "cpu_mcores": measured.get("cpu_mcores"),
        "mem_mib": measured.get("mem_mib"),
        "cpu_request_mcores": cpu_request_mcores,
        "mem_request_mib": mem_request_mib,
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


def pod_request_totals(pod_spec: JsonObject) -> tuple[float | None, float | None]:
    """Sum regular-container requests only when an entire resource axis is observed."""
    containers = pod_spec.get("containers")
    if not isinstance(containers, list) or not containers:
        return None, None

    cpu_total = 0.0
    memory_total = 0.0
    cpu_complete = True
    memory_complete = True
    for container in containers:
        if not isinstance(container, dict):
            cpu_complete = False
            memory_complete = False
            continue
        resources = container.get("resources")
        requests = resources.get("requests") if isinstance(resources, dict) else None
        if not isinstance(requests, dict):
            cpu_complete = False
            memory_complete = False
            continue

        cpu = parse_cpu_mcores(requests.get("cpu"))
        if _positive_finite(cpu):
            cpu_total += cpu
        else:
            cpu_complete = False

        memory = parse_memory_mib(requests.get("memory"))
        if _positive_finite(memory):
            memory_total += memory
        else:
            memory_complete = False

    return (
        cpu_total if cpu_complete else None,
        memory_total if memory_complete else None,
    )


def _positive_finite(value: float | None) -> bool:
    return value is not None and math.isfinite(value) and value > 0


def container_summary(item: JsonObject) -> JsonObject:
    """Build a small container status summary from Kubernetes status data."""
    state_name, state_payload = container_state(item, "state")
    # crashloop 파드는 현재 state 가 waiting(CrashLoopBackOff)이고 직전 크래시의
    # 종료 사유/exit code 는 lastState.terminated 에 있다 — RCA 원인 판별
    # (OOMKilled/137 vs exit 1)에 필수라 함께 요약한다.
    last_state_name, last_state_payload = container_state(item, "lastState")
    return {
        "name": item.get("name"),
        "container_id": item.get("containerID"),
        "image": item.get("image"),
        "image_id": item.get("imageID"),
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
        "last_state_message": last_state_payload.get("message"),
        "last_exit_code": last_state_payload.get("exitCode"),
        "last_started_at": last_state_payload.get("startedAt"),
        "last_finished_at": last_state_payload.get("finishedAt"),
    }


def container_state(item: JsonObject, key: str) -> tuple[str | None, JsonObject]:
    state = item.get(key, {}) if isinstance(item.get(key), dict) else {}
    state_name = next(iter(state), None)
    state_payload = (
        state.get(state_name, {}) if state_name and isinstance(state.get(state_name), dict) else {}
    )
    return state_name, state_payload if isinstance(state_payload, dict) else {}


def event_summary(item: JsonObject) -> JsonObject:
    """Build a small event summary with reason, message, and target object."""
    meta = metadata(item)
    involved = item.get("involvedObject", {})
    if not isinstance(involved, dict):
        involved = {}
    source = item.get("source", {})
    if not isinstance(source, dict):
        source = {}
    series = item.get("series", {})
    if not isinstance(series, dict):
        series = {}
    last_occurrence_at = (
        series.get("lastObservedTime") or item.get("lastTimestamp") or item.get("eventTime")
    )
    summary = {
        "uid": meta.get("uid"),
        "name": meta.get("name"),
        "namespace": meta.get("namespace"),
        "resource_version": meta.get("resourceVersion"),
        "type": item.get("type"),
        "reason": item.get("reason"),
        "message": item.get("message"),
        "count": series.get("count") or item.get("count"),
        "first_timestamp": item.get("firstTimestamp") or item.get("eventTime"),
        "last_timestamp": last_occurrence_at,
        "last_occurrence_at": last_occurrence_at,
        "reporting_component": item.get("reportingComponent") or source.get("component"),
        "involved_kind": involved.get("kind"),
        "involved_name": involved.get("name"),
        "involved_uid": involved.get("uid"),
        **bounded_label_summary(item),
    }
    reason_summary = event_reason_summary(item)
    if reason_summary:
        summary["reason_summary"] = reason_summary
    return summary


def event_reason_summary(item: JsonObject) -> JsonObject:
    """Build a small reason summary from Kubernetes Event data."""
    reason = as_text(item.get("reason")) or ""
    message = as_text(item.get("message")) or ""
    message_text = message.casefold()
    category, signal, symptom = event_reason_classification(reason, message_text)
    return compact_dict(
        {
            "category": category,
            "signal": signal,
            "symptom": symptom,
            "scheduling_causes": scheduling_causes(message_text)
            if reason == EVENT_REASON_FAILED_SCHEDULING
            else [],
        }
    )


def event_reason_classification(
    reason: str,
    message_text: str,
) -> tuple[str | None, str | None, str | None]:
    """Return a stable RCA hint for known Kubernetes Event reasons."""
    if reason == EVENT_REASON_FAILED_SCHEDULING:
        return (
            EVENT_CATEGORY_SCHEDULING,
            EVENT_SIGNAL_FAILED_SCHEDULING,
            EVENT_SYMPTOM_FAILED_SCHEDULING,
        )
    if reason == EVENT_REASON_OOM_KILLING or "oomkilled" in message_text:
        return (EVENT_CATEGORY_OOM, EVENT_SIGNAL_OOM_KILLED, EVENT_SYMPTOM_CRASH_LOOP)
    if reason == EVENT_REASON_FAILED and (
        "pull image" in message_text or "errimagepull" in message_text
    ):
        return (EVENT_CATEGORY_IMAGE_PULL, EVENT_SIGNAL_ERR_IMAGE_PULL, EVENT_SYMPTOM_IMAGE_PULL)
    if reason == EVENT_REASON_BACK_OFF and "pulling image" in message_text:
        return (
            EVENT_CATEGORY_IMAGE_PULL,
            EVENT_SIGNAL_IMAGE_PULL_BACKOFF,
            EVENT_SYMPTOM_IMAGE_PULL,
        )
    if reason == EVENT_REASON_BACK_OFF and "restarting failed container" in message_text:
        return (
            EVENT_CATEGORY_CONTAINER_RESTART,
            EVENT_SYMPTOM_CRASH_LOOP,
            EVENT_SYMPTOM_CRASH_LOOP,
        )
    if reason == EVENT_REASON_BACK_OFF:
        return (EVENT_CATEGORY_BACKOFF, EVENT_REASON_BACK_OFF, None)
    if reason == EVENT_REASON_UNHEALTHY and "probe" in message_text:
        return (EVENT_CATEGORY_PROBE, probe_signal_label(message_text), EVENT_SYMPTOM_PROBE_FAILURE)
    if reason == EVENT_REASON_FAILED_MOUNT:
        return (EVENT_CATEGORY_CONFIG_MOUNT, EVENT_REASON_FAILED_MOUNT, EVENT_SYMPTOM_FAILED_MOUNT)
    return (None, None, None)


def probe_signal_label(message_text: str) -> str:
    """Return the probe signal type from an Event message."""
    if "readiness probe" in message_text:
        return PROBE_SIGNAL_READINESS
    if "liveness probe" in message_text:
        return PROBE_SIGNAL_LIVENESS
    if "startup probe" in message_text:
        return PROBE_SIGNAL_STARTUP
    return PROBE_SIGNAL_DEFAULT


def scheduling_causes(message_text: str) -> list[str]:
    """Return stable scheduling cause labels from a FailedScheduling message."""
    causes: list[str] = []
    for cause, patterns in SCHEDULING_CAUSE_PATTERNS:
        if any(pattern in message_text for pattern in patterns):
            causes.append(cause)
    return causes


def node_summary(item: JsonObject, metrics: JsonObject | None = None) -> JsonObject:
    """Build a node summary with readiness, taints, and capacity data."""
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
    meta = metadata(item)
    return {
        "uid": meta.get("uid"),
        "resource_version": meta.get("resourceVersion"),
        "name": meta.get("name"),
        **bounded_label_summary(item),
        "ready": ready_condition.get("status") == "True",
        "conditions": conditions,
        "taints": spec(item).get("taints", []),
        "provider_id": as_text(spec(item).get("providerID")),
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
    return cpu_millicores(value)


def parse_memory_mib(value: Any) -> float | None:
    return memory_mebibytes(value)


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
    """Build workload summaries for all objects of one workload kind."""
    return [workload_summary(kind, item) for item in rows]


def workload_summary(kind: str, item: JsonObject) -> JsonObject:
    """Build a small workload summary for deployments and similar objects."""
    meta = metadata(item)
    workload_status = status(item)
    owner_kind, owner_name = owner_ref(item)
    return {
        "kind": kind,
        "api_version": "batch/v1" if kind in {"Job", "CronJob"} else "apps/v1",
        **bounded_label_summary(item),
        "uid": meta.get("uid"),
        "resource_version": meta.get("resourceVersion"),
        "namespace": meta.get("namespace"),
        "name": meta.get("name"),
        "owner_kind": owner_kind,
        "owner_name": owner_name,
        "owner_uid": owner_uid(item),
        "owner_references_complete": owner_references_complete(item),
        "generation": meta.get("generation"),
        "creation_timestamp": meta.get("creationTimestamp"),
        "observed_generation": workload_status.get("observedGeneration"),
        "desired_replicas": spec(item).get("replicas"),
        "ready_replicas": workload_status.get("readyReplicas", 0),
        "available_replicas": workload_status.get("availableReplicas", 0),
        "updated_replicas": workload_status.get("updatedReplicas", 0),
        "unavailable_replicas": workload_status.get("unavailableReplicas", 0),
        "conditions": workload_status.get("conditions", []),
        "selector": spec(item).get("selector", {}),
        "active": len(workload_status.get("active", []))
        if isinstance(workload_status.get("active"), list)
        else int(workload_status.get("active") or 0),
        "succeeded": int(workload_status.get("succeeded") or 0),
        "failed": int(workload_status.get("failed") or 0),
        "completions": int(spec(item).get("completions") or 1),
        "start_time": workload_status.get("startTime"),
        "completion_time": workload_status.get("completionTime"),
        "scheduled_run_kinds": ["Job"] if kind == "CronJob" else [],
    }


def service_summary(item: JsonObject) -> JsonObject:
    """Build a small service summary with ports and selector data."""
    service_spec = spec(item)
    service_status = status(item)
    load_balancer = service_status.get("loadBalancer", {})
    ingress = load_balancer.get("ingress", []) if isinstance(load_balancer, dict) else []
    external_hosts = [
        str(entry.get("hostname") or entry.get("ip"))
        for entry in ingress
        if isinstance(entry, dict) and (entry.get("hostname") or entry.get("ip"))
    ]
    meta = metadata(item)
    return {
        "uid": meta.get("uid"),
        "resource_version": meta.get("resourceVersion"),
        "namespace": meta.get("namespace"),
        "name": meta.get("name"),
        **bounded_label_summary(item),
        "type": service_spec.get("type"),
        "cluster_ip": service_spec.get("clusterIP"),
        "ports": service_spec.get("ports", []),
        "selector": service_spec.get("selector", {}),
        "load_balancer": {"ingress": ingress},
        "external_hosts": external_hosts,
        "external_url": f"http://{external_hosts[0]}" if external_hosts else None,
    }


def endpoint_slice_summary(item: JsonObject) -> JsonObject:
    """Build a small endpoint slice summary with endpoint and port counts."""
    endpoint_spec = item
    endpoints = endpoint_spec.get("endpoints")
    ports = endpoint_spec.get("ports")
    meta = metadata(item)
    return {
        "uid": meta.get("uid"),
        "resource_version": meta.get("resourceVersion"),
        "namespace": meta.get("namespace"),
        "name": meta.get("name"),
        **bounded_label_summary(item),
        # Relationship identity is promoted before bounded labels so collection order cannot
        # erase the authoritative EndpointSlice -> Service association.
        "service_name": resource_labels(item).get("kubernetes.io/service-name"),
        "address_type": endpoint_spec.get("addressType"),
        "endpoint_count": len(endpoints) if isinstance(endpoints, list) else 0,
        "ports": ports if isinstance(ports, list) else [],
    }


def workload_key(namespace: Any, kind: str | None, name: str | None) -> str | None:
    """Build a stable workload key when namespace, kind, and name exist."""
    if not namespace or not kind or not name:
        return None
    return f"{namespace}/{kind}/{name}"
