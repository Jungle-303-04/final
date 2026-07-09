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
            replicasets = await self.get_json(
                client,
                base_url,
                headers,
                namespaced_apps_path(target.namespace, "replicasets"),
            )

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
                change_context = specific_workload_change_context(
                    deployment,
                    items(replicasets),
                )
            else:
                deployments = await self.get_json(
                    client,
                    base_url,
                    headers,
                    namespaced_apps_path(target.namespace, "deployments"),
                )
                change_context = {
                    "current_workload_snapshots": current_workload_snapshots(
                        items(deployments),
                        items(replicasets),
                    )
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
        normalized: JsonObject = {}

        if isinstance(snapshots, list):
            normalized["current_workload_snapshots"] = [
                item for item in snapshots if isinstance(item, dict)
            ]

        if isinstance(snapshot, dict) and snapshot:
            normalized["current_workload_snapshot"] = snapshot

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


def path_part(value: str) -> str:
    """Escape one value for a Kubernetes API path."""
    return quote(value, safe="")


def specific_workload_change_context(
    deployment: JsonObject,
    replicasets: list[JsonObject],
) -> JsonObject:
    """Build a change context for one Deployment."""
    if not deployment:
        return empty_change_context()
    return {
        "current_workload_snapshot": current_workload_snapshot(
            deployment,
            replicasets,
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


def empty_change_context() -> JsonObject:
    """Build the default change context shape."""
    return {
        "current_workload_snapshots": [],
    }


def current_workload_snapshots(
    deployments: list[JsonObject],
    replicasets: list[JsonObject],
) -> list[JsonObject]:
    """Build small snapshots for all Deployments."""
    return [
        current_workload_snapshot(deployment, replicasets)
        for deployment in deployments
    ]


def current_workload_snapshot(
    deployment: JsonObject,
    replicasets: list[JsonObject],
) -> JsonObject:
    """Build one small Deployment snapshot."""
    meta = metadata(deployment)
    template = pod_template(deployment)
    template_meta = metadata(template)
    template_spec = spec(template)

    return {
        "workload": {
            "kind": "Deployment",
            "namespace": meta.get("namespace"),
            "name": meta.get("name"),
        },
        "deployment_labels": object_or_empty(meta.get("labels")),
        "deployment_annotations": safe_annotations(meta),
        "pod_template_annotations": safe_annotations(template_meta),
        "pod_template_labels": object_or_empty(template_meta.get("labels")),
        "managed_fields_managers": managed_field_managers(deployment),
        "containers": [
            container_snapshot(container)
            for container in list_items(template_spec.get("containers"))
        ],
        "replicaset_revisions": [
            replicaset_revision_snapshot(replicaset)
            for replicaset in sorted(
                replicasets_for_deployment(deployment, replicasets),
                key=replicaset_revision_number,
            )
        ],
    }


def container_snapshot(container: JsonObject) -> JsonObject:
    """Build a small container snapshot."""
    return {
        "name": container.get("name"),
        "image": container.get("image"),
        "readiness_probe": probe_snapshot(container.get("readinessProbe")),
        "liveness_probe": probe_snapshot(container.get("livenessProbe")),
        "startup_probe": probe_snapshot(container.get("startupProbe")),
    }


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


def replicaset_revision_snapshot(replicaset: JsonObject) -> JsonObject:
    """Build a small ReplicaSet revision snapshot."""
    meta = metadata(replicaset)
    annotations = object_or_empty(meta.get("annotations"))
    return {
        "name": meta.get("name"),
        "revision": annotations.get("deployment.kubernetes.io/revision"),
    }


def replicaset_revision_number(replicaset: JsonObject) -> int:
    """Return the ReplicaSet revision as a sortable number."""
    revision = replicaset_revision_snapshot(replicaset).get("revision")
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


def pod_template(deployment: JsonObject) -> JsonObject:
    """Return the Deployment pod template."""
    return object_or_empty(spec(deployment).get("template"))


def object_or_empty(value: Any) -> JsonObject:
    """Return a dict value, or an empty dict."""
    return value if isinstance(value, dict) else {}
