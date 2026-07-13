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
    selector_labels,
    snapshot_resources,
)
from domains.inventory.router import (
    get_inventory_resource_detail,
    get_inventory_summary,
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

    def inventory_resource_counts(
        self,
        _workspace_id: str,
        _cluster_id: str,
    ) -> list[dict[str, object]]:
        return [{"resource_type": "workload", "health": "healthy", "count": 1}]


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


def test_kubernetes_evidence_snapshot_preserves_detected_provider() -> None:
    snapshot = kubernetes_evidence_to_inventory_snapshot(
        {"detected_provider": "gke", "nodes": [{"name": "node-1", "ready": True}]},
        cluster_id="cluster-1",
        agent_id="agent-1",
    )

    assert snapshot["summary"]["detected_provider"] == "gke"
