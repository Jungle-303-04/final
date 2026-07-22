from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

from domains.inventory_filter.cursor import CursorScope, FilterCursorCodec
from packages.contracts.gateway.responses import (
    FilteredInventoryResourceListResponse,
    GlobalFilterFacetsResponse,
    LabelFacetPageResponse,
    ResourceFilterFacetPageResponse,
)

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
APPLICATION_ID = "app-a"


class _SessionAuth:
    def __init__(self, session: Any | None) -> None:
        self.session = session

    async def require_session(self, _request: Request) -> Any:
        if self.session is None:
            raise HTTPException(status_code=401, detail="authentication required")
        return self.session


def _session(*, workspace_id: str = WORKSPACE_ID) -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-a",
        workspace_id=workspace_id,
        roles=("user",),
    )


def _resource() -> dict[str, Any]:
    return {
        "inventory_key": "cluster-a:apps/v1:Deployment:shop:checkout",
        "snapshot_id": "snapshot-42",
        "workspace_id": WORKSPACE_ID,
        "cluster_id": CLUSTER_ID,
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "uid-checkout",
        "resource_version": "7",
        "status": "Ready",
        "health": "healthy",
        "labels": {"team": "checkout"},
        "annotations": {},
        "summary": {"ready_replicas": 3},
        "observed_at": "2026-07-13T20:20:00Z",
        "first_seen_at": "2026-07-13T20:00:00Z",
        "last_seen_at": "2026-07-13T20:20:00Z",
        "deleted_at": None,
        "created_at": "2026-07-13T20:00:00Z",
        "updated_at": "2026-07-13T20:20:00Z",
    }


class InventoryFilterApiDb:
    def __init__(
        self,
        *,
        allowed_clusters: set[str],
        allowed_applications: set[str],
        paginated: bool = False,
    ) -> None:
        self.allowed_clusters = allowed_clusters
        self.allowed_applications = allowed_applications
        self.paginated = paginated
        self.authorization_calls: list[tuple[Any, ...]] = []
        self.data_calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        self.authorization_calls.append((user_id, workspace_id, resource_type, permission))
        if resource_type == "cluster":
            return set(self.allowed_clusters)
        if resource_type == "application":
            return set(self.allowed_applications)
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
            "snapshot_revision": 42,
            "observed_at": "2026-07-13T20:20:00Z",
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
        }

    def list_filtered_resources(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("resources", dict(kwargs)))
        return {
            "items": [
                {
                    "resource": _resource(),
                    "cluster": {
                        "cluster_id": CLUSTER_ID,
                        "name": "prod-eks",
                        "provider": "eks",
                    },
                    "application_ids": [APPLICATION_ID],
                    "application_binding_completeness": "exact",
                }
            ],
            "filtered_count": 1,
            "unfiltered_count": 9,
            "has_more": self.paginated,
            "next_position": (
                {
                    "cluster_id": CLUSTER_ID,
                    "namespace": "shop",
                    "resource_type": "workload",
                    "kind": "Deployment",
                    "name": "checkout",
                    "inventory_key": _resource()["inventory_key"],
                }
                if self.paginated
                else None
            ),
        }

    def list_global_filter_facets(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("global-facets", dict(kwargs)))
        searched = bool(str(kwargs.get("query") or "").strip())
        return {
            "clusters": [{"id": CLUSTER_ID, "label": "prod-eks", "count": 7}],
            "namespaces": [
                {
                    "id": f"{CLUSTER_ID}/shop",
                    "label": "shop",
                    "cluster_id": CLUSTER_ID,
                    "count": 4,
                }
            ],
            "applications": [{"id": APPLICATION_ID, "label": "checkout", "count": 3}],
            "resource_types": [{"id": "workload", "label": "Workload", "count": 5}],
            "labels": ([{"key": "team", "value": "checkout", "count": 2}] if searched else []),
            "resources": (
                [
                    {
                        "id": _resource()["inventory_key"],
                        "label": "checkout",
                        "kind": "Deployment",
                        "count": 1,
                    }
                ]
                if searched
                else []
            ),
        }

    def search_resource_identities(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("resource-search", dict(kwargs)))
        resource = _resource()
        return {
            "items": [
                {
                    "id": resource["inventory_key"],
                    "cluster_id": resource["cluster_id"],
                    "api_version": resource["api_version"],
                    "kind": resource["kind"],
                    "namespace": resource["namespace"],
                    "name": resource["name"],
                    "uid": resource["uid"],
                    "resource_type": resource["resource_type"],
                    "observed_at": resource["observed_at"],
                    "matched_fields": ["name"],
                }
            ],
            "total": 1,
        }

    def list_label_facets(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("labels", dict(kwargs)))
        return {
            "items": [
                {"key": "team", "value": "checkout", "match_count": 1},
                {"key": "tier", "value": "critical", "match_count": 1},
            ],
            "filtered_count": 1,
            "unfiltered_count": 9,
            "selected_match_counts": [
                {"key": "team", "value": "checkout", "match_count": 1},
                {"key": "tier", "value": "critical", "match_count": 0},
            ],
            "has_more": False,
            "next_position": None,
        }

    def list_filter_namespaces(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str],
        snapshot_revision: int,
        *,
        position: dict[str, Any] | None,
        limit: int,
    ) -> dict[str, Any]:
        self.data_calls.append(
            (
                "namespaces",
                {
                    "workspace_id": workspace_id,
                    "allowed_cluster_ids": set(allowed_cluster_ids),
                    "snapshot_revision": snapshot_revision,
                    "position": position,
                    "limit": limit,
                },
            )
        )
        return {
            "items": [
                {"cluster_id": "cluster-a", "namespace": "default"},
                {"cluster_id": "tenant/eu/prod", "namespace": "shop"},
            ],
            "has_more": False,
            "next_position": None,
        }

    def list_filter_clusters(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str],
        *,
        position: dict[str, Any] | None,
        limit: int,
    ) -> dict[str, Any]:
        self.data_calls.append(
            (
                "clusters",
                {
                    "workspace_id": workspace_id,
                    "allowed_cluster_ids": set(allowed_cluster_ids),
                    "position": position,
                    "limit": limit,
                },
            )
        )
        return {
            "items": [
                {
                    "cluster_id": CLUSTER_ID,
                    "name": "prod-eks",
                    "provider": "eks",
                }
            ],
            "has_more": False,
            "next_position": None,
        }

    def list_filter_applications(
        self,
        workspace_id: str,
        allowed_application_ids: set[str],
        *,
        position: dict[str, Any] | None,
        limit: int,
    ) -> dict[str, Any]:
        self.data_calls.append(
            (
                "applications",
                {
                    "workspace_id": workspace_id,
                    "allowed_application_ids": set(allowed_application_ids),
                    "position": position,
                    "limit": limit,
                },
            )
        )
        return {
            "items": [{"application_id": APPLICATION_ID, "name": "checkout"}],
            "has_more": False,
            "next_position": None,
        }

    def resolve_filter_clusters(
        self,
        _workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, str]]:
        return {
            cluster_id: {"name": cluster_id, "provider": "unknown"}
            for cluster_id in cluster_ids
            if cluster_id in self.allowed_clusters
        }

    def resolve_filter_applications(
        self,
        _workspace_id: str,
        application_ids: tuple[str, ...],
    ) -> dict[str, dict[str, str]]:
        return {
            application_id: {"name": application_id}
            for application_id in application_ids
            if application_id in self.allowed_applications
        }

    def resolve_filter_namespaces(
        self,
        _workspace_id: str,
        _allowed_cluster_ids: set[str],
        _snapshot_revision: int,
        namespace_refs: tuple[tuple[str, str], ...],
    ) -> set[tuple[str, str]]:
        return set(namespace_refs)


def _make_client(
    db: InventoryFilterApiDb,
    *,
    session: Any | None = None,
) -> tuple[TestClient, _SessionAuth]:
    router_module = importlib.import_module("domains.inventory_filter.router")
    app = FastAPI()
    app.include_router(router_module.router)
    auth = _SessionAuth(session or _session())
    app.state.auth = auth
    app.state.db = db
    app.state.inventory_filter_cursor_codec = FilterCursorCodec(
        "inventory-filter-router-test-secret!!",
        now=lambda: 1_000,
    )
    return TestClient(app), auth


def test_resources_empty_cluster_grant_returns_empty_without_data_lookup() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters=set(),
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    response = client.get("/resources")

    assert response.status_code == 200
    body = FilteredInventoryResourceListResponse.model_validate(response.json())
    assert body.items == []
    assert body.next_cursor is None
    assert body.has_more is False
    assert body.counts.filtered_count == 0
    assert body.counts.unfiltered_count == 0
    assert body.counts.filtered_count_completeness == "exact"
    assert body.counts.unfiltered_count_completeness == "exact"
    assert db.data_calls == []


def test_global_filter_facets_return_structural_axes_and_search_only_dynamic_axes() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    initial = client.get("/filter-facets", params={"clusters": CLUSTER_ID})
    searched = client.get(
        "/filter-facets",
        params={
            "q": "check",
            "clusters": CLUSTER_ID,
            "namespaces": f"{CLUSTER_ID}/shop",
            "applications": APPLICATION_ID,
            "resources.types": "workload",
            "labels": "team=checkout",
        },
    )

    assert initial.status_code == 200
    initial_body = GlobalFilterFacetsResponse.model_validate(initial.json())
    assert initial_body.clusters[0].count == 7
    assert initial_body.clusters[0].count_completeness == "exact"
    assert initial_body.resource_types[0].label == "Workload"
    assert initial_body.resource_types[0].count == 5
    assert initial_body.labels == []
    assert initial_body.resources == []
    assert searched.status_code == 200
    searched_body = GlobalFilterFacetsResponse.model_validate(searched.json())
    assert searched_body.applications[0].label == "checkout"
    assert searched_body.labels[0].key == "team"
    assert searched_body.resources[0].kind == "Deployment"
    assert searched_body.resources[0].count_completeness == "exact"
    call = [item for item in db.data_calls if item[0] == "global-facets"][-1][1]
    assert call["query"] == "check"
    assert call["filters"].clusters == (CLUSTER_ID,)
    assert call["filters"].namespaces == ((CLUSTER_ID, "shop"),)
    assert call["filters"].applications == (APPLICATION_ID,)
    assert call["filters"].resource_types == ("workload",)
    assert call["filters"].labels == (("team", "checkout"),)


def test_global_filter_facets_do_not_turn_missing_projection_into_exact_zero() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    db.filter_snapshot_context = lambda *_args, **_kwargs: {
        "snapshot_revision": 0,
        "observed_at": None,
        "labels_complete": False,
        "resources_complete": False,
        "application_bindings_complete": False,
        "partial_reason_codes": ["missing_inventory_projection"],
    }
    client, _auth = _make_client(db)

    response = client.get("/filter-facets")

    assert response.status_code == 200
    body = GlobalFilterFacetsResponse.model_validate(response.json())
    assert body.clusters[0].count is None
    assert body.clusters[0].count_completeness == "unavailable"
    assert body.applications[0].count is None
    assert body.applications[0].count_completeness == "unavailable"


def test_resource_search_returns_exact_identity_and_authorized_scopes() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    response = client.get(
        "/search",
        params={
            "q": "checkout",
            "clusters": CLUSTER_ID,
            "namespaces": f"{CLUSTER_ID}/shop",
            "include": "resources",
            "globalNs": "true",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["scopes"] == [
        {
            "workspace_id": WORKSPACE_ID,
            "cluster_id": CLUSTER_ID,
            "namespaces": [],
            "freshness": "live",
        }
    ]
    assert body["hits"][0]["resource"] == {
        "api_group": "apps",
        "version": "v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": "uid-checkout",
    }
    assert body["hits"][0]["resource_type"] == "workload"
    assert body["hits"][0]["matched_fields"] == ["name"]
    assert body["total"] == 1
    assert body["total_completeness"] == "exact"
    call = [item for item in db.data_calls if item[0] == "resource-search"][-1][1]
    assert call["filters"].clusters == (CLUSTER_ID,)
    assert call["filters"].namespaces == ()


@pytest.mark.parametrize(
    ("query", "forbidden_value"),
    [
        ("clusters=cluster-secret", "cluster-secret"),
        ("applications=app-secret", "app-secret"),
    ],
    ids=["cluster", "application"],
)
def test_resources_reject_unauthorized_requested_scope_without_name_leak(
    query: str,
    forbidden_value: str,
) -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    response = client.get(f"/resources?{query}")

    assert response.status_code == 404
    assert forbidden_value not in response.text
    assert "secret" not in response.text.casefold()
    assert db.data_calls == []


def test_resources_returns_strict_rows_and_normalizes_all_filter_axes() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={"cluster-a", "tenant/eu/prod"},
        allowed_applications={"app-a", "app-b"},
    )
    client, _auth = _make_client(db)

    response = client.get(
        "/resources",
        params={
            "clusters": "tenant/eu/prod,cluster-a,cluster-a",
            "namespaces": "tenant/eu/prod/shop,cluster-a/default",
            "applications": "app-b,app-a",
            "resource_types": "Pod,workload",
            "health": "healthy,degraded",
            "labels": "team=checkout,tier=critical",
            "q": " api ",
            "include_deleted": "true",
            "limit": "50",
        },
    )

    assert response.status_code == 200
    body = response.json()
    parsed = FilteredInventoryResourceListResponse.model_validate(body)
    assert parsed.items[0].resource.name == "checkout"
    assert parsed.items[0].cluster.cluster_id == CLUSTER_ID
    assert "raw" not in body["items"][0]["resource"]
    resource_call = next(call for call in db.data_calls if call[0] == "resources")
    kwargs = resource_call[1]
    filters = kwargs["filters"]
    assert filters.clusters == ("cluster-a", "tenant/eu/prod")
    assert filters.namespaces == (
        ("cluster-a", "default"),
        ("tenant/eu/prod", "shop"),
    )
    assert filters.applications == ("app-a", "app-b")
    assert filters.resource_types == ("pod", "workload")
    assert filters.health == ("degraded", "healthy")
    assert filters.labels == (("team", "checkout"), ("tier", "critical"))
    assert filters.query == "api"
    assert filters.include_deleted is True
    assert kwargs["allowed_cluster_ids"] == {"cluster-a", "tenant/eu/prod"}
    assert kwargs["allowed_application_ids"] == {"app-a", "app-b"}


def test_resources_attaches_pinned_pod_and_node_table_metrics_to_existing_rows() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    pod = {
        **_resource(),
        "inventory_key": "cluster-a:v1:Pod:shop:checkout-0",
        "snapshot_id": "snapshot-42",
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "name": "checkout-0",
        "uid": "uid-checkout-0",
        "summary": {
            "cpu_mcores": 250,
            "mem_mib": 192,
            "cpu_request_mcores": 150,
            "cpu_limit_mcores": 600,
            "mem_request_mib": 192,
            "mem_limit_mib": 384,
            "metrics_observed_at": "2026-07-17T01:00:00Z",
            "metrics_window": "30s",
        },
    }
    node = {
        **_resource(),
        "inventory_key": "cluster-a:v1:Node::worker-a",
        "snapshot_id": "snapshot-42",
        "resource_type": "node",
        "api_version": "v1",
        "kind": "Node",
        "namespace": None,
        "name": "worker-a",
        "uid": "uid-worker-a",
        "summary": {
            "cpu_mcores": 1200,
            "mem_mib": 4096,
            "allocatable": {"cpu": "3900m", "memory": "8Gi", "pods": "58"},
            "pod_count": 23,
            "metrics_observed_at": "2026-07-17T01:00:00Z",
            "metrics_window": "30s",
        },
    }

    def list_rows(**kwargs: Any) -> dict[str, Any]:
        db.data_calls.append(("resources", dict(kwargs)))
        return {
            "items": [
                {
                    "resource": resource,
                    "cluster": {"cluster_id": CLUSTER_ID, "name": "prod", "provider": "eks"},
                    "application_ids": [],
                    "application_binding_completeness": "exact",
                }
                for resource in (pod, node)
            ],
            "filtered_count": 2,
            "unfiltered_count": 2,
            "has_more": False,
            "next_position": None,
        }

    db.list_filtered_resources = list_rows  # type: ignore[method-assign]
    client, _auth = _make_client(db)

    response = client.get("/resources", params={"clusters": CLUSTER_ID})

    assert response.status_code == 200
    body = FilteredInventoryResourceListResponse.model_validate(response.json())
    assert body.snapshot.snapshot_revision == 42
    assert body.items[0].metrics.kind == "pod"
    assert body.items[0].metrics.cpu_limit_mcores == 600
    assert body.items[1].metrics.kind == "node"
    assert body.items[1].metrics.cpu_allocatable_mcores == 3900
    assert body.items[1].metrics.pod_count == 23


def test_resources_signed_cursor_rejects_changed_filter_auth_and_workspace() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
        paginated=True,
    )
    client, auth = _make_client(db)
    first = client.get(
        "/resources",
        params={"clusters": CLUSTER_ID, "resource_types": "workload", "limit": 1},
    )
    assert first.status_code == 200
    cursor = first.json()["next_cursor"]
    assert isinstance(cursor, str) and cursor
    assert "checkout" not in cursor

    changed_filter = client.get(
        "/resources",
        params={
            "clusters": CLUSTER_ID,
            "resource_types": "pod",
            "limit": 1,
            "cursor": cursor,
        },
    )
    assert changed_filter.status_code == 422

    db.allowed_clusters = {CLUSTER_ID, "cluster-b"}
    changed_auth = client.get(
        "/resources",
        params={
            "clusters": CLUSTER_ID,
            "resource_types": "workload",
            "limit": 1,
            "cursor": cursor,
        },
    )
    assert changed_auth.status_code == 422

    db.allowed_clusters = {CLUSTER_ID}
    auth.session = _session(workspace_id="workspace-b")
    changed_workspace = client.get(
        "/resources",
        params={
            "clusters": CLUSTER_ID,
            "resource_types": "workload",
            "limit": 1,
            "cursor": cursor,
        },
    )
    assert changed_workspace.status_code == 422


def test_resources_cursor_rejects_signed_but_invalid_position_shape() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
        paginated=True,
    )
    client, _auth = _make_client(db)
    first = client.get(
        "/resources",
        params={"clusters": CLUSTER_ID, "resources.types": "workload", "limit": 1},
    )
    body = FilteredInventoryResourceListResponse.model_validate(first.json())
    malformed = client.app.state.inventory_filter_cursor_codec.encode(
        CursorScope(
            workspace_id=WORKSPACE_ID,
            user_id="user-a",
            authorization_revision=body.snapshot.authorization_revision,
            surface="resources:list",
            filter_fingerprint=body.snapshot.filter_fingerprint,
            snapshot_revision=body.snapshot.snapshot_revision,
            facet_query=None,
        ),
        position={"unexpected": "value"},
    )

    response = client.get(
        "/resources",
        params={
            "clusters": CLUSTER_ID,
            "resources.types": "workload",
            "limit": 1,
            "cursor": malformed,
        },
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "resource filter request is invalid"}


def test_resource_label_facets_return_selected_resolutions_and_server_counts() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    response = client.get(
        "/resources/label-facets",
        params={
            "clusters": CLUSTER_ID,
            "labels": "team=checkout,tier=critical",
            "facet_q": "te",
            "limit": 50,
        },
    )

    assert response.status_code == 200
    body = LabelFacetPageResponse.model_validate(response.json())
    assert [(item.selector, item.match_count) for item in body.items] == [
        ("team=checkout", 1),
        ("tier=critical", 1),
    ]
    assert [(item.selector, item.status) for item in body.selected_resolutions] == [
        ("team=checkout", "resolved"),
        ("tier=critical", "zero"),
    ]
    assert body.counts.filtered_count == 1
    assert body.counts.unfiltered_count == 9
    label_call = next(call for call in db.data_calls if call[0] == "labels")
    assert label_call[1]["filters"].labels == (
        ("team", "checkout"),
        ("tier", "critical"),
    )
    assert label_call[1]["facet_query"] == "te"


def test_resource_filter_facets_preserve_exact_namespace_references() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID, "tenant/eu/prod"},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    response = client.get(
        "/resources/filter-facets",
        params={
            "axis": "namespaces",
            "selected": "tenant/eu/prod/shop,cluster-a/default",
            "limit": 50,
        },
    )

    assert response.status_code == 200
    body = ResourceFilterFacetPageResponse.model_validate(response.json())
    assert [item.value for item in body.items] == [
        "cluster-a/default",
        "tenant/eu/prod/shop",
    ]
    assert [item.value for item in body.selected_resolutions] == [
        "cluster-a/default",
        "tenant/eu/prod/shop",
    ]
    assert all(item.status == "resolved" for item in body.selected_resolutions)


def test_global_filter_facets_etag_304_and_recompute_on_revision_change() -> None:
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    first = client.get("/filter-facets", params={"clusters": CLUSTER_ID})
    assert first.status_code == 200
    etag = first.headers.get("etag")
    assert etag
    calls = sum(1 for item in db.data_calls if item[0] == "global-facets")

    second = client.get(
        "/filter-facets", params={"clusters": CLUSTER_ID}, headers={"If-None-Match": etag}
    )
    assert second.status_code == 304
    # 304 는 비싼 facet 집계를 재실행하지 않는다.
    assert sum(1 for item in db.data_calls if item[0] == "global-facets") == calls

    db.filter_snapshot_context = lambda *_args, **_kwargs: {
        "snapshot_revision": 99,
        "observed_at": "2026-07-22T00:00:00+00:00",
    }
    third = client.get(
        "/filter-facets", params={"clusters": CLUSTER_ID}, headers={"If-None-Match": etag}
    )
    assert third.status_code == 200
    assert third.headers.get("etag") != etag


def test_global_filter_facets_etag_weak_comparison_from_edge() -> None:
    """edge(Cloudflare)가 압축하며 강한 ETag 를 W/"…" 로 약화시켜 브라우저가
    W/ 접두 If-None-Match 를 보낸다 — RFC 7232 약한 비교로 304 를 반환해야 한다."""
    db = InventoryFilterApiDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client, _auth = _make_client(db)

    first = client.get("/filter-facets", params={"clusters": CLUSTER_ID})
    assert first.status_code == 200
    etag = first.headers.get("etag")
    assert etag
    calls = sum(1 for item in db.data_calls if item[0] == "global-facets")

    weakened = client.get(
        "/filter-facets",
        params={"clusters": CLUSTER_ID},
        headers={"If-None-Match": f"W/{etag}"},
    )
    assert weakened.status_code == 304
    assert sum(1 for item in db.data_calls if item[0] == "global-facets") == calls

    listed = client.get(
        "/filter-facets",
        params={"clusters": CLUSTER_ID},
        headers={"If-None-Match": f'"other-tag", W/{etag}'},
    )
    assert listed.status_code == 304

    wildcard = client.get(
        "/filter-facets", params={"clusters": CLUSTER_ID}, headers={"If-None-Match": "*"}
    )
    assert wildcard.status_code == 304

    mismatch = client.get(
        "/filter-facets",
        params={"clusters": CLUSTER_ID},
        headers={"If-None-Match": 'W/"stale-tag"'},
    )
    assert mismatch.status_code == 200


def test_facets_single_flight_coalesces_same_key_and_propagates_failure() -> None:
    """같은 키 동시 계산은 1회로 합류하고(저장 없음), 실패는 전원에 정직 전파된다."""
    import asyncio as _asyncio
    import time as _time

    from domains.inventory_filter.router import _facets_single_flight

    calls = {"n": 0}

    def slow_compute():  # noqa: ANN202
        calls["n"] += 1
        _time.sleep(0.05)
        return {"value": calls["n"]}

    async def run_pair():  # noqa: ANN202
        return await _asyncio.gather(
            _facets_single_flight("key-a", slow_compute),
            _facets_single_flight("key-a", slow_compute),
        )

    (r1, c1), (r2, c2) = _asyncio.run(run_pair())
    assert calls["n"] == 1  # 계산은 1회
    assert r1 == r2 == {"value": 1}
    assert sorted([c1, c2]) == [False, True]  # owner 1 + follower 1

    # 완료 후 테이블은 비워져 다음 호출은 새로 계산한다(결과 저장 없음 = 캐시 아님).
    (r3, c3) = _asyncio.run(_facets_single_flight("key-a", slow_compute))
    assert r3 == {"value": 2} and c3 is False

    # 다른 키는 합류하지 않는다.
    _asyncio.run(_facets_single_flight("key-b", slow_compute))
    assert calls["n"] == 3

    # 실패 전파: owner 예외가 follower 에게도 전파되고 테이블이 정리된다.
    def boom():  # noqa: ANN202
        _time.sleep(0.02)
        raise RuntimeError("compute failed")

    async def run_fail_pair():  # noqa: ANN202
        results = await _asyncio.gather(
            _facets_single_flight("key-c", boom),
            _facets_single_flight("key-c", boom),
            return_exceptions=True,
        )
        return results

    results = _asyncio.run(run_fail_pair())
    assert all(isinstance(item, RuntimeError) for item in results)
    (r4, _c4) = _asyncio.run(_facets_single_flight("key-c", slow_compute))
    assert r4 == {"value": 4}
