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

from queries import MetadataSnapshotQuery
from telemetry_registry import telemetry

from config import KUBERNETES_API_TIMEOUT_SECONDS, TARGET_CLUSTER_ID_ENV
from packages.config.constants import Target
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.target import TARGET_NAMESPACE
from providers.base import ConfigReader


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
        _telemetry_query: MetadataSnapshotQuery,
    ) -> JsonObject:
        """Read current Deployment metadata from the target namespace."""
        base_url = kubernetes_api_base_url()
        token = service_account_token()
        namespace = TARGET_NAMESPACE

        if not base_url or not token:
            return {
                "cluster_id": self.cluster_id,
                "collected_at": datetime.now(UTC).isoformat(),
                "change_context": empty_change_context(),
            }

        headers = kubernetes_headers(token)

        async with kubernetes_client(self.transport) as client:
            deployments = await self.get_json(
                client,
                base_url,
                headers,
                f"/apis/apps/v1/namespaces/{namespace}/deployments",
            )

            replicasets = await self.get_json(
                client,
                base_url,
                headers,
                f"/apis/apps/v1/namespaces/{namespace}/replicasets",
            )

        return {
            "cluster_id": self.cluster_id,
            "collected_at": datetime.now(UTC).isoformat(),
            "change_context": {
                "current_workload_snapshots": current_workload_snapshots(
                    items(deployments),
                    items(replicasets),
                )
            },
        }

    async def get_json(
        self,
        client: httpx.AsyncClient,
        base_url: str,
        headers: dict[str, str],
        path: str,
    ) -> JsonObject:
        """Call one Kubernetes API path and return a JSON object."""
        response = await client.get(f"{base_url}{path}", headers=headers)
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
        results["change_context"] = self.normalize_payload(payload, telemetry_query)

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

        snapshots = change_context.get("current_workload_snapshots", [])

        if not isinstance(snapshots, list):
            snapshots = []

        return {
            "current_workload_snapshots": [
                snapshot for snapshot in snapshots if isinstance(snapshot, dict)
            ],
        }


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
