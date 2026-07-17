from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db


class TrafficDb:
    calls: list[tuple[object, ...]] = []

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
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "snapshot_revision": 11,
                "observed_at": "2026-07-16T09:00:00+00:00",
                "labels_complete": True,
                "resources_complete": cluster_id == "cluster-a",
                "application_bindings_complete": True,
                "partial_reason_codes": []
                if cluster_id == "cluster-a"
                else ["agent_snapshot_truncated"],
            }
            for cluster_id in cluster_ids
        }

    def resolve_filter_namespaces(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        _snapshot_revision: int,
        requested: set[tuple[str, str]],
    ) -> set[tuple[str, str]]:
        assert workspace_id == "workspace-a"
        return {item for item in requested if item[0] in cluster_ids and item[1] == "storefront"}

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, object]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {"details": {"traffic_sources": {"active_source": "caretta"}}}
            for cluster_id in cluster_ids
        }

    def list_latest_traffic_evidence_windows(
        self,
        workspace_id: str,
        cluster_ids: set[str],
        *,
        since: datetime,
        until: datetime,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        self.calls.append((workspace_id, cluster_ids, since, until))
        return [traffic_window(cluster_id, until) for cluster_id in sorted(cluster_ids)]


def _client() -> TestClient:
    module = importlib.import_module("domains.traffic.router")
    app = FastAPI()
    app.include_router(module.router)
    app.state.inventory_filter_cursor_codec = FilterCursorCodec("t" * 32)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = TrafficDb
    return TestClient(app)


def test_traffic_flows_are_scope_and_permission_bound_agent_evidence() -> None:
    response = _client().get(
        "/traffic/flows?clusters=cluster-a,cluster-b&namespaces=cluster-a/storefront"
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scope_coverage"]["availability"] == "partial"
    assert body["scope_coverage"]["scopes"] == [
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": ["storefront"],
            "freshness": "live",
        },
        {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-b",
            "namespaces": [],
            "freshness": "partial",
        },
    ]
    assert body["observation"]["availability"] == "partial"
    assert body["observation"]["source_keys"] == ["caretta"]
    assert body["summary"]["total_flow_count"] == 1
    assert body["relationships"]["edges"][0]["source"]["cluster_id"] == "cluster-a"
    assert body["relationships"]["edges"][0]["source"]["namespace"] == "storefront"
    assert body["refresh_after_seconds"] == 60


def test_traffic_overview_hides_unauthorized_scope_and_rejects_invalid_namespace_syntax() -> None:
    client = _client()

    denied = client.get("/traffic/flows?clusters=cluster-private")
    invalid = client.get("/traffic/flows?namespaces=not-a-reference")

    assert denied.status_code == 404
    assert invalid.status_code == 422


def test_traffic_flow_cursor_is_signed_and_bound_to_filters() -> None:
    client = _client()
    first = client.get("/traffic/flows?clusters=cluster-a&limit=1")

    assert first.status_code == 200
    cursor = first.json()["relationships"]["next_cursor"]
    assert cursor
    second = client.get(f"/traffic/flows?clusters=cluster-a&limit=1&cursor={cursor}")
    changed = client.get(f"/traffic/flows?clusters=cluster-a&limit=1&protocols=udp&cursor={cursor}")

    assert second.status_code == 200
    assert second.json()["relationships"]["edges"][0]["connections"] == 3
    assert second.json()["relationships"]["has_more"] is False
    assert changed.status_code == 422


def traffic_window(cluster_id: str, observed_at: datetime) -> dict[str, object]:
    return {
        "cluster_id": cluster_id,
        "window_start": observed_at.isoformat(),
        "updated_at": observed_at,
        "payload": {
            "window_start": observed_at.isoformat(),
            "metrics": {
                "results": {
                    "traffic_caretta_flows": {
                        "samples": [
                            traffic_sample(
                                observed_at,
                                source="web",
                                namespace="storefront",
                                target="api",
                                connections=12,
                            ),
                            traffic_sample(
                                observed_at,
                                source="worker",
                                namespace="jobs",
                                target="queue",
                                connections=3,
                            ),
                        ]
                    }
                }
            },
        },
    }


def traffic_sample(
    observed_at: datetime,
    *,
    source: str,
    namespace: str,
    target: str,
    connections: int,
) -> dict[str, object]:
    return {
        "metric": {
            "client_name": source,
            "client_namespace": namespace,
            "client_kind": "Deployment",
            "server_name": target,
            "server_namespace": namespace,
            "server_kind": "Service",
            "server_port": "8080",
        },
        "timestamp": observed_at.astimezone(UTC).timestamp(),
        "value": connections,
    }
