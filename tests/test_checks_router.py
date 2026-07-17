from __future__ import annotations

import importlib
from datetime import UTC, datetime
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

    def latest_inventory_snapshots(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        observed_at = datetime.now(UTC).isoformat()
        return {
            cluster_id: {
                "summary": {
                    "summary": {
                        "checks_observation": {
                            "availability": "available",
                            "observed_at": observed_at,
                            "namespaces": [],
                            "reason_codes": [],
                            "findings": [
                                {
                                    "finding_id": f"finding-{cluster_id}",
                                    "check_id": "workload-limits",
                                    "category": "resources",
                                    "severity": "warning",
                                    "message": "Container limits are not observed.",
                                    "resource": {
                                        "api_group": "apps",
                                        "version": "v1",
                                        "kind": "Deployment",
                                        "namespace": "storefront",
                                        "name": "checkout",
                                        "uid": f"uid-{cluster_id}",
                                    },
                                }
                            ],
                            "catalog": [
                                {
                                    "check_id": "workload-limits",
                                    "title": "Workload limits",
                                    "category": "resources",
                                    "severity": "warning",
                                    "description": "Checks resource limits.",
                                    "remediation": "Set resource limits.",
                                }
                            ],
                            "visibility": {
                                "state": "ok",
                                "namespace_scope": [],
                                "core": {"deployments": "allowed"},
                                "missing_optional_kinds": [],
                            },
                        }
                    }
                }
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


def test_checks_overview_is_scope_and_permission_bound_to_agent_observations() -> None:
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
    assert body["result_set"]["availability"] == "partial"
    assert body["result_set"]["total_check_count"] == 1
    assert body["result_set"]["total_finding_count"] == 2
    assert {finding["cluster_id"] for finding in body["result_set"]["checks"]} == {
        "cluster-a",
        "cluster-b",
    }
    assert body["catalog"]["entries"][0]["check_id"] == "workload-limits"
    assert body["visibility"]["clusters"][0]["state"] == "ok"


def test_checks_detail_resolves_an_agent_reported_catalog_entry() -> None:
    response = _client().get("/checks/workload-limits?clusters=cluster-a")

    assert response.status_code == 200
    body = response.json()
    assert body["detail"]["requested_check_id"] == "workload-limits"
    assert body["detail"]["title"] == "Workload limits"
    assert body["detail"]["affected_resource_count"] == 1
    assert body["detail"]["findings"][0]["cluster_id"] == "cluster-a"


def test_checks_hides_unauthorized_scope_and_rejects_invalid_scope_or_identity() -> None:
    client = _client()

    denied = client.get("/checks/overview?clusters=cluster-private")
    invalid_scope = client.get("/checks/overview?namespaces=not-a-reference")
    invalid_check_id = client.get("/checks/%20workload-limits?clusters=cluster-a")

    assert denied.status_code == 404
    assert invalid_scope.status_code == 422
    assert invalid_check_id.status_code == 422
