from __future__ import annotations

import importlib
import json
from types import SimpleNamespace
from typing import Any

from conftest import ROOT, load_file
from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
APPLICATION_ID = "app-a"


class ApplicationFilterDb:
    def __init__(
        self,
        *,
        applications: set[str],
        clusters: set[str],
        paginated: bool = False,
    ) -> None:
        self.applications = applications
        self.clusters = clusters
        self.paginated = paginated
        self.data_calls: list[dict[str, Any]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if resource_type == "application":
            return set(self.applications)
        if resource_type == "cluster":
            return set(self.clusters)
        return set()

    def list_filtered_applications(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(dict(kwargs))
        return {
            "items": [
                {
                    "application_id": APPLICATION_ID,
                    "display_name": "checkout",
                    "repository_ids": ["repo-a"],
                    "cluster_ids": [CLUSTER_ID],
                    "namespace_refs": [f"{CLUSTER_ID}/shop"],
                    "environments": ["production"],
                    "lifecycle_status": "active",
                    "pending_promotion": True,
                    "binding_count": 1,
                    "updated_at": "2026-07-14T00:30:00Z",
                    "binding_completeness": "partial",
                    "label_projection_completeness": "unavailable",
                    "metadata": {"credential_ref": "must-not-cross-contract"},
                }
            ],
            "filtered_count": 1,
            "unfiltered_count": 1,
            "next_position": (
                {"name": "checkout", "application_id": APPLICATION_ID} if self.paginated else None
            ),
            "observed_at": "2026-07-14T00:30:00Z",
            "partial_reason_codes": ["application_label_projection_unavailable"],
        }


def _client(db: ApplicationFilterDb) -> TestClient:
    module = importlib.import_module("domains.application_filter.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id=WORKSPACE_ID,
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    app.state.application_filter_cursor_codec = FilterCursorCodec(
        "application-filter-test-secret-32-bytes",
        now=lambda: 1_000,
    )
    return TestClient(app)


def test_empty_application_grant_returns_exact_empty_without_repository_lookup() -> None:
    db = ApplicationFilterDb(applications=set(), clusters={CLUSTER_ID})

    response = _client(db).get("/applications/filter-results")

    assert response.status_code == 200
    assert response.json()["counts"] == {
        "filtered_count": 0,
        "unfiltered_count": 0,
        "filtered_count_completeness": "exact",
        "unfiltered_count_completeness": "exact",
    }
    assert db.data_calls == []


def test_application_filters_reject_unauthorized_scope_without_identifier_leak() -> None:
    db = ApplicationFilterDb(applications={APPLICATION_ID}, clusters={CLUSTER_ID})
    client = _client(db)

    cluster = client.get(
        "/applications/filter-results",
        params={"clusters": "cluster-private"},
    )
    application = client.get(
        "/applications/filter-results",
        params={"applications": "application-private"},
    )

    assert cluster.status_code == 404
    assert application.status_code == 404
    assert "private" not in cluster.text
    assert "private" not in application.text
    assert db.data_calls == []


def test_application_filters_delegate_normalized_scope_and_strip_storage_payload() -> None:
    db = ApplicationFilterDb(applications={APPLICATION_ID}, clusters={CLUSTER_ID})

    response = _client(db).get(
        "/applications/filter-results",
        params={
            "clusters": CLUSTER_ID,
            "namespaces": f"{CLUSTER_ID}/shop",
            "applications": APPLICATION_ID,
            "applications.environment": "Production",
            "applications.status": "ACTIVE",
            "applications.pendingPromotion": "true",
            "applications.q": " checkout ",
        },
    )

    assert response.status_code == 200
    assert len(db.data_calls) == 1
    filters = db.data_calls[0]["filters"]
    assert filters.environments == ("production",)
    assert filters.statuses == ("active",)
    assert filters.pending_promotion is True
    assert filters.query == "checkout"
    assert db.data_calls[0]["allowed_application_ids"] == {APPLICATION_ID}
    assert db.data_calls[0]["allowed_cluster_ids"] == {CLUSTER_ID}
    serialized = json.dumps(response.json(), sort_keys=True).casefold()
    assert "credential_ref" not in serialized
    assert "must-not-cross-contract" not in serialized


def test_application_cursor_is_bound_to_filter_scope() -> None:
    db = ApplicationFilterDb(applications={APPLICATION_ID}, clusters={CLUSTER_ID})
    client = _client(db)
    module = importlib.import_module("domains.application_filter.router")
    codec = FilterCursorCodec("application-filter-test-secret-32-bytes", now=lambda: 1_000)
    authorized = module.AuthorizedApplicationScope(
        workspace_id=WORKSPACE_ID,
        user_id="user-a",
        roles=("user",),
        cluster_ids=frozenset({CLUSTER_ID}),
        application_ids=frozenset({APPLICATION_ID}),
        authorization_revision="different-authorization-revision",
    )
    scope = module._page_scope(
        codec,
        cursor=None,
        authorized=authorized,
        surface="applications:list",
        fingerprint="different-filter",
        facet_query=None,
        position_keys=("name", "application_id"),
    )[0]
    cursor = codec.encode(scope, position={"name": "checkout", "application_id": APPLICATION_ID})

    response = client.get("/applications/filter-results", params={"cursor": cursor})

    assert response.status_code == 422
    assert db.data_calls == []


def test_application_live_projection_refuses_unpinned_next_page() -> None:
    db = ApplicationFilterDb(
        applications={APPLICATION_ID},
        clusters={CLUSTER_ID},
        paginated=True,
    )

    response = _client(db).get("/applications/filter-results", params={"limit": 1})

    assert response.status_code == 503
    assert response.json() == {"detail": "application filter pagination is unavailable"}


def test_gateway_registers_static_application_filters_before_dynamic_detail(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "gateway.py",
        "test_application_filter_gateway_module",
    )
    app = gateway.create_app()
    included_paths = [
        [getattr(item, "path", "") for item in route.original_router.routes]
        for route in app.router.routes
        if getattr(route, "original_router", None) is not None
    ]
    filter_group = next(
        index
        for index, paths in enumerate(included_paths)
        if "/applications/filter-results" in paths
    )
    legacy_group = next(
        index
        for index, paths in enumerate(included_paths)
        if "/applications/{application_id}" in paths
    )

    assert filter_group < legacy_group
