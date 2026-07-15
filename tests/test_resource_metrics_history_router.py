from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.runtime.dependencies import get_db


class ResourceMetricHistoryDb:
    def __init__(self, *, complete: bool = True) -> None:
        self.complete = complete
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if resource_type == "cluster":
            return {"cluster-a"}
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
        self.calls.append(
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
            "observed_at": "2026-07-14T05:02:00Z",
            "labels_complete": self.complete,
            "resources_complete": self.complete,
            "application_bindings_complete": self.complete,
            "partial_reason_codes": [] if self.complete else ["inventory_collection_partial"],
        }

    def list_resource_metric_history(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("history", dict(kwargs)))
        requested = tuple(kwargs["resource_ids"])
        resources = [
            {
                "resource_id": resource_id,
                "cluster_id": "cluster-a",
                "resource_type": "pod",
                "namespace": "shop",
                "name": resource_id,
            }
            for resource_id in requested
            if resource_id != "pod-secret"
        ]
        samples = []
        if self.complete:
            samples = [
                {
                    "sampled_at": "2026-07-14T05:00:00Z",
                    "usage": {
                        "pods": {
                            f"shop/{resource_id}": {
                                "cpu_mcores": float(index + 1) * 100,
                                "mem_mib": 256,
                            }
                            for index, resource_id in enumerate(requested)
                        }
                    },
                }
            ]
        return {"resources": resources, "samples_by_cluster": {"cluster-a": samples}}


def _client(db: ResourceMetricHistoryDb) -> TestClient:
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


def test_metric_history_batches_ids_in_authorized_filtered_snapshot() -> None:
    db = ResourceMetricHistoryDb()
    response = _client(db).get(
        "/metrics/history",
        params={
            "ids": "pod-a,pod-b",
            "clusters": "cluster-a",
            "applications": "app-a",
            "labels": "app=checkout",
            "resources.types": "pod",
            "snapshot_revision": 42,
            "range": "15m",
            "limit": 30,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["completeness"] == "exact"
    assert [item["resource_id"] for item in body["series"]] == ["pod-a", "pod-b"]
    assert all(item["has_sparkline_points"] for item in body["series"])
    assert body["snapshot"]["snapshot_revision"] == 42
    history_call = next(call for kind, call in db.calls if kind == "history")
    assert history_call["workspace_id"] == "workspace-a"
    assert history_call["allowed_cluster_ids"] == {"cluster-a"}
    assert history_call["allowed_application_ids"] == {"app-a"}
    assert history_call["filters"].labels == (("app", "checkout"),)
    assert history_call["resource_ids"] == ("pod-a", "pod-b")
    assert history_call["snapshot_revision"] == 42
    assert history_call["window_seconds"] == 900
    assert history_call["limit"] == 30


def test_metric_history_returns_measured_node_series() -> None:
    db = ResourceMetricHistoryDb()

    def node_history(**kwargs: Any) -> dict[str, Any]:
        db.calls.append(("history", dict(kwargs)))
        return {
            "resources": [
                {
                    "resource_id": "node-a",
                    "cluster_id": "cluster-a",
                    "resource_type": "node",
                    "namespace": None,
                    "name": "worker-a.internal",
                }
            ],
            "samples_by_cluster": {
                "cluster-a": [
                    {
                        "sampled_at": "2026-07-15T05:00:00Z",
                        "usage": {
                            "nodes": {
                                "worker-a.internal": {
                                    "cpu_mcores": 640.5,
                                    "mem_mib": 4096,
                                }
                            }
                        },
                    }
                ]
            },
        }

    db.list_resource_metric_history = node_history  # type: ignore[method-assign]
    response = _client(db).get(
        "/metrics/history",
        params={
            "ids": "node-a",
            "clusters": "cluster-a",
            "resources.types": "node",
            "snapshot_revision": 42,
        },
    )

    assert response.status_code == 200
    assert response.json()["series"] == [
        {
            "resource_id": "node-a",
            "cluster_id": "cluster-a",
            "resource_type": "node",
            "namespace": None,
            "name": "worker-a.internal",
            "points": [
                {
                    "observed_at": "2026-07-15T05:00:00Z",
                    "cpu_mcores": 640.5,
                    "mem_mib": 4096.0,
                }
            ],
            "has_sparkline_points": True,
            "completeness": "exact",
            "partial_reason_codes": [],
        }
    ]


def test_metric_history_filtered_or_unauthorized_id_fails_closed() -> None:
    response = _client(ResourceMetricHistoryDb()).get(
        "/metrics/history",
        params={"ids": "pod-a,pod-secret", "clusters": "cluster-a"},
    )

    assert response.status_code == 404
    assert "pod-secret" not in response.text


def test_metric_history_missing_measurements_are_unavailable_not_zero() -> None:
    response = _client(ResourceMetricHistoryDb(complete=False)).get(
        "/metrics/history",
        params={"ids": "pod-a", "clusters": "cluster-a"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["completeness"] == "unavailable"
    assert body["series"][0]["points"] == []
    assert body["series"][0]["has_sparkline_points"] is False
    assert body["series"][0]["completeness"] == "unavailable"
    assert "inventory_collection_partial" in body["partial_reason_codes"]


def test_metric_history_rejects_duplicate_and_future_snapshot_before_history_query() -> None:
    duplicate_db = ResourceMetricHistoryDb()
    duplicate = _client(duplicate_db).get(
        "/metrics/history", params={"ids": "pod-a,pod-a", "clusters": "cluster-a"}
    )
    assert duplicate.status_code == 422
    assert duplicate_db.calls == []

    future_db = ResourceMetricHistoryDb()
    future = _client(future_db).get(
        "/metrics/history",
        params={"ids": "pod-a", "clusters": "cluster-a", "snapshot_revision": 99},
    )
    assert future.status_code == 422
    assert [kind for kind, _call in future_db.calls] == ["snapshot"]
