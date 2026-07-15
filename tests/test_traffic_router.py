from __future__ import annotations

import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class TrafficDb:
    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a", "cluster-b"}
        return set()

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": 11,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": cluster_id == "cluster-a",
                "application_bindings_complete": True,
                "partial_reason_codes": []
                if cluster_id == "cluster-a"
                else ["agent_snapshot_truncated"],
            }
            for cluster_id in cluster_ids
        }


def _client() -> TestClient:
    module = importlib.import_module("domains.traffic.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = TrafficDb
    return TestClient(app)


def test_traffic_overview_is_scope_and_permission_bound_without_fabricating_flows() -> None:
    response = _client().get(
        "/traffic/overview?clusters=cluster-a,cluster-b&namespaces=cluster-a/storefront"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scope_coverage"]["availability"] == "partial"
    assert body["scope_coverage"]["scopes"] == [
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": ["storefront"],
            "freshness": "live",
        },
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-b",
            "namespaces": [],
            "freshness": "partial",
        },
    ]
    assert body["observation"] == {
        "availability": "unavailable",
        "observed_at": None,
        "reason_codes": ["traffic_observation_not_integrated"],
    }
    assert body["summary"]["total_flow_count"] is None
    assert body["relationships"]["edges"] is None


def test_traffic_overview_hides_unauthorized_scope_and_rejects_invalid_namespace_syntax() -> None:
    client = _client()

    denied = client.get("/traffic/overview?clusters=cluster-private")
    invalid = client.get("/traffic/overview?namespaces=not-a-reference")

    assert denied.status_code == 404
    assert invalid.status_code == 422
