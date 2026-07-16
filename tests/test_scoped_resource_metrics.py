from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.runtime.dependencies import get_db


class ScopedMetricDb:
    def __init__(self, resource: dict[str, Any] | None = None) -> None:
        self.resource = resource
        self.commands: list[tuple[str, dict[str, Any], str]] = []
        self.access: list[tuple[str, str, str, str, str]] = []

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access.append((user_id, workspace_id, resource_type, resource_id, permission))
        return resource_id == "cluster-a" and permission == "evidence.read"

    def get_inventory_resource_by_key(
        self,
        *,
        workspace_id: str,
        inventory_key: str,
    ) -> dict[str, Any] | None:
        if workspace_id != "workspace-a" or inventory_key != "pod:shop/checkout-0":
            return None
        return self.resource

    def queue_agent_command(self, correlation_id: str, plan: dict[str, Any], status: str) -> bool:
        self.commands.append((correlation_id, plan, status))
        return True


def _resource(**overrides: Any) -> dict[str, Any]:
    return {
        "inventory_key": "pod:shop/checkout-0",
        "cluster_id": "cluster-a",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "shop",
        "name": "checkout-0",
        "uid": "pod-uid-a",
        **overrides,
    }


def _client(db: ScopedMetricDb) -> TestClient:
    router_module = importlib.import_module("domains.command.router")
    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_resource_metric_batch_resolves_exact_resource_and_queues_bounded_server_queries() -> None:
    db = ScopedMetricDb(_resource())
    response = _client(db).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "resource", "resource_id": "pod:shop/checkout-0"},
            "categories": ["cpu", "memory"],
            "range": "1h",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "queued"
    assert body["source"] == "prometheus"
    assert body["refresh_policy_key"] == "metrics_prometheus"
    assert body["scope"] == {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "namespaces": ["shop"],
        "freshness": "live",
    }
    assert body["resource"] == {
        "api_group": "",
        "version": "v1",
        "kind": "Pod",
        "namespace": "shop",
        "name": "checkout-0",
        "uid": "pod-uid-a",
    }
    assert body["coverage"] == {"requested": 2, "queued": 2, "unsupported": 0}
    assert [item["category"] for item in body["queries"]] == ["cpu", "memory"]
    assert [item["unit"] for item in body["queries"]] == ["cores", "bytes"]
    assert all(item["query_name"].startswith("resource_") for item in body["queries"])
    assert len(db.commands) == 2
    queries = [command[1]["payload"]["query"] for command in db.commands]
    assert all(query["source"] == "prometheus" for query in queries)
    assert all(query["range_seconds"] == 3600 for query in queries)
    assert all(1 <= query["step_seconds"] <= 3600 for query in queries)
    assert all(query["range_seconds"] // query["step_seconds"] <= 30 for query in queries)
    assert all('namespace="shop"' in query["query"] for query in queries)
    assert all('pod="checkout-0"' in query["query"] for query in queries)


def test_namespace_and_cluster_queries_are_scoped_without_client_promql() -> None:
    namespace_db = ScopedMetricDb()
    namespace_response = _client(namespace_db).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "namespace", "namespace": "shop"},
            "categories": ["cpu"],
            "range": "15m",
        },
    )
    cluster_db = ScopedMetricDb()
    cluster_response = _client(cluster_db).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "cluster"},
            "categories": ["memory"],
            "range": "6h",
        },
    )

    assert namespace_response.status_code == 200
    assert namespace_response.json()["scope"]["namespaces"] == ["shop"]
    namespace_query = namespace_db.commands[0][1]["payload"]["query"]
    assert namespace_query["range_seconds"] == 900
    assert 'namespace="shop"' in namespace_query["query"]
    assert cluster_response.status_code == 200
    assert cluster_response.json()["scope"]["namespaces"] == []
    cluster_query = cluster_db.commands[0][1]["payload"]["query"]
    assert cluster_query["range_seconds"] == 21600
    assert "namespace=" not in cluster_query["query"]


def test_pvc_query_uses_exact_inventory_identity_and_pvc_freshness_policy() -> None:
    db = ScopedMetricDb(
        _resource(
            inventory_key="pvc:shop/cache",
            kind="PersistentVolumeClaim",
            name="cache",
            uid="pvc-uid-a",
        )
    )

    def get_pvc(*, workspace_id: str, inventory_key: str) -> dict[str, Any] | None:
        assert workspace_id == "workspace-a"
        return db.resource if inventory_key == "pvc:shop/cache" else None

    db.get_inventory_resource_by_key = get_pvc  # type: ignore[method-assign]
    response = _client(db).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "pvc", "resource_id": "pvc:shop/cache"},
            "categories": ["volume_usage"],
            "range": "15m",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["availability"] == "queued"
    assert body["refresh_policy_key"] == "metrics_pvc"
    assert body["queries"][0]["unit"] == "ratio"
    query = db.commands[0][1]["payload"]["query"]
    assert 'namespace="shop"' in query["query"]
    assert 'persistentvolumeclaim="cache"' in query["query"]
    assert "kubelet_volume_stats_used_bytes" in query["query"]
    assert "kubelet_volume_stats_capacity_bytes" in query["query"]


def test_missing_uid_or_unsupported_resource_returns_honest_unavailable_without_queueing() -> None:
    missing_uid = ScopedMetricDb(_resource(uid=None))
    no_uid_response = _client(missing_uid).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "resource", "resource_id": "pod:shop/checkout-0"},
            "categories": ["cpu"],
            "range": "1h",
        },
    )
    unsupported = ScopedMetricDb(_resource(kind="ConfigMap"))
    unsupported_response = _client(unsupported).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "resource", "resource_id": "pod:shop/checkout-0"},
            "categories": ["cpu"],
            "range": "1h",
        },
    )

    assert no_uid_response.status_code == 200
    assert no_uid_response.json()["availability"] == "unavailable"
    assert no_uid_response.json()["reason_codes"] == ["resource_uid_unavailable"]
    assert missing_uid.commands == []
    assert unsupported_response.status_code == 200
    assert unsupported_response.json()["availability"] == "unavailable"
    assert unsupported_response.json()["reason_codes"] == ["resource_metrics_unsupported"]
    assert unsupported.commands == []


def test_resource_metric_query_fails_closed_on_cross_cluster_and_rejects_unbounded_input() -> None:
    wrong_cluster = ScopedMetricDb(_resource(cluster_id="cluster-b"))
    wrong_cluster_response = _client(wrong_cluster).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "resource", "resource_id": "pod:shop/checkout-0"},
            "categories": ["cpu"],
            "range": "1h",
        },
    )
    duplicate_categories = _client(ScopedMetricDb()).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "cluster"},
            "categories": ["cpu", "cpu"],
            "range": "1h",
        },
    )
    too_many_namespaces = _client(ScopedMetricDb()).post(
        "/metrics/query",
        json={
            "cluster_id": "cluster-a",
            "subject": {"kind": "namespace", "namespace": "x" * 64},
            "categories": ["cpu"],
            "range": "1h",
        },
    )

    assert wrong_cluster_response.status_code == 404
    assert wrong_cluster.commands == []
    assert duplicate_categories.status_code == 422
    assert too_many_namespaces.status_code == 422
