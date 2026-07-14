from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.gateway.responses import PhysicalTopologyResponse
from packages.runtime.dependencies import get_db


class PhysicalTopologyDb:
    def __init__(self, *, clusters: set[str], complete: bool = True) -> None:
        self.clusters = clusters
        self.complete = complete
        self.data_calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if resource_type == "cluster":
            return set(self.clusters)
        if resource_type == "application":
            return {"app-a"}
        return set()

    def filter_snapshot_context(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str],
        *,
        at_revision: int | None = None,
    ) -> dict[str, Any]:
        self.data_calls.append(
            (
                "snapshot",
                {
                    "workspace_id": workspace_id,
                    "allowed_cluster_ids": set(allowed_cluster_ids),
                    "at_revision": at_revision,
                },
            )
        )
        return {
            "snapshot_revision": 42 if at_revision is None else min(42, at_revision),
            "observed_at": "2026-07-14T05:00:00Z",
            "labels_complete": self.complete,
            "resources_complete": self.complete,
            "application_bindings_complete": self.complete,
            "partial_reason_codes": [] if self.complete else ["inventory_collection_partial"],
        }

    def list_physical_topology_resources(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("topology", dict(kwargs)))
        return {
            "servers": [
                {
                    "inventory_key": "node-key-a",
                    "name": "node-a",
                    "status": "Ready",
                    "summary": {
                        "private": "must-not-leak",
                        "allocatable_cpu_mcores": 1000,
                        "allocatable_mem_mib": 2048,
                        "pod_capacity": 110,
                    },
                }
            ],
            "pods": [
                {
                    "inventory_key": "pod-key-a",
                    "name": "checkout-a",
                    "namespace": "shop",
                    "status": "Running",
                    "health": "healthy",
                    "summary": {
                        "node_name": "node-a",
                        "restart_total": 3,
                        "cpu_request_mcores": 200,
                        "mem_request_mib": 512,
                        "cpu_limit_mcores": 500,
                        "mem_limit_mib": 1024,
                        "secret": "must-not-leak",
                    },
                    "placement_node_name": "node-a",
                    "matches_filter": True,
                }
            ],
            "pod_counts_by_node_name": {"node-a": {"matched": 1, "total": 18}},
            "truncated_by_node_name": {"node-a": 6},
            "unassigned_truncated_count": 0,
            "filtered_count": 1,
            "unfiltered_count": 19,
        }

    def latest_cluster_usage_rollups(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        *,
        samples_per_cluster: int,
    ) -> dict[str, list[dict[str, Any]]]:
        self.data_calls.append(
            (
                "usage",
                {
                    "workspace_id": workspace_id,
                    "cluster_ids": set(cluster_ids),
                    "samples_per_cluster": samples_per_cluster,
                },
            )
        )
        if not self.complete:
            return {}
        cluster_id = next(iter(cluster_ids))
        return {
            cluster_id: [
                {
                    "sampled_at": "2026-07-14T05:01:00Z",
                    "usage": {
                        "nodes": {
                            "node-a": {
                                "cpu_mcores": 420,
                                "mem_mib": 1500,
                                "cpu_ratio": 0.42,
                                "mem_ratio": 0.734,
                            }
                        },
                        "pods": {"shop/checkout-a": {"cpu_mcores": 120.5, "mem_mib": 256}},
                    },
                }
            ]
        }

    def resolve_filter_clusters(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, Any]]:
        self.data_calls.append(
            (
                "clusters",
                {"workspace_id": workspace_id, "cluster_ids": set(cluster_ids)},
            )
        )
        return {
            cluster_id: {"cluster_id": cluster_id, "name": "prod", "provider": "eks"}
            for cluster_id in cluster_ids
        }


def _client(db: PhysicalTopologyDb) -> TestClient:
    module = importlib.import_module("domains.inventory_filter.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_physical_topology_requires_one_authorized_cluster_and_physical_view() -> None:
    db = PhysicalTopologyDb(clusters={"cluster-a", "cluster-b"})
    client = _client(db)

    assert client.get("/topology", params={"view": "physical"}).status_code == 422
    assert (
        client.get(
            "/topology",
            params={"view": "physical", "clusters": "cluster-a,cluster-b"},
        ).status_code
        == 422
    )
    assert (
        client.get(
            "/topology",
            params={"view": "relations", "clusters": "cluster-a"},
        ).status_code
        == 422
    )
    forbidden = client.get(
        "/topology",
        params={"view": "physical", "clusters": "cluster-secret"},
    )
    assert forbidden.status_code == 404
    assert "cluster-secret" not in forbidden.text
    assert db.data_calls == []


def test_physical_topology_uses_authorized_snapshot_and_server_filter_membership() -> None:
    db = PhysicalTopologyDb(clusters={"cluster-a", "cluster-b"})
    response = _client(db).get(
        "/topology",
        params={
            "view": "physical",
            "clusters": "cluster-a",
            "namespaces": "cluster-a/shop",
            "applications": "app-a",
            "labels": "app=checkout",
            "resources.q": "checkout",
            "snapshot_revision": 42,
        },
    )

    assert response.status_code == 200
    body = PhysicalTopologyResponse.model_validate(response.json())
    assert body.cluster.cluster_id == "cluster-a"
    assert body.cluster_projection_revision == 42
    assert body.servers[0].cpu_pct == 42.0
    assert body.servers[0].mem_pct == 73.4
    assert body.servers[0].cpu_mcores == 420.0
    assert body.servers[0].mem_mib == 1500.0
    assert body.servers[0].allocatable_cpu_mcores == 1000.0
    assert body.servers[0].allocatable_mem_mib == 2048.0
    assert body.servers[0].pod_capacity == 110
    assert body.servers[0].matched_pod_count == 1
    assert body.servers[0].total_pod_count == 18
    assert body.pods[0].server_id == "node-key-a"
    assert body.pods[0].matches_filter is True
    assert body.pods[0].usage_pct == 60.2
    assert body.pods[0].cpu_mcores == 120.5
    assert body.pods[0].mem_mib == 256.0
    assert body.pods[0].cpu_request_mcores == 200.0
    assert body.pods[0].mem_request_mib == 512.0
    assert body.pods[0].cpu_limit_mcores == 500.0
    assert body.pods[0].mem_limit_mib == 1024.0
    assert body.pods[0].restarts == 3
    assert body.truncated == {"node-key-a": 6}
    assert body.projection_completeness == "partial"
    assert "topology_pod_budget_exceeded" in body.partial_reason_codes
    assert "secret" not in response.text.casefold()
    assert "private" not in response.text.casefold()

    topology_call = next(call for kind, call in db.data_calls if kind == "topology")
    assert topology_call["workspace_id"] == "workspace-a"
    assert topology_call["allowed_cluster_ids"] == {"cluster-a"}
    assert topology_call["allowed_application_ids"] == {"app-a"}
    assert topology_call["snapshot_revision"] == 42
    assert topology_call["filters"].labels == (("app", "checkout"),)
    assert topology_call["filters"].query == "checkout"


def test_physical_topology_reports_partial_projection_and_missing_metrics_as_null() -> None:
    db = PhysicalTopologyDb(clusters={"cluster-a"}, complete=False)
    response = _client(db).get(
        "/topology",
        params={"view": "physical", "clusters": "cluster-a", "applications": "app-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["projection_completeness"] == "partial"
    assert body["metrics_completeness"] == "unavailable"
    assert body["servers"][0]["cpu_pct"] is None
    assert body["servers"][0]["allocatable_cpu_mcores"] == 1000.0
    assert body["pods"][0]["cpu_request_mcores"] == 200.0
    assert body["servers"][0]["matched_pod_count_completeness"] == "partial"
    assert body["servers"][0]["total_pod_count_completeness"] == "partial"
    assert body["counts"]["filtered_count_completeness"] == "partial"
    assert "inventory_collection_partial" in body["partial_reason_codes"]


def test_physical_topology_rejects_future_snapshot_before_data_queries() -> None:
    db = PhysicalTopologyDb(clusters={"cluster-a"})
    response = _client(db).get(
        "/topology",
        params={"view": "physical", "clusters": "cluster-a", "snapshot_revision": 99},
    )

    assert response.status_code == 422
    assert [kind for kind, _call in db.data_calls] == ["snapshot"]


def test_physical_topology_does_not_mix_latest_metrics_into_historical_snapshot() -> None:
    db = PhysicalTopologyDb(clusters={"cluster-a"})
    response = _client(db).get(
        "/topology",
        params={"view": "physical", "clusters": "cluster-a", "snapshot_revision": 41},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["snapshot"]["snapshot_revision"] == 41
    assert body["cluster_projection_revision"] == 41
    assert body["snapshot"]["stale"] is True
    assert body["metrics_completeness"] == "unavailable"
    assert body["metrics_observed_at"] is None
    assert body["servers"][0]["cpu_pct"] is None
    assert body["pods"][0]["cpu_mcores"] is None
    assert body["pods"][0]["cpu_request_mcores"] == 200.0
