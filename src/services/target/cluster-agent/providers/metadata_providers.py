from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import quote

import httpx
from kubernetes_api import (
    kubernetes_api_base_url,
    kubernetes_client,
    kubernetes_headers,
    service_account_token,
)
from queries import MetadataSnapshotQuery
from telemetry_registry import telemetry

from config import KUBERNETES_API_TIMEOUT_SECONDS, TARGET_CLUSTER_ID_ENV
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.target import TARGET_NAMESPACE
from providers.base import ConfigReader

SAFE_ANNOTATION_PREFIXES = (
    "deployment.kubernetes.io/",
    "kubectl.kubernetes.io/",
    "ops.service/",
    "prometheus.io/",
)
BLOCKED_ANNOTATION_NAMES = {
    "kubectl.kubernetes.io/last-applied-configuration",
}
SENSITIVE_ANNOTATION_TOKENS = (
    "authorization",
    "credential",
    "password",
    "private",
    "secret",
    "token",
)
MAX_SAFE_ANNOTATIONS = 12
MAX_ANNOTATION_VALUE_LENGTH = 200


@dataclass(frozen=True)
class MetadataQueryTarget:
    """Describe the Deployment scope for one metadata query."""

    namespace: str
    deployment_name: str | None = None


@telemetry.source(
    source="metadata",
    evidence_key="metadata",
    query_type=MetadataSnapshotQuery,
    empty_payload=dict,
)
class MetadataProvider:
    """Collect change context metadata for RCA.
    It builds the metadata evidence bucket.
    """

    span_name = "metadata.collect"
    query_count_attribute = "metadata.query_count"
    result_count_attribute = "metadata.result_count"
    timeout_seconds = KUBERNETES_API_TIMEOUT_SECONDS
    failure_message = "metadata collection failed"
    queries: tuple[MetadataSnapshotQuery, ...] = ()

    def __init__(
        self,
        *,
        cluster_id: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """Store the target cluster id and an optional HTTP transport."""
        self.cluster_id = cluster_id
        self.transport = transport

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> MetadataProvider:
        """Create the provider from agent config values."""
        return cls(cluster_id=read_config(TARGET_CLUSTER_ID_ENV, Target.DEFAULT_CLUSTER_ID))

    async def query(
        self,
        _client: httpx.AsyncClient,
        telemetry_query: MetadataSnapshotQuery,
    ) -> JsonObject:
        """Read current Deployment metadata from Kubernetes."""
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        target = metadata_query_target(telemetry_query)

        if not base_url or not token:
            return {
                "cluster_id": self.cluster_id,
                "collected_at": datetime.now(UTC).isoformat(),
                "change_context": empty_change_context(),
            }

        headers = kubernetes_headers(token)

        async with kubernetes_client(self.transport) as client:
            if target.deployment_name:
                deployment = await self.get_json(
                    client,
                    base_url,
                    headers,
                    namespaced_apps_path(
                        target.namespace,
                        "deployments",
                        target.deployment_name,
                    ),
                    allow_not_found=True,
                )
                if deployment:
                    replicasets = await self.get_json(
                        client,
                        base_url,
                        headers,
                        namespaced_apps_path(target.namespace, "replicasets"),
                    )
                    pod_list = await self.get_json(
                        client,
                        base_url,
                        headers,
                        namespaced_core_path(target.namespace, "pods"),
                    )
                    service_list = await self.get_json(
                        client,
                        base_url,
                        headers,
                        namespaced_core_path(target.namespace, "services"),
                    )
                    change_context = specific_workload_change_context(
                        deployment,
                        items(replicasets),
                        items(pod_list),
                        items(service_list),
                    )
                else:
                    change_context = empty_change_context()
            else:
                deployments = await self.get_json(
                    client,
                    base_url,
                    headers,
                    namespaced_apps_path(target.namespace, "deployments"),
                )
                deployment_items = items(deployments)
                replicasets: JsonObject = {"items": []}
                snapshots: list[JsonObject] = []
                if deployment_items:
                    replicasets = await self.get_json(
                        client,
                        base_url,
                        headers,
                        namespaced_apps_path(target.namespace, "replicasets"),
                    )
                pods = await self.get_json(
                    client,
                    base_url,
                    headers,
                    namespaced_core_path(target.namespace, "pods"),
                )
                services = await self.get_json(
                    client,
                    base_url,
                    headers,
                    namespaced_core_path(target.namespace, "services"),
                )
                if deployment_items:
                    snapshots = current_workload_snapshots(
                        deployment_items,
                        items(replicasets),
                        items(pods),
                    )
                change_context = {
                    "current_workload_snapshots": snapshots,
                    "service_selector_matches": service_selector_match_snapshots(
                        items(services),
                        items(pods),
                    ),
                }

        return {
            "cluster_id": self.cluster_id,
            "collected_at": datetime.now(UTC).isoformat(),
            "change_context": change_context,
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
        """Call one Kubernetes API path and return a JSON object."""
        response = await client.get(f"{base_url}{path}", headers=headers)
        if allow_not_found and response.status_code == httpx.codes.NOT_FOUND:
            return {}
        response.raise_for_status()
        payload = response.json()

        return payload if isinstance(payload, dict) else {"items": []}

    def empty_results(self) -> JsonObject:
        """Create an empty metadata evidence bucket."""
        return {
            "change_context": empty_change_context(),
        }

    def append_result(
        self,
        results: JsonObject,
        telemetry_query: MetadataSnapshotQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one metadata result and merge it into the bucket."""
        change_context = object_or_empty(results.get("change_context"))
        merge_change_context(
            change_context,
            self.normalize_payload(payload, telemetry_query),
        )
        results["change_context"] = change_context or empty_change_context()

    def build_response(self, results: JsonObject) -> JsonObject:
        """Return the finished metadata evidence bucket."""
        return results

    def normalize_payload(
        self,
        payload: JsonObject,
        _telemetry_query: MetadataSnapshotQuery,
    ) -> JsonObject:
        """Turn raw metadata data into the change context shape."""
        change_context = payload.get("change_context", {})

        if not isinstance(change_context, dict):
            return empty_change_context()

        snapshots = change_context.get("current_workload_snapshots")
        snapshot = change_context.get("current_workload_snapshot")
        service_matches = change_context.get("service_selector_matches")
        normalized: JsonObject = {}

        if isinstance(snapshots, list):
            normalized["current_workload_snapshots"] = [
                item for item in snapshots if isinstance(item, dict)
            ]

        if isinstance(snapshot, dict) and snapshot:
            normalized["current_workload_snapshot"] = snapshot

        if isinstance(service_matches, list):
            normalized["service_selector_matches"] = [
                item for item in service_matches if isinstance(item, dict)
            ]

        return normalized or empty_change_context()


def metadata_query_target(telemetry_query: MetadataSnapshotQuery) -> MetadataQueryTarget:
    """Turn a metadata query string into a Deployment scope."""
    query = telemetry_query.query.strip()
    if not query or query in {"change_context", "current_workload_snapshots", "deployments"}:
        return MetadataQueryTarget(namespace=TARGET_NAMESPACE)

    parts = [part.strip() for part in query.split("/") if part.strip()]
    if len(parts) == 2 and parts[0].lower() in {"deployment", "deployments"}:
        return MetadataQueryTarget(namespace=TARGET_NAMESPACE, deployment_name=parts[1])
    if len(parts) == 3 and parts[0].lower() in {"deployment", "deployments"}:
        return MetadataQueryTarget(namespace=parts[1], deployment_name=parts[2])
    if len(parts) == 2:
        return MetadataQueryTarget(namespace=parts[0], deployment_name=parts[1])

    return MetadataQueryTarget(namespace=TARGET_NAMESPACE)


def namespaced_apps_path(
    namespace: str,
    resource: str,
    name: str | None = None,
) -> str:
    """Build a Kubernetes apps/v1 namespaced API path."""
    path = f"/apis/apps/v1/namespaces/{path_part(namespace)}/{path_part(resource)}"
    if name:
        path = f"{path}/{path_part(name)}"
    return path


def namespaced_core_path(
    namespace: str,
    resource: str,
    name: str | None = None,
) -> str:
    """Build a Kubernetes core/v1 namespaced API path."""
    path = f"/api/v1/namespaces/{path_part(namespace)}/{path_part(resource)}"
    if name:
        path = f"{path}/{path_part(name)}"
    return path


def path_part(value: str) -> str:
    """Escape one value for a Kubernetes API path."""
    return quote(value, safe="")


def specific_workload_change_context(
    deployment: JsonObject,
    replicasets: list[JsonObject],
    pods: list[JsonObject],
    services: list[JsonObject],
) -> JsonObject:
    """Build a change context for one Deployment."""
    if not deployment:
        return empty_change_context()
    target_pods = pods_for_deployment(deployment, replicasets, pods)
    target_labels = object_or_empty(metadata(pod_template(deployment)).get("labels"))
    return {
        "current_workload_snapshot": current_workload_detail_snapshot(
            deployment,
            replicasets,
            pods,
        ),
        "service_selector_matches": service_selector_match_snapshots(
            services,
            pods,
            target_labels=target_labels,
            target_pods=target_pods,
        ),
    }


def merge_change_context(target: JsonObject, source: JsonObject) -> None:
    """Merge one normalized change context into another."""
    snapshots = source.get("current_workload_snapshots")
    if isinstance(snapshots, list):
        target["current_workload_snapshots"] = snapshots

    snapshot = source.get("current_workload_snapshot")
    if isinstance(snapshot, dict) and snapshot:
        if target.get("current_workload_snapshots") == []:
            target.pop("current_workload_snapshots", None)
        target["current_workload_snapshot"] = snapshot

    service_matches = source.get("service_selector_matches")
    if isinstance(service_matches, list):
        target["service_selector_matches"] = service_matches


def empty_change_context() -> JsonObject:
    """Build the default change context shape."""
    return {
        "current_workload_snapshots": [],
    }


def current_workload_snapshots(
    deployments: list[JsonObject],
    replicasets: list[JsonObject],
    pods: list[JsonObject],
) -> list[JsonObject]:
    """Build small snapshots for all Deployments."""
    return [
        current_workload_summary_snapshot(deployment, replicasets, pods)
        for deployment in deployments
    ]


def current_workload_base_snapshot(
    deployment: JsonObject,
    replicasets: list[JsonObject],
    pods: list[JsonObject],
) -> JsonObject:
    """Build fields shared by summary and detail snapshots."""
    meta = metadata(deployment)
    template_meta = metadata(pod_template(deployment))
    return {
        "workload": {
            "kind": "Deployment",
            "namespace": meta.get("namespace"),
            "name": meta.get("name"),
        },
        "deployment_labels": object_or_empty(meta.get("labels")),
        "pod_template_labels": object_or_empty(template_meta.get("labels")),
        "deployment_status": deployment_status_snapshot(deployment),
        "pod_statuses": [
            pod_status_snapshot(pod)
            for pod in pods_for_deployment(deployment, replicasets, pods)
        ],
    }


def current_workload_summary_snapshot(
    deployment: JsonObject,
    replicasets: list[JsonObject],
    pods: list[JsonObject],
) -> JsonObject:
    """Build a summary snapshot for namespace-wide queries."""
    template = pod_template(deployment)
    template_spec = spec(template)

    return {
        **current_workload_base_snapshot(deployment, replicasets, pods),
        "containers": [
            container_summary_snapshot(container)
            for container in list_items(template_spec.get("containers"))
        ],
        "replicaset_revisions": [
            replicaset_revision_summary_snapshot(replicaset)
            for replicaset in sorted_replicasets_for_deployment(deployment, replicasets)
        ],
    }


def current_workload_detail_snapshot(
    deployment: JsonObject,
    replicasets: list[JsonObject],
    pods: list[JsonObject],
) -> JsonObject:
    """Build a detail snapshot for one Deployment query."""
    meta = metadata(deployment)
    template = pod_template(deployment)
    template_meta = metadata(template)
    template_spec = spec(template)
    volume_refs = volume_reference_map(template_spec)

    return {
        **current_workload_base_snapshot(deployment, replicasets, pods),
        "deployment_annotations": safe_annotations(meta),
        "pod_template_annotations": safe_annotations(template_meta),
        "managed_fields_managers": managed_field_managers(deployment),
        "containers": [
            container_detail_snapshot(container, volume_refs)
            for container in list_items(template_spec.get("containers"))
        ],
        "replicaset_revisions": [
            replicaset_revision_detail_snapshot(replicaset)
            for replicaset in sorted_replicasets_for_deployment(deployment, replicasets)
        ],
    }


def container_summary_snapshot(container: JsonObject) -> JsonObject:
    """Build a container summary for namespace-wide queries."""
    return {
        "name": container.get("name"),
        "image": container.get("image"),
        "readiness_probe": probe_snapshot(container.get("readinessProbe")),
        "liveness_probe": probe_snapshot(container.get("livenessProbe")),
        "startup_probe": probe_snapshot(container.get("startupProbe")),
        "resources": resource_snapshot(container),
    }


def container_detail_snapshot(
    container: JsonObject,
    volume_refs: dict[str, JsonObject],
) -> JsonObject:
    """Build a container detail for one Deployment query."""
    return {
        **container_summary_snapshot(container),
        "env_refs": env_refs(container),
        "env_from_refs": env_from_refs(container),
        "volume_mount_refs": volume_mount_refs(container, volume_refs),
    }


def resource_snapshot(container: JsonObject) -> JsonObject:
    """Return container CPU and memory requests and limits."""
    resources = object_or_empty(container.get("resources"))
    requests = object_or_empty(resources.get("requests"))
    limits = object_or_empty(resources.get("limits"))
    return compact_dict(
        {
            "requests": compact_dict(requests),
            "limits": compact_dict(limits),
        }
    )


def env_refs(container: JsonObject) -> list[JsonObject]:
    """Return ConfigMap and Secret refs used by env values."""
    refs: list[JsonObject] = []
    for env in list_items(container.get("env")):
        value_from = object_or_empty(env.get("valueFrom"))
        config_map_ref = object_or_empty(value_from.get("configMapKeyRef"))
        if config_map_ref:
            refs.append(
                compact_dict(
                    {
                        "env_name": env.get("name"),
                        "source": "config_map_key_ref",
                        "config_map_name": config_map_ref.get("name"),
                        "key": config_map_ref.get("key"),
                        "optional": config_map_ref.get("optional"),
                    }
                )
            )

        secret_ref = object_or_empty(value_from.get("secretKeyRef"))
        if secret_ref:
            refs.append(
                compact_dict(
                    {
                        "env_name": env.get("name"),
                        "source": "secret_key_ref",
                        "secret_name": secret_ref.get("name"),
                        "key": secret_ref.get("key"),
                        "optional": secret_ref.get("optional"),
                    }
                )
            )

    return refs


def env_from_refs(container: JsonObject) -> list[JsonObject]:
    """Return ConfigMap and Secret refs used by envFrom."""
    refs: list[JsonObject] = []
    for env_from in list_items(container.get("envFrom")):
        config_map_ref = object_or_empty(env_from.get("configMapRef"))
        if config_map_ref:
            refs.append(
                compact_dict(
                    {
                        "source": "config_map_ref",
                        "config_map_name": config_map_ref.get("name"),
                        "prefix": env_from.get("prefix"),
                        "optional": config_map_ref.get("optional"),
                    }
                )
            )

        secret_ref = object_or_empty(env_from.get("secretRef"))
        if secret_ref:
            refs.append(
                compact_dict(
                    {
                        "source": "secret_ref",
                        "secret_name": secret_ref.get("name"),
                        "prefix": env_from.get("prefix"),
                        "optional": secret_ref.get("optional"),
                    }
                )
            )

    return refs


def volume_reference_map(template_spec: JsonObject) -> dict[str, JsonObject]:
    """Return ConfigMap and Secret volume refs by volume name."""
    refs: dict[str, JsonObject] = {}
    for volume in list_items(template_spec.get("volumes")):
        volume_name = volume.get("name")
        if not isinstance(volume_name, str) or not volume_name:
            continue

        config_map = object_or_empty(volume.get("configMap"))
        if config_map:
            refs[volume_name] = compact_dict(
                {
                    "volume_name": volume_name,
                    "source": "config_map",
                    "config_map_name": config_map.get("name"),
                    "optional": config_map.get("optional"),
                    "items": volume_items(config_map),
                }
            )
            continue

        secret = object_or_empty(volume.get("secret"))
        if secret:
            refs[volume_name] = compact_dict(
                {
                    "volume_name": volume_name,
                    "source": "secret",
                    "secret_name": secret.get("secretName"),
                    "optional": secret.get("optional"),
                    "items": volume_items(secret),
                }
            )

    return refs


def volume_mount_refs(
    container: JsonObject,
    volume_refs: dict[str, JsonObject],
) -> list[JsonObject]:
    """Return ConfigMap and Secret refs mounted by one container."""
    refs: list[JsonObject] = []
    for mount in list_items(container.get("volumeMounts")):
        volume_name = mount.get("name")
        if not isinstance(volume_name, str):
            continue
        volume_ref = volume_refs.get(volume_name)
        if not volume_ref:
            continue
        refs.append(
            compact_dict(
                {
                    **volume_ref,
                    "mount_path": mount.get("mountPath"),
                    "read_only": mount.get("readOnly"),
                    "sub_path": mount.get("subPath"),
                }
            )
        )
    return refs


def volume_items(volume_source: JsonObject) -> list[JsonObject]:
    """Return item keys and paths without reading item values."""
    return [
        compact_dict(
            {
                "key": item.get("key"),
                "path": item.get("path"),
            }
        )
        for item in list_items(volume_source.get("items"))
    ]


def deployment_status_snapshot(deployment: JsonObject) -> JsonObject:
    """Return Deployment status counts and conditions."""
    deployment_spec = spec(deployment)
    deployment_status = status(deployment)
    return compact_dict(
        {
            "observed_generation": deployment_status.get("observedGeneration"),
            "desired_replicas": deployment_spec.get("replicas"),
            "replicas": deployment_status.get("replicas"),
            "updated_replicas": deployment_status.get("updatedReplicas"),
            "ready_replicas": deployment_status.get("readyReplicas"),
            "available_replicas": deployment_status.get("availableReplicas"),
            "unavailable_replicas": deployment_status.get("unavailableReplicas"),
            "conditions": conditions_snapshot(deployment_status.get("conditions")),
        }
    )


def pod_status_snapshot(pod: JsonObject) -> JsonObject:
    """Return Pod status phase and conditions."""
    meta = metadata(pod)
    pod_status = status(pod)
    pod_conditions = pod_status.get("conditions")
    return compact_dict(
        {
            "name": meta.get("name"),
            "phase": pod_status.get("phase"),
            "ready": pod_ready(pod_conditions),
            "reason": pod_status.get("reason"),
            "message": pod_status.get("message"),
            "start_time": pod_status.get("startTime"),
            "conditions": conditions_snapshot(pod_conditions),
        }
    )


def pod_ready(value: Any) -> bool | None:
    """Return whether the Pod Ready condition is true."""
    for condition in list_items(value):
        if condition.get("type") == "Ready":
            condition_status = condition.get("status")
            if isinstance(condition_status, str):
                return condition_status == "True"
            return None
    return None


def service_selector_match_snapshots(
    services: list[JsonObject],
    pods: list[JsonObject],
    *,
    target_labels: JsonObject | None = None,
    target_pods: list[JsonObject] | None = None,
) -> list[JsonObject]:
    """Build Service selector to Pod label match summaries."""
    snapshots: list[JsonObject] = []
    for service in sorted(services, key=resource_sort_key):
        snapshot = service_selector_match_snapshot(
            service,
            pods,
            target_labels=target_labels,
            target_pods=target_pods,
        )
        if target_labels is None and target_pods is None:
            snapshots.append(snapshot)
        elif snapshot.get("target_relation"):
            snapshots.append(snapshot)
    return snapshots


def service_selector_match_snapshot(
    service: JsonObject,
    pods: list[JsonObject],
    *,
    target_labels: JsonObject | None = None,
    target_pods: list[JsonObject] | None = None,
) -> JsonObject:
    """Build one Service selector match summary."""
    selector = object_or_empty(spec(service).get("selector"))
    matched_pods = [
        pod
        for pod in sorted(pods, key=resource_sort_key)
        if selector
        and selector_matches_labels(
            selector,
            object_or_empty(metadata(pod).get("labels")),
        )
    ]
    return compact_dict(
        {
            "service": resource_identity_snapshot(service),
            "selector": selector,
            "match_status": service_selector_match_status(selector, matched_pods),
            "target_relation": service_target_relation(
                selector,
                target_labels,
                target_pods,
            ),
            "matched_pod_count": len(matched_pods),
            "matched_pods": [resource_identity_snapshot(pod) for pod in matched_pods],
        }
    )


def service_selector_match_status(
    selector: JsonObject,
    matched_pods: list[JsonObject],
) -> str:
    """Return a small status for one Service selector match."""
    if not selector:
        return "selector_missing"
    if matched_pods:
        return "matched"
    return "no_matching_pods"


def selector_matches_labels(selector: JsonObject, labels: JsonObject) -> bool:
    """Check whether all selector labels exist on a Pod."""
    return all(labels.get(key) == value for key, value in selector.items())


def service_target_relation(
    selector: JsonObject,
    target_labels: JsonObject | None,
    target_pods: list[JsonObject] | None,
) -> str | None:
    """Return why a Service is related to the target Deployment."""
    if not selector:
        return None

    if target_labels and selector_matches_labels(selector, target_labels):
        return "exact_selector_match"

    pod_labels = [
        object_or_empty(metadata(pod).get("labels"))
        for pod in target_pods or []
    ]
    if any(selector_matches_labels(selector, labels) for labels in pod_labels):
        return "live_pod_match"

    target_label_keys = set(target_labels or {})
    for labels in pod_labels:
        target_label_keys.update(labels)
    if target_label_keys.intersection(selector):
        return "selector_key_overlap"

    return None


def resource_identity_snapshot(resource: JsonObject) -> JsonObject:
    """Return a small resource identity."""
    meta = metadata(resource)
    return compact_dict(
        {
            "namespace": meta.get("namespace"),
            "name": meta.get("name"),
        }
    )


def resource_sort_key(resource: JsonObject) -> tuple[str, str]:
    """Return a stable sort key for Kubernetes resources."""
    meta = metadata(resource)
    return (
        str(meta.get("namespace") or ""),
        str(meta.get("name") or ""),
    )


def conditions_snapshot(value: Any) -> list[JsonObject]:
    """Return small condition summaries."""
    conditions: list[JsonObject] = []
    for condition in list_items(value):
        snapshot = compact_dict(
            {
                "type": condition.get("type"),
                "status": condition.get("status"),
                "reason": condition.get("reason"),
                "message": condition.get("message"),
                "last_probe_time": condition.get("lastProbeTime"),
                "last_transition_time": condition.get("lastTransitionTime"),
                "last_update_time": condition.get("lastUpdateTime"),
            }
        )
        if snapshot:
            conditions.append(snapshot)
    return conditions


def probe_snapshot(value: Any) -> JsonObject:
    """Build a small probe snapshot."""
    probe = object_or_empty(value)
    http_get = object_or_empty(probe.get("httpGet"))
    tcp_socket = object_or_empty(probe.get("tcpSocket"))
    grpc = object_or_empty(probe.get("grpc"))

    snapshot = {
        "path": http_get.get("path"),
        "port": http_get.get("port") or tcp_socket.get("port") or grpc.get("port"),
        "timeout_seconds": probe.get("timeoutSeconds"),
        "period_seconds": probe.get("periodSeconds"),
        "failure_threshold": probe.get("failureThreshold"),
    }
    return {key: value for key, value in snapshot.items() if value is not None}


def safe_annotations(item_metadata: JsonObject) -> JsonObject:
    """Return safe annotation values for RCA context."""
    annotations = object_or_empty(item_metadata.get("annotations"))
    safe: JsonObject = {}

    entries = sorted((str(key), value) for key, value in annotations.items())
    for name, value in entries:
        if len(safe) >= MAX_SAFE_ANNOTATIONS:
            break
        if not is_safe_annotation_name(name):
            continue
        safe[name] = annotation_value(value)

    return safe


def is_safe_annotation_name(name: str) -> bool:
    """Check if an annotation name is safe to send."""
    lowered = name.casefold()
    if lowered in BLOCKED_ANNOTATION_NAMES:
        return False
    if any(token in lowered for token in SENSITIVE_ANNOTATION_TOKENS):
        return False
    return any(lowered.startswith(prefix) for prefix in SAFE_ANNOTATION_PREFIXES)


def annotation_value(value: Any) -> str:
    """Return one small annotation value."""
    text = str(value)
    if len(text) <= MAX_ANNOTATION_VALUE_LENGTH:
        return text
    return f"{text[:MAX_ANNOTATION_VALUE_LENGTH]}..."


def managed_field_managers(deployment: JsonObject) -> list[str]:
    """Return unique manager names from managedFields."""
    managers: list[str] = []
    for field in list_items(metadata(deployment).get("managedFields")):
        manager = field.get("manager")
        if isinstance(manager, str) and manager and manager not in managers:
            managers.append(manager)
    return managers


def replicasets_for_deployment(
    deployment: JsonObject,
    replicasets: list[JsonObject],
) -> list[JsonObject]:
    """Return ReplicaSets owned by this Deployment."""
    meta = metadata(deployment)
    deployment_uid = str(meta.get("uid") or "")
    deployment_name = str(meta.get("name") or "")

    return [
        replicaset
        for replicaset in replicasets
        if is_owned_by_deployment(replicaset, deployment_uid, deployment_name)
    ]


def sorted_replicasets_for_deployment(
    deployment: JsonObject,
    replicasets: list[JsonObject],
) -> list[JsonObject]:
    """Return owned ReplicaSets sorted by revision."""
    return sorted(
        replicasets_for_deployment(deployment, replicasets),
        key=replicaset_revision_number,
    )


def pods_for_deployment(
    deployment: JsonObject,
    replicasets: list[JsonObject],
    pods: list[JsonObject],
) -> list[JsonObject]:
    """Return Pods owned by this Deployment."""
    owned_replicasets = replicasets_for_deployment(deployment, replicasets)
    if not owned_replicasets:
        return []

    replicaset_uids = {
        str(metadata(replicaset).get("uid"))
        for replicaset in owned_replicasets
        if metadata(replicaset).get("uid")
    }
    replicaset_names = {
        str(metadata(replicaset).get("name"))
        for replicaset in owned_replicasets
        if metadata(replicaset).get("name")
    }
    return sorted(
        [
            pod
            for pod in pods
            if is_owned_by_replicaset(pod, replicaset_uids, replicaset_names)
        ],
        key=lambda pod: str(metadata(pod).get("name") or ""),
    )


def is_owned_by_replicaset(
    pod: JsonObject,
    replicaset_uids: set[str],
    replicaset_names: set[str],
) -> bool:
    """Check whether a Pod belongs to one ReplicaSet."""
    for owner in list_items(metadata(pod).get("ownerReferences")):
        if owner.get("kind") != "ReplicaSet":
            continue
        owner_uid = str(owner.get("uid") or "")
        owner_name = str(owner.get("name") or "")
        if owner_uid and owner_uid in replicaset_uids:
            return True
        if owner_name and owner_name in replicaset_names:
            return True
    return False


def is_owned_by_deployment(
    replicaset: JsonObject,
    deployment_uid: str,
    deployment_name: str,
) -> bool:
    """Check whether a ReplicaSet belongs to a Deployment."""
    for owner in list_items(metadata(replicaset).get("ownerReferences")):
        if owner.get("kind") != "Deployment":
            continue
        if deployment_uid and owner.get("uid") == deployment_uid:
            return True
        if deployment_name and owner.get("name") == deployment_name:
            return True
    return False


def replicaset_revision_summary_snapshot(replicaset: JsonObject) -> JsonObject:
    """Build a ReplicaSet summary for namespace-wide queries."""
    meta = metadata(replicaset)
    annotations = object_or_empty(meta.get("annotations"))
    replicaset_spec = spec(replicaset)
    replicaset_status = status(replicaset)
    return compact_dict(
        {
            "name": meta.get("name"),
            "revision": annotations.get("deployment.kubernetes.io/revision"),
            "desired_replicas": replicaset_spec.get("replicas"),
            "replicas": replicaset_status.get("replicas"),
            "ready_replicas": replicaset_status.get("readyReplicas"),
            "available_replicas": replicaset_status.get("availableReplicas"),
            "fully_labeled_replicas": replicaset_status.get("fullyLabeledReplicas"),
        }
    )


def replicaset_revision_detail_snapshot(replicaset: JsonObject) -> JsonObject:
    """Build a ReplicaSet detail for one Deployment query."""
    meta = metadata(replicaset)
    return compact_dict(
        {
            **replicaset_revision_summary_snapshot(replicaset),
            "created_at": meta.get("creationTimestamp"),
            "conditions": conditions_snapshot(status(replicaset).get("conditions")),
        }
    )


def replicaset_revision_number(replicaset: JsonObject) -> int:
    """Return the ReplicaSet revision as a sortable number."""
    annotations = object_or_empty(metadata(replicaset).get("annotations"))
    revision = annotations.get("deployment.kubernetes.io/revision")
    try:
        return int(str(revision))
    except (TypeError, ValueError):
        return -1


def items(payload: Any) -> list[JsonObject]:
    """Return list items from a Kubernetes list response."""
    if not isinstance(payload, dict):
        return []
    return list_items(payload.get("items"))


def list_items(value: Any) -> list[JsonObject]:
    """Return dict items from a list value."""
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def metadata(item: JsonObject) -> JsonObject:
    """Return object metadata, or an empty dict."""
    return object_or_empty(item.get("metadata"))


def spec(item: JsonObject) -> JsonObject:
    """Return object spec, or an empty dict."""
    return object_or_empty(item.get("spec"))


def status(item: JsonObject) -> JsonObject:
    """Return object status, or an empty dict."""
    return object_or_empty(item.get("status"))


def pod_template(deployment: JsonObject) -> JsonObject:
    """Return the Deployment pod template."""
    return object_or_empty(spec(deployment).get("template"))


def object_or_empty(value: Any) -> JsonObject:
    """Return a dict value, or an empty dict."""
    return value if isinstance(value, dict) else {}


def compact_dict(value: JsonObject) -> JsonObject:
    """Drop empty values while keeping false boolean values."""
    return {key: item for key, item in value.items() if item not in (None, "", [], {})}
