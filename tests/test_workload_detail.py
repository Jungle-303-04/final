from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.workload_detail.projection import workload_detail_projection
from domains.workload_detail.router import router as workload_detail_router
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
NAMESPACE = "shop"
NAME = "checkout"


def workload(*, api_version: str = "apps/v1", uid: str = "workload-uid") -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "inventory_key": f"workload-{api_version}",
        "snapshot_id": "snapshot-current",
        "resource_type": "workload",
        "api_version": api_version,
        "kind": "Deployment",
        "namespace": NAMESPACE,
        "name": NAME,
        "uid": uid,
        "health": "healthy",
        "labels": {"app.kubernetes.io/name": "checkout"},
        "summary": {
            "desired_replicas": 3,
            "ready_replicas": 3,
            "available_replicas": 3,
            "updated_replicas": 3,
            "unavailable_replicas": 0,
        },
        "observed_at": "2026-07-16T09:00:00+00:00",
    }


def pod() -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "inventory_key": "pod-checkout-1",
        "snapshot_id": "snapshot-current",
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": NAMESPACE,
        "name": "checkout-1",
        "uid": "pod-uid",
        "health": "healthy",
        "observed_at": "2026-07-16T09:00:00+00:00",
    }


def event() -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "inventory_key": "event-checkout-ready",
        "snapshot_id": "snapshot-current",
        "resource_type": "event",
        "api_version": "v1",
        "kind": "Event",
        "namespace": NAMESPACE,
        "name": "checkout-ready",
        "uid": "event-uid",
        "health": "healthy",
        "summary": {
            "type": "Normal",
            "reason": "Ready",
            "count": 1,
            "last_occurrence_at": "2026-07-16T09:00:00+00:00",
        },
    }


class WorkloadDetailDb:
    def __init__(
        self,
        *,
        allowed: bool = True,
        agent_statuses: dict[str, dict[str, str]] | None = None,
        source_complete: bool = True,
    ) -> None:
        self.allowed = allowed
        self.rows = [workload(), workload(api_version="custom.example.io/v1", uid="custom-uid")]
        self.agent_statuses = (
            agent_statuses
            if agent_statuses is not None
            else {
                CLUSTER_ID: {"last_seen_at": datetime.now(UTC).isoformat()},
            }
        )
        self.source_complete = source_complete
        self.identity_calls: list[dict[str, Any]] = []

    def user_has_resource_access(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            self.allowed
            and workspace_id == WORKSPACE_ID
            and resource_type == "cluster"
            and resource_id == CLUSTER_ID
            and permission == Permission.INVENTORY_READ.value
        )

    def get_inventory_resource_by_api_version(self, **identity: Any) -> dict[str, Any] | None:
        self.identity_calls.append(dict(identity))
        for row in self.rows:
            if all(row.get(key) == value for key, value in identity.items()):
                return deepcopy(row)
        return None

    def latest_inventory_snapshot(
        self, workspace_id: str, cluster_id: str
    ) -> dict[str, Any] | None:
        if workspace_id != WORKSPACE_ID or cluster_id != CLUSTER_ID:
            return None
        return {
            "snapshot_id": "snapshot-current",
            "collected_at": "2026-07-16T09:00:00+00:00",
            "summary": {
                "summary": {
                    "resources_complete": self.source_complete,
                    "collection_limits": {"truncated": False},
                }
            },
        }

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, str]]:
        assert workspace_id == WORKSPACE_ID
        return {
            cluster_id: status
            for cluster_id, status in self.agent_statuses.items()
            if cluster_id in cluster_ids
        }

    def list_related_inventory_resources(self, **identity: Any) -> dict[str, list[dict[str, Any]]]:
        assert identity["limit"] == 100
        return {"pods": [pod()]}

    def list_resource_events(self, **identity: Any) -> list[dict[str, Any]]:
        assert identity["limit"] == 50
        return [event()]


def _client(db: WorkloadDetailDb) -> TestClient:
    app = FastAPI()
    app.include_router(workload_detail_router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id=WORKSPACE_ID,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_projection_allowlists_observations_and_uses_existing_sse_kind() -> None:
    detail = workload_detail_projection(
        WorkloadDetailDb(),
        workspace_id=WORKSPACE_ID,
        cluster_id=CLUSTER_ID,
        api_group="apps",
        api_version="v1",
        kind="Deployment",
        namespace=NAMESPACE,
        name=NAME,
    ).model_dump(mode="json")

    assert detail["scope"]["freshness"] == "live"
    assert detail["observation"]["resource"] == {
        "api_group": "apps",
        "version": "v1",
        "kind": "Deployment",
        "namespace": NAMESPACE,
        "name": NAME,
        "uid": "workload-uid",
    }
    assert detail["observation"]["replicas"]["ready"] == 3
    assert detail["pods"]["items"][0]["resource"]["uid"] == "pod-uid"
    assert detail["events"]["items"][0]["reason"] == "Ready"
    assert detail["log_stream"] == {
        "availability": "available",
        "stream_kind": "deployments",
        "reason_codes": [],
    }
    assert detail["capabilities"]["actions"] == []
    assert {feature["name"] for feature in detail["features"]} >= {"yaml", "compare"}
    assert "raw" not in str(detail)
    assert "status" not in detail["observation"]
    assert "message" not in str(detail["events"])


def test_projection_uses_exact_api_version_query_for_same_kind_collision() -> None:
    db = WorkloadDetailDb()
    detail = workload_detail_projection(
        db,
        workspace_id=WORKSPACE_ID,
        cluster_id=CLUSTER_ID,
        api_group="custom.example.io",
        api_version="v1",
        kind="Deployment",
        namespace=NAMESPACE,
        name=NAME,
    )

    assert detail.observation.resource.uid == "custom-uid"
    assert db.identity_calls == [
        {
            "workspace_id": WORKSPACE_ID,
            "cluster_id": CLUSTER_ID,
            "resource_type": "workload",
            "api_version": "custom.example.io/v1",
            "kind": "Deployment",
            "namespace": NAMESPACE,
            "name": NAME,
        }
    ]


def test_projection_exposes_execution_only_from_collected_run_kind_evidence() -> None:
    db = WorkloadDetailDb()
    db.rows[0]["summary"]["scheduled_run_kinds"] = ["Job"]

    detail = workload_detail_projection(
        db,
        workspace_id=WORKSPACE_ID,
        cluster_id=CLUSTER_ID,
        api_group="apps",
        api_version="v1",
        kind="Deployment",
        namespace=NAMESPACE,
        name=NAME,
    )

    execution = next(feature for feature in detail.features if feature.name == "execution")
    assert execution.availability == "available"
    assert execution.reason_codes == ()


def test_route_preserves_camel_case_reference_queries_and_rbac() -> None:
    db = WorkloadDetailDb()
    response = _client(db).get(
        "/workloads/Deployment/shop/checkout",
        params={
            "cluster_id": CLUSTER_ID,
            "apiGroup": "apps",
            "apiVersion": "v1",
        },
    )

    assert response.status_code == 200
    body = response.json()["detail"]
    assert body["observation"]["resource"]["api_group"] == "apps"
    assert body["scope"]["cluster_id"] == CLUSTER_ID
    assert "raw" not in response.text
    assert "summary" not in response.text


def test_route_does_not_fall_back_to_a_same_kind_different_api_group() -> None:
    response = _client(WorkloadDetailDb()).get(
        "/workloads/Deployment/shop/checkout",
        params={
            "cluster_id": CLUSTER_ID,
            "apiGroup": "missing.example.io",
            "apiVersion": "v1",
        },
    )

    assert response.status_code == 404
    assert "missing.example.io" not in response.text


def test_route_closes_unauthorized_and_stale_observations_without_unsafe_data() -> None:
    denied = _client(WorkloadDetailDb(allowed=False)).get(
        "/workloads/Deployment/shop/checkout",
        params={"cluster_id": CLUSTER_ID, "apiGroup": "apps", "apiVersion": "v1"},
    )
    stale = _client(
        WorkloadDetailDb(
            agent_statuses={CLUSTER_ID: {"last_seen_at": "2000-01-01T00:00:00+00:00"}},
            source_complete=False,
        )
    ).get(
        "/workloads/Deployment/shop/checkout",
        params={"cluster_id": CLUSTER_ID, "apiGroup": "apps", "apiVersion": "v1"},
    )

    assert denied.status_code == 403
    assert stale.status_code == 200
    detail = stale.json()["detail"]
    assert detail["scope"]["freshness"] == "stale"
    assert detail["coverage"]["availability"] == "partial"
    assert detail["log_stream"]["availability"] == "unavailable"
