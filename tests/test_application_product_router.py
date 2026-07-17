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
        return [
            {
                "binding_id": "binding-prod-a",
                "cluster_id": "cluster-a",
                "namespace": "shop",
                "environment": "prod",
                "status": "active",
            },
            {
                "binding_id": "binding-hidden-b",
                "cluster_id": "cluster-b",
                "namespace": "shop",
                "environment": "stage",
                "status": "active",
            },
        ]

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
                "binding_id": "binding-prod-a",
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

    def get_application_catalog_states(
        self,
        *,
        workspace_id: str,
        application_ids: list[str],
        allowed_cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert application_ids == ["app-a"]
        assert allowed_cluster_ids == {"cluster-a"}
        return {
            "app-a": {
                "bindings": [
                    binding
                    for binding in self.list_application_deployment_bindings(
                        workspace_id,
                        "app-a",
                        limit=500,
                    )
                    if binding["cluster_id"] in allowed_cluster_ids
                ],
                "runs": [
                    run
                    for run in self.list_application_workflow_runs(
                        workspace_id,
                        "app-a",
                        limit=100,
                    )
                    if run["cluster_id"] in allowed_cluster_ids
                ],
                "inventory_rows": self.get_application_inventory_evidence(
                    workspace_id=workspace_id,
                    application_id="app-a",
                    allowed_cluster_ids=allowed_cluster_ids,
                ),
                "inventory_context": self.filter_snapshot_context(
                    workspace_id,
                    allowed_cluster_ids,
                ),
                "incident_evidence": self.get_application_incident_evidence(
                    workspace_id=workspace_id,
                    application_id="app-a",
                    allowed_cluster_ids=allowed_cluster_ids,
                    limit=3,
                ),
            }
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


class WorkloadProductApplicationsDb(ProductApplicationsDb):
    def get_application_inventory_evidence(self, **_kwargs: Any) -> list[dict[str, object]]:
        return [
            {
                "id": "workload-a",
                "cluster_id": "cluster-a",
                "resource_type": "workload",
                "api_version": "apps/v1",
                "kind": "Deployment",
                "namespace": "shop",
                "name": "checkout",
                "uid": "deployment-uid",
                "status": "1/1",
                "health": "healthy",
                "labels": {"app": "checkout"},
                "binding_complete": True,
                "summary": {"selector": {"matchLabels": {"app": "checkout"}}},
                "observed_at": "2026-07-14T10:00:00Z",
            }
        ]

    def filter_snapshot_context(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, object]:
        context = super().filter_snapshot_context(workspace_id, cluster_ids)
        return context | {"labels_complete": True, "observed_at": "2026-07-14T10:00:00Z"}

    def get_application_workload_runtime_evidence(self, **kwargs: Any) -> dict[str, object]:
        assert kwargs == {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespace": "shop",
            "pod_limit": 199,
        }
        return {
            "truncated": False,
            "rows": [
                {
                    "id": "pod-a",
                    "cluster_id": "cluster-a",
                    "resource_type": "pod",
                    "api_version": "v1",
                    "kind": "Pod",
                    "namespace": "shop",
                    "name": "checkout-a",
                    "uid": "pod-uid",
                    "status": "Running",
                    "health": "healthy",
                    "labels": {"app": "checkout"},
                    "summary": {
                        "owner_kind": "Deployment",
                        "owner_name": "checkout",
                        "owner_uid": "deployment-uid",
                        "owner_references_complete": True,
                        "conditions": [{"type": "Ready", "status": "True"}],
                        "restart_total": 0,
                    },
                    "observed_at": "2026-07-14T10:00:00Z",
                }
            ],
        }

    def list_cost_evidence_windows(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        *,
        since: Any,
        limit_per_cluster: int = 480,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert cluster_ids == ("cluster-a",)
        assert limit_per_cluster == 480
        assert since.tzinfo is not None

        def window(observed_at: str, cpu: float, memory: float) -> dict[str, object]:
            def result(value: float) -> dict[str, object]:
                return {
                    "samples": [
                        {
                            "metric": {"namespace": "shop", "pod": "checkout-a"},
                            "value": value,
                        }
                    ]
                }

            return {
                "cluster_id": "cluster-a",
                "updated_at": observed_at,
                "payload": {
                    "cluster_id": "cluster-a",
                    "metrics": {
                        "results": {
                            "opencost_pod_cpu_hourly_rate": result(cpu),
                            "opencost_pod_memory_hourly_rate": result(memory),
                            "opencost_pod_cpu_allocation_use": result(0.25),
                            "opencost_pod_memory_allocation_use": result(0.4),
                        }
                    },
                },
            }

        return [
            window("2026-07-14T09:00:00Z", 0.15, 0.1),
            window("2026-07-14T10:00:00Z", 0.18, 0.12),
        ]


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
    assert detail.json()["application"]["recent_incidents"] == []
    assert detail.json()["application"]["scope"] == {
        "availability": "available",
        "completeness": "exact",
        "selected_instance_id": "binding-prod-a",
        "instances": [
            {
                "id": "binding-prod-a",
                "environment": "prod",
                "status": "active",
                "scope": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "cluster-a",
                    "namespaces": ["shop"],
                    "freshness": "disconnected",
                },
            }
        ],
        "partial_reason_codes": [],
        "selected_scope": "application",
        "workload_scope": {
            "availability": "available",
            "completeness": "exact",
            "application_scope_available": True,
            "selected_workload_key": None,
            "workloads": [],
            "partial_reason_codes": [],
        },
    }
    assert detail.json()["application"]["topology"]["availability"] == "available"
    assert detail.json()["application"]["history"]["partial_reason_codes"] == [
        "bounded_workflow_history",
        "incident_source_incomplete",
        "instance_incident_scope_unavailable",
    ]
    assert detail.json()["application"]["source"]["repository_ref"] == "org/checkout"
    assert deployments.json()["deployments"][0]["id"] == "run-a"
    assert drift.json()["differences"][0]["field_path"] == "spec.replicas"
    assert "must-not-leak" not in " ".join((listed.text, detail.text, deployments.text, drift.text))


def test_product_application_instance_scope_rejects_unavailable_direct_urls() -> None:
    client = _client(ProductApplicationsDb())

    selected = client.get("/applications/app-a", params={"instance": "binding-prod-a"})
    denied = client.get("/applications/app-a", params={"instance": "binding-hidden-b"})
    denied_deployments = client.get(
        "/applications/app-a/deployments",
        params={"instance": "binding-hidden-b"},
    )
    denied_drift = client.get(
        "/applications/app-a/drift",
        params={"instance": "binding-hidden-b"},
    )

    assert selected.status_code == 200
    assert selected.json()["application"]["scope"]["selected_instance_id"] == "binding-prod-a"
    assert denied.status_code == 404
    assert "binding-hidden-b" not in denied.text
    assert denied_deployments.status_code == denied_drift.status_code == 404
    assert "binding-hidden-b" not in (denied_deployments.text + denied_drift.text)


def test_product_application_workload_scope_is_bound_to_authorized_manifest_evidence() -> None:
    client = _client(WorkloadProductApplicationsDb())

    selected = client.get("/applications/app-a", params={"workload": "workload-a"})
    invalid = client.get("/applications/app-a", params={"workload": "not-authorized"})

    assert selected.status_code == invalid.status_code == 200
    selected_application = selected.json()["application"]
    assert selected_application["scope"]["selected_scope"] == "workload"
    assert selected_application["scope"]["workload_scope"] == {
        "availability": "available",
        "completeness": "exact",
        "application_scope_available": False,
        "selected_workload_key": "workload-a",
        "workloads": [
            {
                "key": "workload-a",
                "resource": {
                    "api_group": "apps",
                    "version": "v1",
                    "kind": "Deployment",
                    "namespace": "shop",
                    "name": "checkout",
                    "uid": "deployment-uid",
                },
                "scope": {
                    "workspace_id": "workspace-a",
                    "cluster_id": "cluster-a",
                    "namespaces": ["shop"],
                    "freshness": "disconnected",
                },
                "observed_at": "2026-07-14T10:00:00Z",
            }
        ],
        "partial_reason_codes": [],
    }
    assert selected_application["workload"]["runtime_readiness"]["ready_pods"] == 1
    assert selected_application["workload"]["history"] == {
        "availability": "unavailable",
        "reason_codes": ["workload_history_link_not_persisted"],
    }
    assert selected_application["workload"]["cost"] == {
        "availability": "available",
        "observed_at": "2026-07-14T10:00:00Z",
        "currency": "USD",
        "current": {
            "replicas": 1,
            "hourly_rate_micros": 300000,
            "projected_daily_micros": 7200000,
            "projected_monthly_micros": 219000000,
            "cpu_rate_micros": 180000,
            "memory_rate_micros": 120000,
            "cpu_allocation_use_basis_points": 2500,
            "memory_allocation_use_basis_points": 4000,
            "cpu_usage_window_seconds": 300,
            "memory_usage_window_seconds": 300,
        },
        "trend": {
            "availability": "available",
            "range": "24h",
            "currency": "USD",
            "series": [
                {
                    "key": "workload",
                    "label": "checkout",
                    "points": [
                        {"timestamp": 1784019600, "rate_micros": 250000},
                        {"timestamp": 1784023200, "rate_micros": 300000},
                    ],
                }
            ],
            "reason_codes": [],
        },
        "reason_codes": [],
    }
    assert selected_application["workload"]["actions"]["availability"] == "unavailable"
    assert invalid.json()["application"]["scope"]["selected_scope"] == "application"
    assert invalid.json()["application"]["scope"]["workload_scope"]["selected_workload_key"] is None
    assert invalid.json()["application"]["scope"]["workload_scope"]["partial_reason_codes"] == [
        "requested_workload_unavailable"
    ]
    assert "not-authorized" not in invalid.text


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
    assert {"scope", "topology", "history", "source", "workload"}.issubset(
        schema["components"]["schemas"]["ApplicationProductDetail"]["properties"]
    )
    assert {
        parameter["name"]
        for parameter in schema["paths"]["/applications/{application_id}"]["get"]["parameters"]
    } >= {"application_id", "instance", "workload"}
    assert schema["paths"]["/applications/{application_id}/deployments"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]["$ref"].endswith("ApplicationDeploymentHistoryResponse")
    assert schema["paths"]["/applications/{application_id}/drift"]["get"]["responses"]["200"][
        "content"
    ]["application/json"]["schema"]["$ref"].endswith("ApplicationDriftResponse")
