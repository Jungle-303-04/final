from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class HelmReleaseDb:
    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a"}
        return set()

    def helm_release_observation_contexts(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": 11,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": True,
                "partial_reason_codes": [],
            }
            for cluster_id in cluster_ids
        }

    def list_helm_storage_observations(
        self,
        *,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        namespaces: tuple[str, ...],
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert set(cluster_ids).issubset({"cluster-a"})
        assert not namespaces or namespaces == ("storefront",)
        return [
            {
                "workspace_id": "workspace-a",
                "cluster_id": "cluster-a",
                "inventory_key": "inventory-storefront-v3",
                "api_version": "v1",
                "kind": "Secret",
                "namespace": "storefront",
                "name": "sh.helm.release.v1.storefront.v3",
                "uid": "uid-storefront-v3",
                "labels": {
                    "owner": "helm",
                    "name": "storefront",
                    "version": "3",
                    "status": "deployed",
                },
                "observed_at": datetime(2026, 7, 16, 9, 0, tzinfo=UTC),
                "raw": {"data": {"release": "must-not-leak"}},
            }
        ]


def _client() -> TestClient:
    module = importlib.import_module("domains.helm.release_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = HelmReleaseDb
    return TestClient(app)


def test_release_list_is_rbac_scoped_and_never_decodes_storage_payload() -> None:
    response = _client().get("/helm/releases?clusters=cluster-a&namespaces=storefront")

    assert response.status_code == 200
    body = response.json()
    assert body["coverage"]["availability"] == "available"
    assert body["releases"][0]["name"] == "storefront"
    assert body["releases"][0]["chart"] is None
    assert body["releases"][0]["resource_health"]["reason_code"] == "owned_resources_not_correlated"
    assert "must-not-leak" not in response.text
    assert '"raw"' not in response.text


def test_release_detail_requires_the_exact_authorized_cluster_scope() -> None:
    client = _client()

    denied = client.get("/helm/releases/storefront/storefront?cluster_id=cluster-private")
    allowed = client.get("/helm/releases/storefront/storefront?cluster_id=cluster-a")

    assert denied.status_code == 404
    assert allowed.status_code == 200
    body = allowed.json()["detail"]
    assert body["commands"] == {
        "availability": "unavailable",
        "reason_code": "agent_helm_executor_not_integrated",
    }
    assert body["values"]["reason_code"] == "helm_values_provider_not_integrated"


def test_release_list_hides_an_unauthorized_requested_scope() -> None:
    response = _client().get("/helm/releases?clusters=cluster-private")

    assert response.status_code == 404
