from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.compare.projection import compare_resource_pair, parse_compare_target
from domains.compare.router import router as compare_router
from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"


def deployment(name: str, *, snapshot_id: str = "snapshot-current", replicas: int | None = 3) -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "snapshot_id": snapshot_id,
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": name,
        "uid": f"uid-{name}",
        "summary": {
            "desired_replicas": replicas,
            "conditions": [{"type": "Available", "message": "must-not-leak"}],
            "selector": {"matchLabels": {"secret-token": "must-not-leak"}},
        },
        "annotations": {"example.com/token": "must-not-leak"},
        "raw": {"data": "must-not-leak", "status": {"phase": "must-not-leak"}},
        "observed_at": "2026-07-16T09:00:00+00:00",
    }


def service(name: str) -> dict[str, Any]:
    return {
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "snapshot_id": "snapshot-current",
        "resource_type": "service",
        "api_version": "v1",
        "kind": "Service",
        "namespace": "shop",
        "name": name,
        "uid": f"uid-{name}",
        "summary": {
            "type": "LoadBalancer",
            "selector": {"secret-token": "must-not-leak"},
            "ports": [
                {"name": "https", "port": 443, "protocol": "TCP", "targetPort": "https", "nodePort": 30443, "appProtocol": "must-not-leak"},
                {"name": "bad", "port": 70000, "protocol": "TCP"},
            ],
        },
        "annotations": {"example.com/token": "must-not-leak"},
        "raw": {"data": "must-not-leak"},
        "observed_at": "2026-07-16T09:00:00+00:00",
    }


class CompareDb:
    def __init__(self, *, allowed: bool = True, source_complete: bool = True) -> None:
        self.allowed = allowed
        self.source_complete = source_complete
        self.rows = [deployment("api-a"), deployment("api-b"), service("web-a"), service("web-b")]
        self.identity_calls: list[dict[str, Any]] = []
        self.list_calls: list[dict[str, Any]] = []

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

    def list_inventory_resources_by_api_version(self, **identity: Any) -> list[dict[str, Any]]:
        self.list_calls.append(dict(identity))
        return [
            deepcopy(row)
            for row in self.rows
            if row["resource_type"] == identity["resource_type"]
            and row["api_version"] == identity["api_version"]
            and row["kind"].casefold() == identity["kind"].casefold()
        ]

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> dict[str, Any] | None:
        if workspace_id != WORKSPACE_ID or cluster_id != CLUSTER_ID:
            return None
        return {
            "snapshot_id": "snapshot-current",
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
            cluster_id: {"last_seen_at": datetime.now(UTC).isoformat()}
            for cluster_id in cluster_ids
            if cluster_id == CLUSTER_ID
        }


def _client(db: CompareDb) -> TestClient:
    app = FastAPI()
    app.include_router(compare_router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id=WORKSPACE_ID,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_pair_allowlists_only_safe_typed_fields_and_exact_identity() -> None:
    db = CompareDb()
    response = _client(db).get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "a": "shop/api-a", "b": "shop/api-b"},
    )

    assert response.status_code == 200
    body = response.json()["comparison"]
    assert body["descriptor"] == {
        "route_kind": "deployments",
        "api_group": "apps",
        "api_version": "v1",
        "kubernetes_kind": "Deployment",
        "resource_type": "workload",
        "projection_kind": "workload_replicas",
    }
    assert body["a"]["projection"] == {"projection_kind": "workload_replicas", "replicas": 3}
    assert body["a"]["resource"]["uid"] == "uid-api-a"
    assert body["coverage"]["availability"] == "available"
    assert body["presentation"] == {"modes": ["side-by-side", "unified"], "swap": True, "diff_only": True}
    assert "must-not-leak" not in response.text
    for forbidden in ('"raw"', '"summary"', '"annotations"', '"status"', '"labels"', '"secret-token"'):
        assert forbidden not in response.text
    assert {call["api_version"] for call in db.identity_calls} == {"apps/v1"}


def test_service_projection_bounds_ports_without_forwarding_selector_or_unknown_fields() -> None:
    response = _client(CompareDb()).get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "services", "a": "shop/web-a", "b": "shop/web-b"},
    )

    assert response.status_code == 200
    projection = response.json()["comparison"]["a"]["projection"]
    assert projection == {
        "projection_kind": "service_ports",
        "service_type": "LoadBalancer",
        "ports": [{"name": "https", "port": 443, "protocol": "TCP", "target_port_name": "https", "target_port_number": None, "node_port": 30443}],
        "excluded_port_count": 1,
    }
    assert "must-not-leak" not in response.text


def test_candidates_and_pair_keep_snapshot_partial_and_different_side_provenance_honest() -> None:
    db = CompareDb(source_complete=False)
    db.rows[1]["snapshot_id"] = "snapshot-older"
    client = _client(db)

    pair = client.get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "apiVersion": "v1", "a": "shop/api-a", "b": "shop/api-b"},
    )
    candidates = client.get(
        "/compare/candidates",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "apiVersion": "v1"},
    )

    assert pair.status_code == 200
    assert set(pair.json()["comparison"]["coverage"]["reason_codes"]) >= {
        "source_resources_incomplete",
        "resource_not_observed_in_latest_snapshot",
        "sides_observed_in_different_snapshots",
    }
    assert candidates.status_code == 200
    assert candidates.json()["result"]["coverage"]["availability"] == "partial"
    assert db.list_calls[0]["api_version"] == "apps/v1"


def test_rbac_uid_and_unsupported_crd_close_without_a_raw_fallback() -> None:
    denied = _client(CompareDb(allowed=False)).get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "a": "shop/api-a", "b": "shop/api-b"},
    )
    incomplete_db = CompareDb()
    incomplete_db.rows[0]["uid"] = None
    incomplete = _client(incomplete_db).get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "a": "shop/api-a", "b": "shop/api-b"},
    )
    crd = _client(CompareDb()).get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "widgets", "apiGroup": "example.io", "apiVersion": "v1", "a": "shop/a", "b": "shop/b"},
    )

    assert denied.status_code == 403
    assert incomplete.status_code == 409
    assert crd.status_code == 422
    assert "example.io" not in crd.text


def test_descriptor_catalog_is_server_owned_and_pair_rejects_invalid_target_shape() -> None:
    client = _client(CompareDb())
    descriptors = client.get("/compare/descriptors")
    invalid = client.get(
        "/compare/resources",
        params={"cluster_id": CLUSTER_ID, "kind": "deployments", "apiGroup": "apps", "a": "shop/a/b", "b": "shop/api-b"},
    )

    assert descriptors.status_code == 200
    assert {item["route_kind"] for item in descriptors.json()["descriptors"]} == {
        "deployments", "statefulsets", "replicasets", "services"
    }
    assert invalid.status_code == 422


def test_projection_never_uses_generic_kind_lookup() -> None:
    db = CompareDb()
    pair = compare_resource_pair(
        db,
        workspace_id=WORKSPACE_ID,
        cluster_id=CLUSTER_ID,
        route_kind="deployments",
        api_group="apps",
        api_version="v1",
        a=parse_compare_target("shop/api-a"),
        b=parse_compare_target("shop/api-b"),
    )

    assert pair.a.resource.name == "api-a"
    assert not hasattr(db, "get_inventory_resource")
