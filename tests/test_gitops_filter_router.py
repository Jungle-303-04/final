from __future__ import annotations

import importlib
import json
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
APPLICATION_ID = "app-a"


class GitOpsFilterDb:
    def __init__(self, *, applications: set[str], clusters: set[str]) -> None:
        self.applications = applications
        self.clusters = clusters
        self.data_calls: list[dict[str, Any]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        return set(self.applications if resource_type == "application" else self.clusters)

    def list_filtered_gitops_changes(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(dict(kwargs))
        return {
            "items": [
                {
                    "change_id": "run-1",
                    "application_id": APPLICATION_ID,
                    "repository_id": "repo-a",
                    "binding_id": "binding-a",
                    "cluster_id": CLUSTER_ID,
                    "namespace": "shop",
                    "environment": "production",
                    "revision": "abc123",
                    "status": "waiting_for_approval",
                    "current_step": "approval",
                    "approval_status": "pending",
                    "change_type": None,
                    "summary": "checkout rollout",
                    "updated_at": "2026-07-14T03:00:00Z",
                    "change_type_completeness": "unavailable",
                    "label_projection_completeness": "unavailable",
                    "metadata": {"credential_ref": "must-not-cross-contract"},
                }
            ],
            "filtered_count": 1,
            "unfiltered_count": 1,
            "next_position": None,
            "observed_at": "2026-07-14T03:00:00Z",
            "partial_reason_codes": ["mutable_gitops_projection"],
        }


def _client(db: GitOpsFilterDb) -> TestClient:
    module = importlib.import_module("domains.gitops_filter.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id=WORKSPACE_ID,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    app.state.gitops_filter_cursor_codec = FilterCursorCodec(
        "gitops-filter-test-secret-32-bytes",
        now=lambda: 1_000,
    )
    return TestClient(app)


def test_empty_gitops_grant_returns_exact_empty_without_repository_lookup() -> None:
    db = GitOpsFilterDb(applications=set(), clusters={CLUSTER_ID})

    response = _client(db).get("/gitops/filter-results")

    assert response.status_code == 200
    assert response.json()["counts"]["filtered_count"] == 0
    assert db.data_calls == []


def test_gitops_filter_rejects_unauthorized_scope_without_identifier_leak() -> None:
    db = GitOpsFilterDb(applications={APPLICATION_ID}, clusters={CLUSTER_ID})

    response = _client(db).get(
        "/gitops/filter-results",
        params={"clusters": "cluster-private"},
    )

    assert response.status_code == 404
    assert "private" not in response.text
    assert db.data_calls == []


def test_gitops_filter_delegates_normalized_scope_and_strips_storage_payload() -> None:
    db = GitOpsFilterDb(applications={APPLICATION_ID}, clusters={CLUSTER_ID})

    response = _client(db).get(
        "/gitops/filter-results",
        params={
            "clusters": CLUSTER_ID,
            "namespaces": f"{CLUSTER_ID}/shop",
            "applications": APPLICATION_ID,
            "gitops.environment": "Production",
            "gitops.approval": "Pending",
            "gitops.q": " checkout ",
        },
    )

    assert response.status_code == 200
    filters = db.data_calls[0]["filters"]
    assert filters.environments == ("production",)
    assert filters.approvals == ("pending",)
    assert filters.query == "checkout"
    serialized = json.dumps(response.json(), sort_keys=True).casefold()
    assert "credential_ref" not in serialized
    assert "must-not-cross-contract" not in serialized
