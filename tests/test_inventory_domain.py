from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from domains.identity.dependencies import ClusterAgentIdentity
from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.inventory.repository import (
    HEALTH_RESOURCE_TYPE,
    USAGE_RESOURCE_TYPE,
    first_container_image,
    inventory_resource_key,
    snapshot_resources,
)
from domains.inventory.router import (
    get_inventory_summary,
    list_inventory_workloads,
    record_inventory_snapshot,
)
from packages.contracts.gateway.requests import InventoryResource, InventorySnapshotRequest


class FakeInventoryDb:
    def __init__(self) -> None:
        self.saved: dict[str, object] | None = None

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
        assert resource_type == "workload"
        assert namespace == "default"
        assert include_deleted is False
        assert limit == 25
        return [inventory_resource("workload", "Deployment", "api")]

    def latest_inventory_snapshot(
        self,
        _workspace_id: str,
        _cluster_id: str,
    ) -> dict[str, object]:
        return {"snapshot_id": "snapshot-1", "resource_count": 1}

    def inventory_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
    ) -> list[dict[str, object]]:
        return [{"resource_type": "workload", "health": "healthy", "count": 1}]


class FakeInventoryEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.accepted.append(body)


def inventory_resource(resource_type: str, kind: str, name: str) -> dict[str, object]:
    return {
        "inventory_key": f"{resource_type}:{name}",
        "snapshot_id": "snapshot-1",
        "workspace_id": "ws-1",
        "cluster_id": "cluster-1",
        "resource_type": resource_type,
        "api_version": "apps/v1",
        "kind": kind,
        "namespace": "default",
        "name": name,
        "uid": "uid-1",
        "resource_version": "1",
        "status": "running",
        "health": "healthy",
        "labels": {},
        "annotations": {},
        "summary": {"ready_replicas": 1},
        "raw": {},
        "observed_at": "2026-07-05T00:00:00+00:00",
        "first_seen_at": "2026-07-05T00:00:00+00:00",
        "last_seen_at": "2026-07-05T00:00:00+00:00",
        "deleted_at": None,
        "created_at": "2026-07-05T00:00:00+00:00",
        "updated_at": "2026-07-05T00:00:00+00:00",
    }


def test_inventory_resource_key_is_stable_for_same_kubernetes_identity() -> None:
    first = inventory_resource_key("ws-1", "cluster-1", "workload", "default", "Deployment", "api")
    second = inventory_resource_key("ws-1", "cluster-1", "workload", "default", "Deployment", "api")

    assert first == second
    assert first != inventory_resource_key(
        "ws-1", "cluster-1", "workload", "prod", "Deployment", "api"
    )


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


def test_inventory_snapshot_route_uses_agent_identity_scope() -> None:
    db = FakeInventoryDb()
    events = FakeInventoryEvents()

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
            db=FakeInventoryDb(),
            events=FakeInventoryEvents(),
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
            db=FakeInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.resource_type == "workload"
    assert response.resources[0].kind == "Deployment"
    assert response.resources[0].summary == {"ready_replicas": 1}


def test_inventory_summary_route_returns_latest_snapshot_and_counts() -> None:
    async def run():
        return await get_inventory_summary(
            "cluster-1",
            current=type("Current", (), {"user_id": "user-1", "workspace_id": "ws-1"})(),
            db=FakeInventoryDb(),
        )

    response = asyncio.run(run())

    assert response.latest_snapshot == {"snapshot_id": "snapshot-1", "resource_count": 1}
    assert response.counts == [{"resource_type": "workload", "health": "healthy", "count": 1}]


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
                {"name": "a", "phase": "Running", "restart_total": 2},
                {"name": "b", "phase": "Pending", "restart_total": 0},
                {"name": "c", "phase": "Running", "restart_total": 5},
            ],
            "nodes": [
                {"name": "n1", "ready": True},
                {"name": "n2", "ready": False},
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
    }


def test_kubernetes_evidence_snapshot_usage_empty_when_nothing_observed() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {}, cluster_id="cluster-1", agent_id="agent-1"
    )
    assert snapshot["usage"] == {}
