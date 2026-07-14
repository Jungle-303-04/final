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
            "labels": "team=checkout",
        },
    )

    assert initial.status_code == 200
    initial_body = GlobalFilterFacetsResponse.model_validate(initial.json())
    assert initial_body.clusters[0].count == 7
    assert initial_body.clusters[0].count_completeness == "exact"
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
