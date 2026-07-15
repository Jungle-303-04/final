from __future__ import annotations

import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class ChecksDb:
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
    module = importlib.import_module("domains.checks.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = ChecksDb
    return TestClient(app)


def test_checks_overview_is_scope_and_permission_bound_without_fabricating_a_clean_result() -> None:
    response = _client().get(
        "/checks/overview?clusters=cluster-a,cluster-b&namespaces=cluster-a/storefront"
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
    assert body["result_set"] == {
        "availability": "unavailable",
        "evaluated_at": None,
        "checks": None,
        "total_check_count": None,
        "total_finding_count": None,
        "reason_codes": ["checks_result_projection_not_integrated"],
    }
    assert body["catalog"]["entries"] is None


def test_checks_detail_is_direct_url_read_but_does_not_assert_a_catalog_entry() -> None:
    response = _client().get("/checks/workload-limits?clusters=cluster-a")

    assert response.status_code == 200
    body = response.json()
    assert body["detail"]["requested_check_id"] == "workload-limits"
    assert body["detail"]["title"] is None
    assert body["detail"]["findings"] is None


def test_checks_hides_unauthorized_scope_and_rejects_invalid_scope_or_identity() -> None:
    client = _client()

    denied = client.get("/checks/overview?clusters=cluster-private")
    invalid_scope = client.get("/checks/overview?namespaces=not-a-reference")
    invalid_check_id = client.get("/checks/%20workload-limits?clusters=cluster-a")

    assert denied.status_code == 404
    assert invalid_scope.status_code == 422
    assert invalid_check_id.status_code == 422
