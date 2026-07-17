from __future__ import annotations

import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class GitOpsOverviewDb:
    def __init__(self) -> None:
        self.calls: list[dict[str, object]] = []

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
        if resource_type == "application" and permission == Permission.APPLICATION_READ.value:
            return set()
        return set()

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert (workspace_id, cluster_ids) == ("workspace-a", {"cluster-a"})
        return {
            "cluster-a": {
                "snapshot_revision": 17,
                "observed_at": "2026-07-17T01:02:03Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        }

    def list_gitops_overview(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(kwargs)
        return {
            "registered_rows": [],
            "inventory_rows": [
                {
                    "version_id": 17,
                    "cluster_id": "cluster-a",
                    "api_version": "argoproj.io/v1alpha1",
                    "kind": "Application",
                    "namespace": "argocd",
                    "name": "storefront",
                    "uid": "application-uid",
                    "resource_version": "17",
                    "status": "Synced",
                    "health": "Healthy",
                    "summary": {},
                    "labels": {},
                    "observed_at": "2026-07-17T01:02:03Z",
                    "application_ids": [],
                }
            ],
            "has_more": False,
        }


def _client(db: GitOpsOverviewDb) -> TestClient:
    module = importlib.import_module("domains.gitops.overview_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_controller_rows_do_not_require_registered_application_grants() -> None:
    db = GitOpsOverviewDb()
    response = _client(db).get(
        "/gitops/overview?clusters=cluster-a&namespaces=cluster-a%2Fargocd&q=store"
    )

    assert response.status_code == 200
    assert response.json()["items"][0]["resource"]["name"] == "storefront"
    assert len(db.calls) == 1
    assert db.calls[0]["allowed_cluster_ids"] == {"cluster-a"}
    assert db.calls[0]["allowed_application_ids"] == set()


def test_requested_unauthorized_cluster_is_not_disclosed() -> None:
    response = _client(GitOpsOverviewDb()).get("/gitops/overview?clusters=hidden")

    assert response.status_code == 404
