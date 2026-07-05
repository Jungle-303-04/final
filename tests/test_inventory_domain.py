from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException

from domains.identity.dependencies import ClusterAgentIdentity
from domains.inventory.repository import (
    HEALTH_RESOURCE_TYPE,
    USAGE_RESOURCE_TYPE,
    inventory_resource_key,
    snapshot_resources,
)
from domains.inventory.router import record_inventory_snapshot
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


class FakeInventoryEvents:
    def __init__(self) -> None:
        self.accepted: list[object] = []

    async def accept_body(self, body: object) -> None:
        self.accepted.append(body)


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
