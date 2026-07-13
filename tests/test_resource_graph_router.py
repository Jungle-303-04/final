from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.gateway.responses import ResourceGraphSnapshotResponse
from packages.runtime.dependencies import get_db


class GraphDb:
    def __init__(self, *, clusters: set[str]) -> None:
        self.clusters = clusters
        self.data_calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        return set(self.clusters) if resource_type == "cluster" else set()

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
            "observed_at": "2026-07-13T14:00:00Z",
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
        }

    def list_filtered_resources(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("resources", dict(kwargs)))
        cluster_id = next(iter(kwargs["allowed_cluster_ids"]))
        return {
            "items": [
                {
                    "resource": {
                        "inventory_key": "deployment-a",
                        "snapshot_id": "snapshot-a",
                        "workspace_id": "workspace-a",
                        "cluster_id": cluster_id,
                        "resource_type": "workload",
                        "api_version": "apps/v1",
                        "kind": "Deployment",
                        "namespace": "shop",
                        "name": "checkout",
                        "status": "Ready",
                        "health": "healthy",
                        "labels": {"app": "checkout"},
                        "summary": {},
                    },
                    "cluster": {
                        "cluster_id": cluster_id,
                        "name": "prod",
                        "provider": "eks",
                    },
                    "application_ids": [],
                    "application_binding_completeness": "exact",
                }
            ],
            "filtered_count": 3,
            "unfiltered_count": 5,
            "has_more": True,
            "next_position": {"inventory_key": "deployment-a"},
        }


def _client(db: GraphDb) -> TestClient:
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


def test_resource_graph_requires_exactly_one_authorized_cluster() -> None:
    db = GraphDb(clusters={"cluster-a", "cluster-b"})
    client = _client(db)

    assert client.get("/resources/graph").status_code == 422
    assert (
        client.get("/resources/graph", params={"clusters": "cluster-a,cluster-b"}).status_code
        == 422
    )

    forbidden = client.get("/resources/graph", params={"clusters": "cluster-secret"})
    assert forbidden.status_code == 404
    assert "cluster-secret" not in forbidden.text
    assert db.data_calls == []


def test_resource_graph_uses_selected_cluster_revision_and_reports_budget_partial() -> None:
    db = GraphDb(clusters={"cluster-a", "cluster-b"})
    response = _client(db).get(
        "/resources/graph",
        params={
            "clusters": "cluster-a",
            "resources.types": "workload,pod",
            "labels": "app=checkout",
            "max_nodes": 1,
            "snapshot_revision": 42,
        },
    )

    assert response.status_code == 200
    body = ResourceGraphSnapshotResponse.model_validate(response.json())
    assert body.cluster.cluster_id == "cluster-a"
    assert body.snapshot.snapshot_revision == 42
    assert body.counts.filtered_count == 3
    assert body.counts.unfiltered_count == 5
    assert body.truncated is True
    assert body.omitted_node_count == 2
    assert body.relation_completeness == "partial"
    assert "graph_node_budget_exceeded" in body.partial_reason_codes

    global_snapshot_call, cluster_snapshot_call, resource_call = db.data_calls
    assert global_snapshot_call[1]["allowed_cluster_ids"] == {"cluster-a", "cluster-b"}
    assert cluster_snapshot_call[1]["allowed_cluster_ids"] == {"cluster-a"}
    assert cluster_snapshot_call[1]["at_revision"] == 42
    assert resource_call[1]["allowed_cluster_ids"] == {"cluster-a"}
    assert resource_call[1]["filters"].resource_types == ("pod", "workload")
    assert resource_call[1]["filters"].labels == (("app", "checkout"),)


def test_resource_graph_rejects_future_revision_without_querying_graph_rows() -> None:
    db = GraphDb(clusters={"cluster-a"})
    response = _client(db).get(
        "/resources/graph",
        params={"clusters": "cluster-a", "snapshot_revision": 99},
    )

    assert response.status_code == 422
    assert [kind for kind, _call in db.data_calls] == ["snapshot"]
