from __future__ import annotations

import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class GitOpsDetailDb:
    def __init__(self, *, allow_manage: bool = True) -> None:
        self.allow_manage = allow_manage

    def can_access(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        return (
            workspace_id == "workspace-a"
            and resource_type == "application"
            and resource_id == "app-a"
            and permission == Permission.APPLICATION_READ.value
        )

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "application":
            return (
                {"app-a"}
                if self.allow_manage and permission == Permission.APPLICATION_MANAGE.value
                else set()
            )
        if resource_type == "cluster" and permission in {
            Permission.INVENTORY_READ.value,
            Permission.DEPLOY_RUN.value,
        }:
            return {"cluster-a"}
        return set()

    def get_application(self, workspace_id: str, application_id: str) -> dict[str, object] | None:
        if (workspace_id, application_id) != ("workspace-a", "app-a"):
            return None
        return {
            "application_id": "app-a",
            "workspace_id": "workspace-a",
            "name": "storefront",
            "repo_ref": "opsia/storefront",
            "default_branch": "main",
            "manifest_path": "deploy/production",
        }

    def list_application_deployment_bindings(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert (workspace_id, application_id, limit) == ("workspace-a", "app-a", 500)
        return [
            {
                "cluster_id": "cluster-a",
                "namespace": "storefront",
                "gitops_poll": {"last_seen_commit_sha": "abc123"},
            },
            {
                "cluster_id": "not-authorized-cluster",
                "namespace": "private",
                "gitops_poll": {"last_seen_commit_sha": "must-not-leak"},
            },
        ]

    def list_application_workflow_runs(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert (workspace_id, application_id, limit) == ("workspace-a", "app-a", 100)
        return [
            {
                "workflow_run_id": "run-visible",
                "cluster_id": "cluster-a",
                "commit_sha": "visible-revision",
                "status": "applying",
                "updated_at": "2026-07-16T09:00:00Z",
            },
            {
                "workflow_run_id": "run-hidden",
                "cluster_id": "not-authorized-cluster",
                "commit_sha": "must-not-leak",
                "status": "succeeded",
                "updated_at": "2026-07-16T10:00:00Z",
            },
        ]


def _client(db: GitOpsDetailDb) -> TestClient:
    module = importlib.import_module("domains.gitops.detail_router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_detail_is_rbac_filtered_and_never_returns_a_browser_diff() -> None:
    response = _client(GitOpsDetailDb()).get("/gitops/applications/app-a")

    assert response.status_code == 200
    body = response.json()["application"]
    assert body["resource"] == {
        "api_group": "opsia.io",
        "version": "v1",
        "kind": "GitOpsApplication",
        "namespace": "storefront",
        "name": "storefront",
        "uid": "app-a",
    }
    assert body["scope"]["scope"]["cluster_id"] == "cluster-a"
    assert body["desired_live_diff"] == {
        "availability": "unavailable",
        "source_revision": "visible-revision",
        "live_observation_revision": None,
        "reason_code": "live_observation_not_integrated",
    }
    assert body["operation"]["in_progress"] is True
    assert body["capabilities"][1] == {
        "action": "sync",
        "authorization": "denied",
        "availability": "unavailable",
        "enabled": False,
        "operation_blocked": False,
        "reason_code": "not_authorized",
    }
    assert "must-not-leak" not in response.text
    assert '"diff"' not in response.text


def test_detail_reports_denied_actions_explicitly() -> None:
    response = _client(GitOpsDetailDb(allow_manage=False)).get("/gitops/applications/app-a")

    assert response.status_code == 200
    assert response.json()["application"]["capabilities"] == [
        {
            "action": "refresh",
            "authorization": "denied",
            "availability": "unavailable",
            "enabled": False,
            "operation_blocked": False,
            "reason_code": "not_authorized",
        },
        {
            "action": "sync",
            "authorization": "denied",
            "availability": "unavailable",
            "enabled": False,
            "operation_blocked": False,
            "reason_code": "not_authorized",
        },
    ]
