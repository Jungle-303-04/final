from __future__ import annotations

import importlib
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class CostDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, object]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert workspace_id == "workspace-a"
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a", "cluster-b"}
        return set()

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
        *,
        at_revision: int | None = None,
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        assert at_revision in (None, 11)
        return {
            cluster_id: {
                "snapshot_revision": 11,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": cluster_id == "cluster-a",
                "partial_reason_codes": []
                if cluster_id == "cluster-a"
                else ["agent_snapshot_truncated"],
            }
            for cluster_id in cluster_ids
        }

    def filter_snapshot_context(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        *,
        at_revision: int | None = None,
    ) -> dict[str, object]:
        self.calls.append(("context", {"clusters": cluster_ids, "at_revision": at_revision}))
        return {
            "snapshot_revision": 11,
            "observed_at": "2026-07-16T09:00:00+00:00",
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
        }

    def resolve_filter_namespaces(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        snapshot_revision: int,
        namespace_refs: set[tuple[str, str]],
    ) -> set[tuple[str, str]]:
        self.calls.append(
            (
                "namespaces",
                {
                    "workspace_id": workspace_id,
                    "cluster_ids": cluster_ids,
                    "snapshot_revision": snapshot_revision,
                    "namespace_refs": namespace_refs,
                },
            )
        )
        return namespace_refs

    def list_filtered_resources(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(("nodes", dict(kwargs)))
        return {
            "items": [
                {
                    "resource": {
                        "inventory_key": "cluster-a:v1:Node:_:node-a",
                        "cluster_id": "cluster-a",
                        "api_version": "v1",
                        "kind": "Node",
                        "namespace": None,
                        "name": "node-a",
                        "uid": "uid-node-a",
                        "status": "Ready",
                        "labels": {"node.kubernetes.io/instance-type": "m6i.large"},
                        "summary": {
                            "provider_id": "aws:///zone/i-123",
                            "allocatable": {"cpu": "2", "memory": "8Gi", "pods": "58"},
                        },
                        "observed_at": "2026-07-16T09:00:00+00:00",
                    },
                    "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
                    "application_ids": [],
                    "application_binding_completeness": "exact",
                }
            ],
            "filtered_count": 1,
            "unfiltered_count": 1,
            "has_more": False,
            "next_position": None,
        }

    def list_resource_metric_history(self, **kwargs: object) -> dict[str, object]:
        self.calls.append(("metrics", dict(kwargs)))
        return {
            "resources": [{"resource_id": "cluster-a:v1:Node:_:node-a"}],
            "samples_by_cluster": {
                "cluster-a": [
                    {
                        "sampled_at": "2026-07-16T09:00:00+00:00",
                        "usage": {
                            "nodes": {
                                "node-a": {
                                    "cpu_mcores": 500,
                                    "mem_mib": 2048,
                                    "cpu_ratio": 0.25,
                                    "mem_ratio": 0.25,
                                }
                            }
                        },
                    }
                ]
            },
        }


def _client() -> TestClient:
    module = importlib.import_module("domains.cost.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    db = CostDb()
    app.dependency_overrides[get_db] = lambda: db
    app.state.inventory_filter_cursor_codec = FilterCursorCodec("s" * 32)
    app.state.cost_test_db = db
    return TestClient(app)


def test_cost_overview_is_scope_and_permission_bound_without_fabricating_money() -> None:
    response = _client().get("/cost/overview?clusters=cluster-a,cluster-b")

    assert response.status_code == 200
    body = response.json()
    assert body["scope_coverage"]["availability"] == "partial"
    assert body["scope_coverage"]["scopes"] == [
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": [],
            "freshness": "live",
        },
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-b",
            "namespaces": [],
            "freshness": "partial",
        },
    ]
    assert body["observation"] == {
        "availability": "unavailable",
        "observed_at": None,
        "currency": None,
        "data_window": None,
        "reason_codes": ["cost_observation_not_integrated"],
    }
    assert body["summary"] == {
        "availability": "unavailable",
        "hourly_cost": None,
        "monthly_projection": None,
        "storage_cost": None,
        "idle_cost": None,
        "efficiency": None,
        "savings_recommendations": None,
        "reason_codes": ["cost_observation_not_integrated"],
    }
    assert body["trend"] == {
        "availability": "unavailable",
        "range": "24h",
        "currency": None,
        "series": [],
        "reason_codes": ["cost_observation_not_integrated"],
    }
    assert body["refresh_after_seconds"] == 60
    assert body["trend_refresh_after_seconds"] == 120
    assert body["nodes_refresh_after_seconds"] == 120


def test_cost_overview_hides_unauthorized_scope_and_rejects_invalid_cluster_syntax() -> None:
    client = _client()

    denied = client.get("/cost/overview?clusters=cluster-private")
    invalid = client.get("/cost/overview?clusters=cluster-a,,cluster-b")

    assert denied.status_code == 404
    assert invalid.status_code == 422


def test_cost_overview_validates_and_forwards_the_trend_range() -> None:
    client = _client()

    selected = client.get("/cost/overview?clusters=cluster-a&range=7d")
    invalid = client.get("/cost/overview?clusters=cluster-a&range=30d")

    assert selected.status_code == 200
    assert selected.json()["trend"]["range"] == "7d"
    assert invalid.status_code == 422


def test_cost_nodes_are_scope_bound_paginated_and_use_one_bulk_metrics_read() -> None:
    client = _client()
    response = client.get("/cost/nodes?clusters=cluster-a&namespaces=cluster-a%2Fshop&limit=50")

    assert response.status_code == 200
    body = response.json()
    assert body["refresh_after_seconds"] == 120
    assert body["scope_coverage"]["scopes"][0]["namespaces"] == ["shop"]
    assert body["items"][0]["resource"]["name"] == "node-a"
    assert body["items"][0]["provider_id"] == "aws:///zone/i-123"
    assert body["items"][0]["pricing"] == {
        "availability": "unavailable",
        "currency": None,
        "hourly_rate_micros": None,
        "reason_codes": ["node_pricing_observation_not_integrated"],
    }
    db = client.app.state.cost_test_db
    assert [name for name, _kwargs in db.calls].count("nodes") == 1
    assert [name for name, _kwargs in db.calls].count("metrics") == 1
    assert [name for name, _kwargs in db.calls].count("namespaces") == 1
    node_call = next(kwargs for name, kwargs in db.calls if name == "nodes")
    assert node_call["allowed_cluster_ids"] == {"cluster-a"}
    assert node_call["limit"] == 50
    assert node_call["filters"].resource_types == ("node",)
    assert node_call["filters"].namespaces == ()


def test_cost_nodes_hide_unauthorized_cluster_and_invalid_namespace_scope() -> None:
    client = _client()

    denied = client.get("/cost/nodes?clusters=cluster-private")
    invalid = client.get("/cost/nodes?namespaces=shop")

    assert denied.status_code == 404
    assert invalid.status_code == 422
