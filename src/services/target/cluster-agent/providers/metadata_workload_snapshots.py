from __future__ import annotations

from typing import Any

from packages.contracts.event_bus.interfaces import JsonObject
from providers.kubernetes_utils import (
    K8S_DEPLOYMENT_REVISION_ANNOTATION,
    K8S_KIND_DEPLOYMENT,
    compact_dict,
    list_items,
    metadata,
    object_or_empty,
    spec,
    status,
)
from providers.metadata_config_refs import (
    env_from_refs,
    env_refs,
    volume_mount_refs,
    volume_reference_map,
)
from providers.metadata_ownership import (
    pods_for_deployment,
    sorted_replicasets_for_deployment,
)

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
            "kind": K8S_KIND_DEPLOYMENT,
            "namespace": meta.get("namespace"),
            "name": meta.get("name"),
        },
        "deployment_labels": object_or_empty(meta.get("labels")),
        "pod_template_labels": object_or_empty(template_meta.get("labels")),
        "deployment_status": deployment_status_snapshot(deployment),
        "pod_statuses": [
            pod_status_snapshot(pod) for pod in pods_for_deployment(deployment, replicasets, pods)
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


def replicaset_revision_summary_snapshot(replicaset: JsonObject) -> JsonObject:
    """Build a ReplicaSet summary for namespace-wide queries."""
    meta = metadata(replicaset)
    annotations = object_or_empty(meta.get("annotations"))
    replicaset_spec = spec(replicaset)
    replicaset_status = status(replicaset)
    return compact_dict(
        {
            "name": meta.get("name"),
            "revision": annotations.get(K8S_DEPLOYMENT_REVISION_ANNOTATION),
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


def pod_template(deployment: JsonObject) -> JsonObject:
    """Return the Deployment pod template."""
    return object_or_empty(spec(deployment).get("template"))
