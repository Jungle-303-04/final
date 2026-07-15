from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.identity import ServiceRole
from packages.runtime.dependencies import get_db


class ProductApplicationsDb:
    def __init__(self) -> None:
        self.query_calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster":
            return {"cluster-a"}
        if resource_type == "application":
            return {"app-a"}
        return set()

    def can_access(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        _permission: str,
    ) -> bool:
        return (
            workspace_id == "workspace-a"
            and resource_type == "application"
            and resource_id == "app-a"
        )

    def list_filtered_applications(self, **kwargs: Any) -> dict[str, object]:
        self.query_calls.append(("filtered", dict(kwargs)))
        return {"items": [{"application_id": "app-a"}], "has_more": False}

    def list_applications(
        self,
        workspace_id: str,
        *,
        application_ids: set[str],
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert application_ids == {"app-a"}
        assert limit == 100
        return [self._application()]

    def get_application(self, workspace_id: str, application_id: str) -> dict[str, object] | None:
        return (
            self._application()
            if workspace_id == "workspace-a" and application_id == "app-a"
            else None
        )

    def list_application_deployment_bindings(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert (workspace_id, application_id, limit) == ("workspace-a", "app-a", 500)
        return [{"cluster_id": "cluster-a", "environment": "prod"}]

    def list_application_workflow_runs(
        self,
        workspace_id: str,
        application_id: str,
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert application_id == "app-a"
        assert limit in {100, 25}
        return [
            {
                "workflow_run_id": "run-a",
                "cluster_id": "cluster-a",
                "environment": "prod",
                "commit_sha": "abc123",
                "status": "succeeded",
                "summary": "deployed checkout",
                "metadata": {
                    "version": "v2",
                    "deployed_by": "user-a",
                    "credential_ref": "must-not-leak",
                },
                "updated_at": "2026-07-14T10:00:00Z",
                "steps": [
                    {
                        "name": "diff",
                        "updated_at": "2026-07-14T09:59:00Z",
                        "details": {
                            "resource": "deployment/checkout",
                            "has_changes": True,
                            "changes": [
                                {
                                    "field_path": "spec.replicas",
                                    "classification": "drift",
                                    "new_desired": 3,
                                    "live": 1,
                                }
                            ],
                        },
                    }
                ],
            }
        ]

    def get_application_inventory_evidence(self, **_kwargs: Any) -> list[dict[str, object]]:
        return [
            {
                "id": "pod-a",
                "resource_type": "pod",
                "kind": "Pod",
                "name": "checkout-a",
                "status": "Running",
                "health": "healthy",
                "binding_complete": True,
                "summary": {
                    "restart_total": 0,
                    "conditions": [{"type": "Ready", "status": "True"}],
                    "image": "ghcr.io/org/checkout:v2@sha256:abc",
                    "secret": "must-not-leak",
                },
            }
        ]

    def filter_snapshot_context(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, object]:
        assert workspace_id == "workspace-a"
        assert cluster_ids == {"cluster-a"}
        return {
            "snapshot_revision": 42,
            "resources_complete": True,
            "application_bindings_complete": True,
        }

    def get_application_incident_evidence(self, **_kwargs: Any) -> dict[str, object]:
        return {
            "complete": True,
            "open_count": 1,
            "items": [
                {
                    "id": "incident-a",
                    "title": "CrashLoopBackOff",
                    "status": "incident_detected",
                    "started_at": "2026-07-14T09:00:00Z",
                    "updated_at": "2026-07-14T09:30:00Z",
                }
            ],
        }

    @staticmethod
    def _application() -> dict[str, object]:
        return {
            "application_id": "app-a",
            "workspace_id": "workspace-a",
            "name": "checkout-api",
            "status": "active",
            "repo_ref": "org/checkout",
            "default_branch": "main",
            "manifest_path": "deploy/checkout.yaml",
            "metadata": {"credential_ref": "must-not-leak"},
        }


class ProductApplicationsWildcardAdminDb(ProductApplicationsDb):
    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str] | None:
        assert workspace_id == "workspace-a"
        assert resource_type in {"cluster", "application"}
        return None

    def list_workspace_cluster_ids(self, workspace_id: str) -> set[str]:
        assert workspace_id == "workspace-a"
        return {"cluster-a"}

    def list_workspace_application_ids(self, workspace_id: str) -> set[str]:
        assert workspace_id == "workspace-a"
        return {"app-a"}


def _client(
    db: ProductApplicationsDb,
    *,
    roles: tuple[str, ...] = ("user",),
) -> TestClient:
    module = importlib.import_module("domains.applications.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=roles,
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_product_application_reads_are_strict_allowlisted_and_linkable() -> None:
    client = _client(ProductApplicationsDb())

    listed = client.get("/applications")
    detail = client.get("/applications/app-a")
    deployments = client.get("/applications/app-a/deployments", params={"limit": 25})
    drift = client.get("/applications/app-a/drift")

    assert (
        listed.status_code
        == detail.status_code
        == deployments.status_code
        == drift.status_code
        == 200
    )
    assert set(listed.json()) == {"applications"}
    assert set(listed.json()["applications"][0]) == {
        "id",
        "name",
        "environments",
        "lifecycle_status",
        "repository_ref",
        "default_branch",
        "manifest_path",
        "health",
        "runtime_readiness",
        "current_deployment",
        "delivery",
        "batch_runtime",
        "has_drift",
        "drift_summary",
        "resource_counts",
        "resource_counts_completeness",
        "open_incidents",
    }
    assert detail.json()["application"]["recent_incidents"][0]["id"] == "incident-a"
    assert deployments.json()["deployments"][0]["id"] == "run-a"
    assert drift.json()["differences"][0]["field_path"] == "spec.replicas"
    assert "must-not-leak" not in " ".join((listed.text, detail.text, deployments.text, drift.text))


def test_product_application_filter_scope_fails_closed_before_projection_query() -> None:
    db = ProductApplicationsDb()
    response = _client(db).get(
        "/applications",
        params={"clusters": "cluster-secret", "applications": "app-a"},
    )

    assert response.status_code == 404
    assert "cluster-secret" not in response.text
    assert db.query_calls == []


def test_product_application_service_admin_wildcard_is_materialized_to_concrete_ids() -> None:
    db = ProductApplicationsWildcardAdminDb()
    response = _client(
        db,
        roles=(ServiceRole.SERVICE_ADMIN.value,),
    ).get("/applications")

    assert response.status_code == 200
    assert response.json()["applications"][0]["id"] == "app-a"
    filtered_call = next(kwargs for name, kwargs in db.query_calls if name == "filtered")
    assert filtered_call["allowed_cluster_ids"] == {"cluster-a"}
    assert filtered_call["allowed_application_ids"] == {"app-a"}


def test_product_application_openapi_exposes_four_strict_bq_contracts() -> None:
    schema = _client(ProductApplicationsDb()).app.openapi()

    assert schema["paths"]["/applications"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("ApplicationProductListResponse")
    assert schema["paths"]["/applications/{application_id}"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]["$ref"].endswith("ApplicationProductDetailResponse")
    assert schema["paths"]["/applications/{application_id}/deployments"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]["$ref"].endswith("ApplicationDeploymentHistoryResponse")
    assert schema["paths"]["/applications/{application_id}/drift"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]["$ref"].endswith("ApplicationDriftResponse")
