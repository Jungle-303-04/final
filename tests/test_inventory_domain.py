from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from domains.identity.dependencies import ClusterAgentIdentity
from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory.repository import (
    HEALTH_RESOURCE_TYPE,
    USAGE_RESOURCE_TYPE,
    dedupe_inventory_rows,
    event_involves_resource,
    first_container_image,
    inventory_resource_key,
    labels_match,
    normalize_inventory_resource,
    preserve_existing_inventory_keys,
    selector_labels,
    snapshot_resources,
)
from domains.inventory.resource_types import (
    discoverable_product_resource_types,
    include_discoverable_zero_counts,
    project_inventory_product_counts,
)
from domains.inventory.router import (
    get_cluster_api_resources,
    get_inventory_resource_detail,
    get_inventory_summary,
    list_inventory_resources,
    list_inventory_workloads,
    record_inventory_snapshot,
)
from packages.contracts.gateway.requests import InventoryResource, InventorySnapshotRequest


class StubInventoryDb:
    def __init__(self, resources: list[dict[str, object]] | None = None) -> None:
        self.saved: dict[str, object] | None = None
        self.resources = resources or [inventory_resource("workload", "Deployment", "api")]

    def save_inventory_snapshot(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        agent_id: str,
        payload: dict[str, object],
    ) -> dict[str, object]:
        self.saved = {
            "workspace_id": workspace_id,
            "cluster_id": cluster_id,
            "agent_id": agent_id,
            "payload": payload,
        }
        return {
            "accepted": True,
            "snapshot_id": "snapshot-1",
            "cluster_id": cluster_id,
            "resource_count": len(payload["resources"]),
            "marked_deleted": 0,
            "resource_types": ["workload"],
        }

    def can_access(
        self,
        _user_id: str,
        _workspace_id: str,
        _resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return resource_id == "cluster-1" and permission == "inventory.read"

    def list_inventory_resources(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str | None,
        namespace: str | None,
        include_deleted: bool,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert cluster_id == "cluster-1"
        rows = [
            item
            for item in self.resources
            if (resource_type is None or item["resource_type"] == resource_type)
            and (namespace is None or item["namespace"] == namespace)
            and (include_deleted or item["deleted_at"] is None)
        ]
        return rows[:limit]

    def list_inventory_resources_by_kind(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str,
        kind: str,
        namespace: str | None,
        include_deleted: bool,
        limit: int,
    ) -> list[dict[str, object]]:
        rows = self.list_inventory_resources(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            resource_type=resource_type,
            namespace=namespace,
            include_deleted=include_deleted,
            limit=limit,
        )
        return [row for row in rows if str(row["kind"]).casefold() == kind.casefold()]

    def get_inventory_resource(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str,
        kind: str,
        name: str,
        namespace: str | None,
    ) -> dict[str, object] | None:
        assert workspace_id == "ws-1"
        assert cluster_id == "cluster-1"
        for item in self.resources:
            if (
                item["resource_type"] == resource_type
                and str(item["kind"]).lower() == kind.lower()
                and item["name"] == name
                and item["namespace"] == namespace
                and item["deleted_at"] is None
            ):
                return item
        return None

    def list_related_inventory_resources(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource: dict[str, object],
        limit: int,
    ) -> dict[str, list[dict[str, object]]]:
        assert workspace_id == "ws-1"
        assert cluster_id == "cluster-1"
        if resource["resource_type"] != "service":
            return {}
        selector = selector_labels(dict(resource["summary"]).get("selector"))
        pods = [
            item
            for item in self.resources
            if item["resource_type"] == "pod"
            and item["namespace"] == resource["namespace"]
            and labels_match(selector, dict(dict(item["summary"]).get("labels") or {}))
        ]
        return {"pods": pods[:limit]}

    def list_resource_events(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource: dict[str, object],
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "ws-1"
        assert cluster_id == "cluster-1"
        return [
            item
            for item in self.resources
            if item["resource_type"] == "event" and event_involves_resource(item, resource)
        ][:limit]

    def latest_inventory_snapshot(
        self,
        _workspace_id: str,
        _cluster_id: str,
    ) -> dict[str, object]:
        return {"snapshot_id": "snapshot-1", "resource_count": 1}

    def inventory_product_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        namespaces: tuple[str, ...] = (),
    ) -> list[dict[str, object]]:
        assert namespaces == ()
        return [{"resource_type": "workload", "health": "healthy", "count": 1}]

    def inventory_namespace_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        namespaces: tuple[str, ...] = (),
    ) -> list[dict[str, object]]:
        return []


class StubInventoryEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.accepted.append(body)


def inventory_resource(
    resource_type: str,
    kind: str,
    name: str,
    *,
    namespace: str | None = "default",
    uid: str = "uid-1",
    summary: dict[str, object] | None = None,
) -> dict[str, object]:
    return {
        "inventory_key": f"{resource_type}:{name}",
        "snapshot_id": "snapshot-1",
        "workspace_id": "ws-1",
        "cluster_id": "cluster-1",
        "resource_type": resource_type,
        "api_version": "apps/v1",
        "kind": kind,
        "namespace": namespace,
        "name": name,
        "uid": uid,
        "resource_version": "1",
        "status": "running",
        "health": "healthy",
        "labels": {},
        "annotations": {},
        "summary": summary or {"ready_replicas": 1},
        "raw": {"secret": "must-not-leak"},
        "observed_at": "2026-07-05T00:00:00+00:00",
        "first_seen_at": "2026-07-05T00:00:00+00:00",
        "last_seen_at": "2026-07-05T00:00:00+00:00",
        "deleted_at": None,
        "created_at": "2026-07-05T00:00:00+00:00",
        "updated_at": "2026-07-05T00:00:00+00:00",
    }


def test_inventory_resource_key_is_stable_for_same_kubernetes_identity() -> None:
    first = inventory_resource_key(
        "ws-1", "cluster-1", "workload", "apps/v1", "default", "Deployment", "api"
    )
    second = inventory_resource_key(
        "ws-1", "cluster-1", "workload", "apps/v1", "default", "Deployment", "api"
    )

    assert first == second
    assert first != inventory_resource_key(
        "ws-1", "cluster-1", "workload", "apps/v1", "prod", "Deployment", "api"
    )


def test_inventory_resource_key_separates_cross_group_resource_identity() -> None:
    first = inventory_resource_key(
        "ws-1",
        "cluster-1",
        "custom_resource",
        "alpha.example.io/v1",
        "default",
        "Widget",
        "api",
    )
    second = inventory_resource_key(
        "ws-1",
        "cluster-1",
        "custom_resource",
        "beta.example.io/v1",
        "default",
        "Widget",
        "api",
    )

    assert first != second


def test_existing_inventory_identity_keeps_legacy_key_during_key_upgrade() -> None:
    observed_at = datetime(2026, 7, 17, 9, 0, tzinfo=UTC)
    current = normalize_inventory_resource(
        {
            "resource_type": "custom_resource",
            "api_version": "alpha.example.io/v1",
            "kind": "Widget",
            "namespace": "default",
            "name": "api",
        },
        workspace_id="ws-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-2",
        observed_at=observed_at,
    )
    previous = {**current, "inventory_key": "legacy-key", "snapshot_id": "snapshot-1"}

    preserved = preserve_existing_inventory_keys([current], [previous])

    assert preserved[0]["inventory_key"] == "legacy-key"


def test_existing_inventory_key_is_not_reused_across_api_groups() -> None:
    observed_at = datetime(2026, 7, 17, 9, 0, tzinfo=UTC)
    previous = normalize_inventory_resource(
        {
            "resource_type": "custom_resource",
            "api_version": "alpha.example.io/v1",
            "kind": "Widget",
            "namespace": "default",
            "name": "api",
        },
        workspace_id="ws-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-1",
        observed_at=observed_at,
    )
    current = normalize_inventory_resource(
        {
            "resource_type": "custom_resource",
            "api_version": "beta.example.io/v1",
            "kind": "Widget",
            "namespace": "default",
            "name": "api",
        },
        workspace_id="ws-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-2",
        observed_at=observed_at,
    )

    preserved = preserve_existing_inventory_keys([current], [previous])

    assert preserved[0]["inventory_key"] == current["inventory_key"]
    assert preserved[0]["inventory_key"] != previous["inventory_key"]


def test_inventory_resource_accepts_full_kubernetes_api_version_length() -> None:
    api_version = f"{'g' * 253}/{'v' * 63}"

    resource = InventoryResource(
        resource_type="custom_resource",
        api_version=api_version,
        kind="Widget",
        name="api",
    )

    assert resource.api_version == api_version


def test_snapshot_resources_adds_health_and_usage_rollups() -> None:
    resources = snapshot_resources(
        {
            "resources": [
                {
                    "resource_type": "workload",
                    "kind": "Deployment",
                    "namespace": "default",
                    "name": "api",
                }
            ],
            "health": {"status": "healthy"},
            "usage": {"cpu_cores": 2},
        }
    )

    assert [item["resource_type"] for item in resources] == [
        "workload",
        HEALTH_RESOURCE_TYPE,
        USAGE_RESOURCE_TYPE,
    ]
    assert resources[1]["kind"] == "ClusterHealth"
    assert resources[2]["kind"] == "ClusterUsage"


def test_duplicate_inventory_keys_are_deduped_last_wins_before_upsert() -> None:
    """kubernetes provider 의 namespace 별 쿼리 병합으로 node 가 중복되는 입력 재현.

    같은 conflict key(inventory_key)가 배치 upsert VALUES 에 두 번 들어가면 postgres 가
    CardinalityViolation(ON CONFLICT DO UPDATE cannot affect row a second time)으로
    실패하므로, upsert 전에 키당 1행(마지막 관측 승리)으로 줄어야 한다.
    """
    observed_at = datetime(2026, 7, 7, 9, 0, tzinfo=UTC)

    def node_row(status: str) -> dict[str, object]:
        return normalize_inventory_resource(
            {
                "resource_type": "node",
                "kind": "Node",
                "namespace": None,
                "name": "n1",
                "status": status,
                "health": "healthy",
            },
            workspace_id="ws-1",
            cluster_id="cluster-1",
            snapshot_id="snapshot-1",
            observed_at=observed_at,
        )

    first = node_row("Ready")
    second = node_row("NotReady")
    assert first["inventory_key"] == second["inventory_key"]  # 동일 identity → 동일 conflict key

    deduped = dedupe_inventory_rows([first, second])

    assert len(deduped) == 1
    assert deduped[0]["status"] == "NotReady"  # last-wins
    # 중복이 없는 행은 순서 그대로 보존된다.
    other = normalize_inventory_resource(
        {"resource_type": "pod", "kind": "Pod", "namespace": "sandbox", "name": "p1"},
        workspace_id="ws-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-1",
        observed_at=observed_at,
    )
    assert [row["kind"] for row in dedupe_inventory_rows([first, other, second])] == [
        "Node",
        "Pod",
    ]


def test_inventory_event_preserves_event_time_separately_from_collection_time() -> None:
    collected_at = datetime(2026, 7, 15, 3, 20, tzinfo=UTC)
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "cluster": {"collected_at": "2026-07-15T03:20:00Z"},
            "events": [
                {
                    "uid": "evt-readiness",
                    "namespace": "production",
                    "type": "Warning",
                    "reason": "Unhealthy",
                    "first_timestamp": "2026-07-15T02:55:00Z",
                    "last_timestamp": "2026-07-15T03:01:30Z",
                }
            ],
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    resource = next(item for item in snapshot["resources"] if item["resource_type"] == "event")

    row = normalize_inventory_resource(
        resource,
        workspace_id="ws-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-1",
        observed_at=collected_at,
    )

    assert row["first_seen_at"] == datetime(2026, 7, 15, 2, 55, tzinfo=UTC)
    assert row["observed_at"] == datetime(2026, 7, 15, 3, 1, 30, tzinfo=UTC)
    assert row["last_seen_at"] == datetime(2026, 7, 15, 3, 1, 30, tzinfo=UTC)
    assert row["summary"]["collected_at"] == "2026-07-15T03:20:00Z"


def test_inventory_snapshot_route_uses_agent_identity_scope() -> None:
    db = StubInventoryDb()
    events = StubInventoryEvents()

    async def run():
        return await record_inventory_snapshot(
            InventorySnapshotRequest(
                cluster_id="cluster-1",
                agent_id="agent-1",
                resources=[
                    InventoryResource(
                        resource_type="workload",
                        kind="Deployment",
                        namespace="default",
                        name="api",
                    )
                ],
            ),
            identity=ClusterAgentIdentity(workspace_id="ws-1", cluster_id="cluster-1"),
            db=db,
            events=events,
        )

    response = asyncio.run(run())

    assert response.accepted is True
    assert response.cluster_id == "cluster-1"
    assert db.saved is not None
    assert db.saved["workspace_id"] == "ws-1"
    assert db.saved["cluster_id"] == "cluster-1"
    assert db.saved["agent_id"] == "agent-1"
    assert len(events.accepted) == 1
    assert events.accepted[0].snapshot_id == "snapshot-1"
    assert events.accepted[0].resource_types == ["workload"]


def test_inventory_snapshot_route_rejects_body_cluster_spoof() -> None:
    async def run():
        return await record_inventory_snapshot(
            InventorySnapshotRequest(cluster_id="other-cluster", agent_id="agent-1"),
            identity=ClusterAgentIdentity(workspace_id="ws-1", cluster_id="cluster-1"),
            db=StubInventoryDb(),
            events=StubInventoryEvents(),
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 403


def test_inventory_workloads_route_requires_inventory_access_and_filters() -> None:
    async def run():
        return await list_inventory_workloads(
            "cluster-1",
            namespace="default",
            limit=25,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=StubInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.resource_type == "workload"
    assert response.resources[0].kind == "Deployment"
    assert response.resources[0].summary == {"ready_replicas": 1}
    assert "raw" not in response.resources[0].model_dump()


def test_inventory_resource_alias_lists_jobs_as_a_real_selectable_type() -> None:
    db = StubInventoryDb(
        [
            inventory_resource("workload", "Deployment", "api"),
            inventory_resource("workload", "Job", "inventory-warmup"),
        ]
    )

    async def run():
        return await list_inventory_resources(
            "cluster-1",
            resource_type="job",
            namespace="default",
            limit=25,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.resource_type == "job"
    assert [(item.resource_type, item.kind, item.name) for item in response.resources] == [
        ("job", "Job", "inventory-warmup")
    ]


def test_inventory_resource_alias_detail_rejects_mismatched_kind() -> None:
    db = StubInventoryDb([inventory_resource("workload", "Deployment", "api")])

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="job",
            kind="Deployment",
            namespace="default",
            name="api",
            related_limit=10,
            event_limit=10,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=db,
        )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(run())

    assert exc.value.status_code == 404


def test_inventory_resource_detail_returns_related_resources_and_events_without_raw() -> None:
    db = StubInventoryDb(
        [
            inventory_resource(
                "service",
                "Service",
                "api",
                summary={"selector": {"app": "checkout"}},
            ),
            inventory_resource(
                "pod",
                "Pod",
                "api-1",
                summary={"labels": {"app": "checkout"}, "node_name": "node-1"},
            ),
            inventory_resource(
                "pod",
                "Pod",
                "other-1",
                summary={"labels": {"app": "other"}, "node_name": "node-1"},
            ),
            inventory_resource(
                "event",
                "Event",
                "evt-service",
                summary={
                    "involved_kind": "Service",
                    "involved_name": "api",
                    "reason": "Updated",
                    "message": "Service updated",
                },
            ),
            inventory_resource(
                "event",
                "Event",
                "evt-other",
                summary={
                    "involved_kind": "Pod",
                    "involved_name": "api-1",
                    "reason": "Pulled",
                },
            ),
        ]
    )

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="service",
            kind="Service",
            namespace="default",
            name="api",
            related_limit=10,
            event_limit=10,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=db,
        )

    response = asyncio.run(run())

    assert response.resource.name == "api"
    assert [pod.name for pod in response.related["pods"]] == ["api-1"]
    assert [event.name for event in response.events] == ["evt-service"]
    assert "raw" not in response.resource.model_dump()
    assert "raw" not in response.related["pods"][0].model_dump()
    assert "raw" not in response.events[0].model_dump()


def test_inventory_resource_detail_returns_typed_provider_projection_after_rbac() -> None:
    machine = inventory_resource("awsmachine", "AWSMachine", "node-a")
    machine["api_version"] = "infrastructure.cluster.x-k8s.io/v1beta2"
    machine["raw"] = {
        "spec": {"instanceType": "m6i.large", "instanceID": "i-123"},
        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
        "secret": "must-not-leak",
    }

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="awsmachine",
            kind="AWSMachine",
            namespace="default",
            name="node-a",
            related_limit=10,
            event_limit=10,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=StubInventoryDb([machine]),
        )

    response = asyncio.run(run())

    assert response.provider_detail is not None
    assert response.provider_detail.type == "aws-machine"
    assert response.provider_detail.instance_type == "m6i.large"
    assert "secret" not in response.provider_detail.model_dump()
    assert "raw" not in response.resource.model_dump()


def test_inventory_resource_detail_redacts_external_secret_payload_after_rbac() -> None:
    external_secret = inventory_resource("externalsecret", "ExternalSecret", "api-secret")
    external_secret["api_version"] = "external-secrets.io/v1beta1"
    external_secret["raw"] = {
        "metadata": {"name": "api-secret"},
        "spec": {
            "secretStoreRef": {"name": "vault", "kind": "ClusterSecretStore"},
            "target": {"name": "api"},
            "data": [
                {
                    "secretKey": "TOKEN",
                    "remoteRef": {"key": "prod/api", "property": "token"},
                }
            ],
        },
        "status": {
            "conditions": [{"type": "Ready", "status": "True"}],
            "providerPayload": {"secretValue": "must-not-leak"},
        },
    }

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="externalsecret",
            kind="ExternalSecret",
            namespace="default",
            name="api-secret",
            related_limit=10,
            event_limit=10,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=StubInventoryDb([external_secret]),
        )

    response = asyncio.run(run())

    assert response.provider_detail is not None
    assert response.provider_detail.type == "external-secret"
    serialized = response.provider_detail.model_dump_json()
    assert "must-not-leak" not in serialized
    assert "providerPayload" not in serialized
    assert "raw" not in response.resource.model_dump()


def test_inventory_resource_detail_returns_gateway_route_projection_after_rbac() -> None:
    route = inventory_resource("httproute", "HTTPRoute", "inventory")
    route["api_version"] = "gateway.networking.k8s.io/v1"
    route["raw"] = {
        "metadata": {"namespace": "default"},
        "spec": {
            "hostnames": ["api.example.test"],
            "rules": [
                {
                    "matches": [{"path": {"type": "PathPrefix", "value": "/inventory"}}],
                    "backendRefs": [{"name": "inventory-api", "port": 8080}],
                    "filters": [
                        {
                            "type": "RequestHeaderModifier",
                            "requestHeaderModifier": {
                                "set": [
                                    {
                                        "name": "authorization",
                                        "value": "must-not-leak",
                                    }
                                ]
                            },
                        }
                    ],
                }
            ],
        },
    }

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="httproute",
            kind="HTTPRoute",
            namespace="default",
            name="inventory",
            related_limit=10,
            event_limit=10,
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=StubInventoryDb([route]),
        )

    response = asyncio.run(run())

    assert response.provider_detail is not None
    assert response.provider_detail.type == "http-route"
    serialized = response.provider_detail.model_dump_json()
    assert "api.example.test" in serialized
    assert "must-not-leak" not in serialized
    assert "raw" not in response.resource.model_dump()


def test_inventory_resource_detail_redacts_keda_trigger_metadata_after_rbac() -> None:
    scaled_object = inventory_resource("scaledobject", "ScaledObject", "api")
    scaled_object["api_version"] = "keda.sh/v1alpha1"
    scaled_object["raw"] = {
        "metadata": {"namespace": "default"},
        "spec": {
            "scaleTargetRef": {"kind": "Deployment", "name": "api"},
            "triggers": [
                {
                    "type": "rabbitmq",
                    "metadata": {
                        "queueName": "orders",
                        "authToken": "must-not-leak-trigger-token",
                    },
                    "authenticationRef": {
                        "kind": "TriggerAuthentication",
                        "name": "rabbitmq",
                    },
                }
            ],
        },
        "status": {"conditions": [{"type": "Ready", "status": "True"}]},
    }

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="scaledobject",
            kind="ScaledObject",
            namespace="default",
            name="api",
            related_limit=10,
            event_limit=10,
            current=type(
                "Current",
                (),
                {"user_id": "user-1", "workspace_id": "ws-1"},
            )(),
            db=StubInventoryDb([scaled_object]),
        )

    response = asyncio.run(run())

    assert response.provider_detail is not None
    assert response.provider_detail.type == "keda-scaled-object"
    serialized = response.provider_detail.model_dump_json()
    assert "queueName" in serialized
    assert "authToken" not in serialized
    assert "must-not-leak" not in serialized
    assert "raw" not in response.resource.model_dump()


def test_inventory_resource_detail_redacts_vulnerability_payload_after_rbac() -> None:
    report = inventory_resource(
        "vulnerabilityreport",
        "VulnerabilityReport",
        "api-container",
    )
    report["api_version"] = "aquasecurity.github.io/v1alpha1"
    report["raw"] = {
        "metadata": {
            "namespace": "default",
            "labels": {"trivy-operator.container.name": "api"},
        },
        "report": {
            "artifact": {"repository": "platform/api", "tag": "1.2.3"},
            "registry": {"server": "registry.example.test"},
            "summary": {"criticalCount": 1},
            "vulnerabilities": [
                {
                    "vulnerabilityID": "CVE-2026-0001",
                    "severity": "CRITICAL",
                    "resource": "openssl",
                    "primaryLink": "https://user:must-not-leak@example.test/CVE-2026-0001",
                    "description": "must-not-leak-description",
                }
            ],
        },
    }

    async def run():
        return await get_inventory_resource_detail(
            "cluster-1",
            resource_type="vulnerabilityreport",
            kind="VulnerabilityReport",
            namespace="default",
            name="api-container",
            related_limit=10,
            event_limit=10,
            current=type(
                "Current",
                (),
                {"user_id": "user-1", "workspace_id": "ws-1"},
            )(),
            db=StubInventoryDb([report]),
        )

    response = asyncio.run(run())

    assert response.provider_detail is not None
    assert response.provider_detail.type == "vulnerability-report"
    serialized = response.provider_detail.model_dump_json()
    assert "CVE-2026-0001" in serialized
    assert "must-not-leak" not in serialized
    assert "primary_link" in serialized
    assert "raw" not in response.resource.model_dump()


def test_inventory_summary_route_returns_latest_snapshot_and_counts() -> None:
    async def run():
        return await get_inventory_summary(
            "cluster-1",
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=StubInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.latest_snapshot == {"snapshot_id": "snapshot-1", "resource_count": 1}
    assert response.counts == [{"resource_type": "workload", "health": "healthy", "count": 1}]
    assert response.counts_evidence.completeness == "unavailable"
    assert response.counts_evidence.reason_codes == ("inventory_snapshot_evidence_unavailable",)


def test_inventory_product_counts_project_known_kinds_without_losing_unknown_workloads() -> None:
    assert project_inventory_product_counts(
        [
            {"resource_type": "workload", "kind": "Deployment", "health": "healthy", "count": 2},
            {"resource_type": "workload", "kind": "Deployment", "health": "healthy", "count": 1},
            {"resource_type": "workload", "kind": "Rollout", "health": "warning", "count": 3},
            {"resource_type": "pod", "kind": "Pod", "health": "healthy", "count": 4},
        ]
    ) == [
        {"resource_type": "deployment", "health": "healthy", "count": 3},
        {"resource_type": "pod", "health": "healthy", "count": 4},
        {"resource_type": "workload", "health": "warning", "count": 3},
    ]


def test_exact_snapshot_discovery_adds_server_owned_zero_count_types() -> None:
    snapshot = {
        "summary": {
            "summary": {
                "api_resource_discovery": {
                    "observed_at": "2026-07-17T12:00:00Z",
                    "completeness": "exact",
                    "reason_codes": [],
                    "resources": [
                        {
                            "group": "",
                            "version": "v1",
                            "api_version": "v1",
                            "name": "configmaps",
                            "singular_name": "configmap",
                            "kind": "ConfigMap",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "",
                            "version": "v1",
                            "api_version": "v1",
                            "name": "persistentvolumes",
                            "singular_name": "persistentvolume",
                            "kind": "PersistentVolume",
                            "namespaced": False,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "",
                            "version": "v1",
                            "api_version": "v1",
                            "name": "persistentvolumeclaims",
                            "singular_name": "persistentvolumeclaim",
                            "kind": "PersistentVolumeClaim",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "",
                            "version": "v1",
                            "api_version": "v1",
                            "name": "secrets",
                            "singular_name": "secret",
                            "kind": "Secret",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "",
                            "version": "v1",
                            "api_version": "v1",
                            "name": "resourcequotas",
                            "singular_name": "resourcequota",
                            "kind": "ResourceQuota",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "batch",
                            "version": "v1",
                            "api_version": "batch/v1",
                            "name": "jobs",
                            "singular_name": "job",
                            "kind": "Job",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "networking.k8s.io",
                            "version": "v1",
                            "api_version": "networking.k8s.io/v1",
                            "name": "ingresses",
                            "singular_name": "ingress",
                            "kind": "Ingress",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "networking.k8s.io",
                            "version": "v1",
                            "api_version": "networking.k8s.io/v1",
                            "name": "networkpolicies",
                            "singular_name": "networkpolicy",
                            "kind": "NetworkPolicy",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "autoscaling",
                            "version": "v2",
                            "api_version": "autoscaling/v2",
                            "name": "horizontalpodautoscalers",
                            "singular_name": "horizontalpodautoscaler",
                            "kind": "HorizontalPodAutoscaler",
                            "namespaced": True,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                        {
                            "group": "storage.k8s.io",
                            "version": "v1",
                            "api_version": "storage.k8s.io/v1",
                            "name": "storageclasses",
                            "singular_name": "storageclass",
                            "kind": "StorageClass",
                            "namespaced": False,
                            "is_crd": False,
                            "verbs": ["get", "list"],
                        },
                    ],
                }
            }
        }
    }

    assert discoverable_product_resource_types(snapshot) == (
        "configmap",
        "hpa",
        "ingress",
        "job",
        "networkpolicy",
        "persistentvolume",
        "pvc",
        "resourcequota",
        "secret",
        "storageclass",
    )
    assert include_discoverable_zero_counts(
        [{"resource_type": "job", "health": "healthy", "count": 1}],
        snapshot=snapshot,
    ) == [
        {"resource_type": "configmap", "health": "unknown", "count": 0},
        {"resource_type": "hpa", "health": "unknown", "count": 0},
        {"resource_type": "ingress", "health": "unknown", "count": 0},
        {"resource_type": "job", "health": "healthy", "count": 1},
        {"resource_type": "networkpolicy", "health": "unknown", "count": 0},
        {"resource_type": "persistentvolume", "health": "unknown", "count": 0},
        {"resource_type": "pvc", "health": "unknown", "count": 0},
        {"resource_type": "resourcequota", "health": "unknown", "count": 0},
        {"resource_type": "secret", "health": "unknown", "count": 0},
        {"resource_type": "storageclass", "health": "unknown", "count": 0},
    ]


def test_inventory_summary_filters_counts_and_projects_agent_visibility_evidence() -> None:
    class EvidenceInventoryDb(StubInventoryDb):
        def latest_inventory_snapshot(
            self,
            workspace_id: str,
            cluster_id: str,
        ) -> dict[str, object]:
            assert (workspace_id, cluster_id) == ("ws-1", "cluster-1")
            return {
                "snapshot_id": "snapshot-visibility-1",
                "agent_id": "cluster-agent-7d9",
                "collected_at": "2026-07-17T12:00:00Z",
                "summary": {
                    "summary": {
                        "resources_complete": True,
                        "namespaces": ["shop"],
                        "api_resource_discovery": {
                            "observed_at": "2026-07-17T12:00:00Z",
                            "completeness": "exact",
                            "reason_codes": [],
                            "resources": [
                                {
                                    "group": "",
                                    "version": "v1",
                                    "api_version": "v1",
                                    "name": "pods",
                                    "singular_name": "pod",
                                    "kind": "Pod",
                                    "namespaced": True,
                                    "is_crd": False,
                                    "verbs": ["get", "list", "watch"],
                                },
                                {
                                    "group": "apps",
                                    "version": "v1",
                                    "api_version": "apps/v1",
                                    "name": "deployments",
                                    "singular_name": "deployment",
                                    "kind": "Deployment",
                                    "namespaced": True,
                                    "is_crd": False,
                                    "verbs": ["get", "list", "watch"],
                                },
                            ],
                        },
                        "resource_access": {
                            "completeness": "exact",
                            "observed_at": "2026-07-17T12:00:00Z",
                            "reason_codes": [],
                            "roles": [
                                {
                                    "kind": "Role",
                                    "namespace": "shop",
                                    "name": "pod-reader",
                                    "rules": [
                                        {
                                            "verbs": ["get", "list"],
                                            "apiGroups": [""],
                                            "resources": ["pods"],
                                        }
                                    ],
                                }
                            ],
                            "cluster_roles": [],
                            "role_bindings": [
                                {
                                    "kind": "RoleBinding",
                                    "namespace": "shop",
                                    "name": "pod-reader",
                                    "roleRef": {"kind": "Role", "name": "pod-reader"},
                                    "subjects": [
                                        {
                                            "kind": "ServiceAccount",
                                            "namespace": "agent-system",
                                            "name": "cluster-agent",
                                        }
                                    ],
                                }
                            ],
                            "cluster_role_bindings": [],
                            "service_accounts": [
                                {"namespace": "agent-system", "name": "cluster-agent"}
                            ],
                            "pod_subjects": [
                                {
                                    "uid": "agent-pod-uid",
                                    "namespace": "agent-system",
                                    "name": "cluster-agent-7d9",
                                    "service_account_name": "cluster-agent",
                                }
                            ],
                        },
                    }
                },
            }

        def inventory_product_resource_counts(
            self,
            workspace_id: str,
            cluster_id: str,
            *,
            namespaces: tuple[str, ...] = (),
        ) -> list[dict[str, object]]:
            assert (workspace_id, cluster_id, namespaces) == ("ws-1", "cluster-1", ("shop",))
            return [{"resource_type": "pod", "health": "healthy", "count": 2}]

    async def run():
        return await get_inventory_summary(
            "cluster-1",
            namespaces="shop",
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=EvidenceInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.counts == [
        {"resource_type": "deployment", "health": "unknown", "count": 0},
        {"resource_type": "pod", "health": "healthy", "count": 2},
    ]
    assert response.counts_evidence.completeness == "observed"
    assert response.counts_evidence.namespace_scope == ("shop",)
    assert response.counts_evidence.reason_codes == ()
    assert response.counts_evidence.observed_at == "2026-07-17T12:00:00+00:00"
    assert [item.model_dump() for item in response.counts_evidence.forbidden] == [
        {
            "namespace": "shop",
            "api_group": "apps",
            "version": "v1",
            "resource": "deployments",
            "kind": "Deployment",
            "namespaced": True,
            "reason_code": "list_permission_not_observed",
        }
    ]


def test_cluster_api_resources_returns_latest_dynamic_catalog() -> None:
    class DiscoveryInventoryDb(StubInventoryDb):
        def latest_inventory_snapshot(
            self,
            workspace_id: str,
            cluster_id: str,
        ) -> dict[str, object]:
            assert workspace_id == "ws-1"
            assert cluster_id == "cluster-1"
            return {
                "snapshot_id": "snapshot-api-1",
                "summary": {
                    "summary": {
                        "api_resource_discovery": {
                            "observed_at": "2026-07-16T12:00:00Z",
                            "completeness": "exact",
                            "reason_codes": [],
                            "resources": [
                                {
                                    "group": "stable.example.com",
                                    "version": "v1",
                                    "api_version": "stable.example.com/v1",
                                    "name": "crontabs",
                                    "singular_name": "crontab",
                                    "kind": "CronTab",
                                    "namespaced": True,
                                    "is_crd": True,
                                    "verbs": ["delete", "get", "list"],
                                }
                            ],
                        }
                    }
                },
            }

    async def run():
        return await get_cluster_api_resources(
            "cluster-1",
            current=type(
                "Current",
                (),
                {"user_id": "user-1", "workspace_id": "ws-1"},
            )(),
            db=DiscoveryInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.snapshot_id == "snapshot-api-1"
    assert response.unavailable_reason is None
    assert response.discovery is not None
    assert response.discovery.resources[0].kind == "CronTab"
    assert response.discovery.resources[0].is_crd is True


def test_cluster_api_resources_fails_closed_without_observation() -> None:
    async def run():
        return await get_cluster_api_resources(
            "cluster-1",
            current=type(
                "Current",
                (),
                {"user_id": "user-1", "workspace_id": "ws-1"},
            )(),
            db=StubInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.snapshot_id == "snapshot-1"
    assert response.discovery is None
    assert response.unavailable_reason == "api_resource_discovery_not_observed"


def test_management_cluster_inventory_read_remains_available() -> None:
    class ManagementInventoryDb(StubInventoryDb):
        def can_access(
            self,
            _user_id: str,
            _workspace_id: str,
            _resource_type: str,
            resource_id: str,
            permission: str,
        ) -> bool:
            return resource_id == "kubernetes-ops" and permission == "inventory.read"

    async def run():
        return await get_inventory_summary(
            "kubernetes-ops",
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=ManagementInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.cluster_id == "kubernetes-ops"
    assert response.latest_snapshot == {"snapshot_id": "snapshot-1", "resource_count": 1}


def test_first_container_image_extracts_workload_pod_then_summary() -> None:
    # diff-worker actual-state 조회용 — workload spec 우선, 그 다음 pod spec, 마지막 summary
    workload = {
        "spec": {"template": {"spec": {"containers": [{"name": "app", "image": "img:v2"}]}}}
    }
    assert first_container_image(workload, {}) == "img:v2"
    assert first_container_image({"spec": {"containers": [{"image": "img:pod"}]}}, {}) == "img:pod"
    assert first_container_image({}, {"image": "img:sum"}) == "img:sum"
    assert first_container_image({}, {}) is None
    assert first_container_image({"spec": {"containers": [{}]}}, {}) is None


def test_kubernetes_evidence_snapshot_fills_measured_usage_rollup() -> None:
    """usage 는 agent 가 관측한 값의 집계 — 항상 빈 dict 이던 죽은 경로를 실측으로."""
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {
            "pods": [
                {
                    "name": "a",
                    "namespace": "default",
                    "phase": "Running",
                    "restart_total": 2,
                    "cpu_mcores": 120.5,
                    "mem_mib": 64,
                },
                {"name": "b", "phase": "Pending", "restart_total": 0},
                {"name": "c", "phase": "Running", "restart_total": 5},
            ],
            "nodes": [
                {
                    "name": "n1",
                    "ready": True,
                    "cpu_mcores": 200,
                    "mem_mib": 512,
                    "cpu_ratio": 0.1,
                    "mem_ratio": 0.25,
                },
                {
                    "name": "n2",
                    "ready": False,
                    "cpu_mcores": 300,
                    "mem_mib": 1024,
                    "cpu_ratio": 0.3,
                    "mem_ratio": 0.5,
                },
            ],
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    assert snapshot["usage"] == {
        "pod_total": 3,
        "pod_running": 2,
        "pod_pending": 1,
        "pod_failed": 0,
        "restart_total": 7,
        "node_total": 2,
        "node_ready": 1,
        "pods": {"default/a": {"cpu_mcores": 120.5, "mem_mib": 64.0}},
        "nodes": {
            "n1": {
                "cpu_mcores": 200.0,
                "mem_mib": 512.0,
                "cpu_ratio": 0.1,
                "mem_ratio": 0.25,
                "cpu_pct": 10.0,
                "mem_pct": 25.0,
            },
            "n2": {
                "cpu_mcores": 300.0,
                "mem_mib": 1024.0,
                "cpu_ratio": 0.3,
                "mem_ratio": 0.5,
                "cpu_pct": 30.0,
                "mem_pct": 50.0,
            },
        },
        "cpu_pct": 20.0,
        "mem_pct": 37.5,
    }


def test_kubernetes_evidence_snapshot_usage_empty_when_nothing_observed() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {}, cluster_id="cluster-1", agent_id="agent-1"
    )
    assert snapshot["usage"] == {}


def test_label_scoped_evidence_snapshot_is_not_authoritative_fleet_liveness() -> None:
    normal = kubernetes_evidence_to_inventory_snapshot(
        {"collection_scopes": [{"namespace": "production", "label_selector": None}]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )
    rca_test = kubernetes_evidence_to_inventory_snapshot(
        {
            "collection_scopes": [
                {
                    "namespace": "production",
                    "label_selector": "kubeheal.io/rca-test-run=run-1",
                }
            ]
        },
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    assert normal["summary"]["live_inventory"] is True
    assert rca_test["summary"]["live_inventory"] is False


def test_kubernetes_evidence_snapshot_preserves_detected_provider() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"detected_provider": "gke", "nodes": [{"name": "node-1", "ready": True}]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    assert snapshot["summary"]["detected_provider"] == "gke"


def test_inventory_snapshot_allows_a_legitimate_payload_larger_than_edge_default() -> None:
    snapshot = InventorySnapshotRequest(
        cluster_id="cluster-1",
        agent_id="agent-1",
        resources=[
            InventoryResource(
                resource_type="custom_resource",
                api_version="example.io/v1",
                kind="LargeResource",
                name="large-resource",
                raw={"payload": "x" * 3_000_000},
            )
        ],
    )

    assert len(snapshot.resources[0].raw["payload"]) == 3_000_000


def test_inventory_snapshot_rejects_payload_beyond_the_documented_edge_limit() -> None:
    with pytest.raises(ValueError, match="inventory payload exceeds size limit"):
        InventorySnapshotRequest(
            cluster_id="cluster-1",
            agent_id="agent-1",
            resources=[
                InventoryResource(
                    resource_type="custom_resource",
                    api_version="example.io/v1",
                    kind="LargeResource",
                    name="oversized-resource",
                    raw={"payload": "x" * 17_000_000},
                )
            ],
        )
