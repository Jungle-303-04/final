from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.identity.dependencies import require_session
from domains.workload_detail.router import router
from packages.contracts.identity import Permission
from packages.contracts.rightsizing import RightsizingMetricRecommendation
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"


def resource() -> dict[str, object]:
    return {
        "api_group": "apps",
        "version": "v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "deployment-uid",
    }


def provenance() -> dict[str, object]:
    return {
        "collector": "metrics-repository",
        "algorithm_revision": "2026-07",
        "source_revision": "metrics-cut-17",
        "window_started_at": "2026-07-09T09:00:00Z",
        "window_ended_at": "2026-07-16T09:00:00Z",
        "sample_interval_seconds": 300,
    }


def observed_workload() -> dict[str, object]:
    return {
        "availability": "partial",
        "resource": resource(),
        "observed_at": "2026-07-16T09:00:00Z",
        "freshness": "live",
        "provenance": provenance(),
        "replicas": 2,
        "scaled_to_zero": False,
        "classification": "review",
        "impact": {
            "replicas": 2,
            "cpu_millicores_change": 0,
            "memory_bytes_change": 0,
        },
        "rows": [
            {
                "container": "server",
                "resource": "cpu",
                "fit": "oversized",
                "action": "review",
                "confidence": "medium",
                "current_request": {"unit": "millicores", "value": 500},
                "observed_demand": {"unit": "millicores", "value": 180},
                "recommended_request": None,
                "sample_count": 1_900,
                "expected_samples": 2_016,
                "coverage_basis_points": 9_424,
                "signals": ["bursty"],
                "reason_codes": ["bursty_cpu_review"],
            }
        ],
        "reason_codes": ["partial_container_evidence"],
    }


class RightsizingDb:
    def __init__(self, *, allowed: bool = True, repository: bool = True) -> None:
        self.allowed = allowed
        self.repository = repository
        self.scan_calls: list[dict[str, Any]] = []

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

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, str]]:
        assert workspace_id == WORKSPACE_ID
        return {
            cluster_id: {"last_seen_at": datetime.now(UTC).isoformat()}
            for cluster_id in cluster_ids
        }

    def list_rightsizing_observations(self, **query: Any) -> dict[str, object] | None:
        if not self.repository:
            return None
        self.scan_calls.append(dict(query))
        return {
            "availability": "partial",
            "observed_at": "2026-07-16T09:00:00Z",
            "provenance": provenance(),
            "coverage": {
                "workloads_discovered": 2,
                "workloads_evaluated": 2,
                "workloads_with_data": 1,
                "truncated": False,
            },
            "workloads": [observed_workload()],
            "failures": [
                {
                    "resource": None,
                    "reason_code": "one_workload_metrics_unavailable",
                }
            ],
            "reason_codes": ["partial_workload_metrics"],
        }


def client(db: RightsizingDb) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id=WORKSPACE_ID,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_rightsizing_contract_enforces_safe_units_and_server_actions() -> None:
    with pytest.raises(ValidationError, match="unit must match"):
        RightsizingMetricRecommendation.model_validate(
            observed_workload()["rows"][0]  # type: ignore[index]
            | {
                "resource": "memory",
                "current_request": {"unit": "millicores", "value": 500},
            }
        )

    with pytest.raises(ValidationError, match="requires a recommendation"):
        RightsizingMetricRecommendation.model_validate(
            observed_workload()["rows"][0]  # type: ignore[index]
            | {"action": "reduction", "recommended_request": None}
        )


def test_rightsizing_scan_is_rbac_bound_bounded_and_preserves_partial_failures() -> None:
    db = RightsizingDb()
    response = client(db).get(
        "/rightsizing/workloads",
        params={
            "cluster_id": CLUSTER_ID,
            "namespaces": "staging,shop,shop",
            "limit": 50,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scope"]["freshness"] == "live"
    assert body["namespace_scope"] == ["shop", "staging"]
    assert body["result"]["availability"] == "partial"
    assert body["result"]["coverage"]["workloads_with_data"] == 1
    assert body["result"]["failures"] == [
        {"resource": None, "reason_code": "one_workload_metrics_unavailable"}
    ]
    assert body["refresh_after_seconds"] == 600
    assert db.scan_calls == [
        {
            "workspace_id": WORKSPACE_ID,
            "cluster_id": CLUSTER_ID,
            "namespaces": ("shop", "staging"),
            "limit": 50,
        }
    ]

    assert (
        client(RightsizingDb(allowed=False))
        .get(
            "/rightsizing/workloads",
            params={"cluster_id": CLUSTER_ID},
        )
        .status_code
        == 403
    )
    assert (
        client(RightsizingDb())
        .get(
            "/rightsizing/workloads",
            params={"cluster_id": CLUSTER_ID, "limit": 201},
        )
        .status_code
        == 422
    )


def test_rightsizing_scan_does_not_invent_results_without_a_repository() -> None:
    response = client(RightsizingDb(repository=False)).get(
        "/rightsizing/workloads",
        params={"cluster_id": CLUSTER_ID},
    )

    assert response.status_code == 200
    assert response.json()["result"] == {
        "availability": "unavailable",
        "reason_codes": ["rightsizing_observation_not_integrated"],
    }
