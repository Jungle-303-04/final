from __future__ import annotations

import importlib
import json
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.runtime.dependencies import get_db

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
APPLICATION_ID = "app-a"


def _session(*, workspace_id: str = WORKSPACE_ID) -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-a",
        workspace_id=workspace_id,
        roles=("user",),
    )


class IssueFilterDb:
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
        self.authorization_calls: list[tuple[str, str, str, str]] = []
        self.data_calls: list[dict[str, Any]] = []
        self.facet_calls: list[dict[str, Any]] = []
        self.label_facet_calls: list[dict[str, Any]] = []

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

    def list_filtered_issues(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(dict(kwargs))
        filters = kwargs["filters"]
        if filters.labels:
            return {
                "items": [],
                "counts": {
                    "filtered_count": None,
                    "unfiltered_count": 7,
                    "filtered_count_completeness": "unavailable",
                    "unfiltered_count_completeness": "exact",
                },
                "facets": {
                    "clusters": [],
                    "namespaces": [],
                    "applications": [],
                    "severities": [],
                    "statuses": [],
                    "environments": [],
                },
                "selected_labels": [
                    {
                        "key": filters.labels[0][0],
                        "value": filters.labels[0][1],
                        "selector": "=".join(filters.labels[0]),
                        "status": "unavailable",
                    }
                ],
                "next_position": None,
                "observed_at": "2026-07-13T20:20:00Z",
                "partial_reason_codes": ["issue_label_projection_unavailable"],
            }
        return {
            "items": [
                {
                    "issue_id": "issue-a",
                    "detail_id": "correlation-a",
                    "correlation_id": "correlation-a",
                    "cluster_id": CLUSTER_ID,
                    "namespace": "shop",
                    "resource_kind": "Deployment",
                    "resource_name": "checkout",
                    "symptom": "ImagePullBackOff",
                    "severity": "critical",
                    "issue_state": "open",
                    "current_subject": "rca.completed",
                    "pipeline_status": "completed",
                    "environment": "production",
                    "environment_completeness": "exact",
                    "application_ids": [APPLICATION_ID],
                    "application_binding_completeness": "exact",
                    "label_projection_completeness": "unavailable",
                    "root_cause": "bad image tag",
                    "confidence": 0.93,
                    "updated_at": "2026-07-13T20:20:00Z",
                    # 저장소 내부 payload는 strict API DTO로 절대 노출하지 않는다.
                    "payload": {"authorization": "Bearer secret"},
                }
            ],
            "counts": {
                "filtered_count": 1,
                "unfiltered_count": 7,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "facets": {
                "clusters": [{"value": CLUSTER_ID, "label": "prod", "match_count": 1}],
                "namespaces": [
                    {
                        "value": f"{CLUSTER_ID}/shop",
                        "label": "shop",
                        "match_count": 1,
                    }
                ],
                "applications": [
                    {
                        "value": APPLICATION_ID,
                        "label": "checkout",
                        "match_count": 1,
                    }
                ],
                "severities": [{"value": "critical", "label": "critical", "match_count": 1}],
                "statuses": [{"value": "open", "label": "open", "match_count": 1}],
                "environments": [
                    {
                        "value": "production",
                        "label": "production",
                        "match_count": 1,
                    }
                ],
            },
            "next_position": (
                {
                    "updated_at": "2026-07-13T20:20:00Z",
                    "issue_id": "issue-a",
                }
                if self.paginated
                else None
            ),
            "observed_at": "2026-07-13T20:20:00Z",
            "partial_reason_codes": ["issue_label_projection_unavailable"],
        }

    def list_issue_filter_facets(self, **kwargs: Any) -> dict[str, Any]:
        self.facet_calls.append(dict(kwargs))
        return {
            "items": [
                {
                    "axis": kwargs["axis"],
                    "value": "critical",
                    "label": "critical",
                    "match_count": 3,
                    "availability": "available",
                }
            ],
            "selected_resolutions": [
                {
                    "axis": "severity",
                    "value": "critical",
                    "status": "resolved",
                    "display_label": "critical",
                }
            ],
            "counts": {
                "filtered_count": 3,
                "unfiltered_count": 7,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "next_position": None,
            "observed_at": "2026-07-13T20:20:00Z",
            "partial_reason_codes": [],
        }

    def list_issue_label_facets(self, **kwargs: Any) -> dict[str, Any]:
        self.label_facet_calls.append(dict(kwargs))
        return {
            "items": [
                {
                    "key": "team",
                    "value": "checkout",
                    "match_count": 2,
                }
            ],
            "selected_match_counts": [
                {
                    "key": "tier",
                    "value": "critical",
                    "match_count": 1,
                }
            ],
            "counts": {
                "filtered_count": 2,
                "unfiltered_count": 7,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "next_position": None,
            "observed_at": "2026-07-13T20:20:00Z",
            "partial_reason_codes": [],
        }


def _make_client(db: IssueFilterDb) -> TestClient:
    router_module = importlib.import_module("domains.issue_filter.router")
    app = FastAPI()
    app.include_router(router_module.router)
    app.dependency_overrides[require_session] = _session
    app.dependency_overrides[get_db] = lambda: db
    app.state.issue_filter_cursor_codec = FilterCursorCodec(
        "issue-filter-router-test-secret-32-bytes!!",
        now=lambda: 1_000,
    )
    return TestClient(app)


def test_issues_empty_rca_cluster_grant_returns_empty_without_repository_lookup() -> None:
    db = IssueFilterDb(
        allowed_clusters=set(),
        allowed_applications={APPLICATION_ID},
    )

    response = _make_client(db).get("/issues")

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["has_more"] is False
    assert body["next_cursor"] is None
    assert body["counts"] == {
        "filtered_count": 0,
        "unfiltered_count": 0,
        "filtered_count_completeness": "exact",
        "unfiltered_count_completeness": "exact",
    }
    assert db.data_calls == []


def test_issues_reject_unauthorized_cluster_and_application_without_existence_leak() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )
    client = _make_client(db)

    forbidden_cluster = client.get("/issues", params={"clusters": "cluster-secret"})
    forbidden_application = client.get(
        "/issues",
        params={"applications": "application-secret"},
    )

    assert forbidden_cluster.status_code == 404
    assert forbidden_application.status_code == 404
    assert "cluster-secret" not in forbidden_cluster.text
    assert "application-secret" not in forbidden_application.text
    assert "secret" not in forbidden_cluster.text.casefold()
    assert "secret" not in forbidden_application.text.casefold()
    assert db.data_calls == []


def test_issues_pass_same_axis_or_and_cross_axis_and_filters_to_repository() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID, "cluster-b"},
        allowed_applications={APPLICATION_ID, "app-b"},
    )
    client = _make_client(db)

    response = client.get(
        "/issues",
        params={
            "clusters": "cluster-b,cluster-a,cluster-b",
            "namespaces": "cluster-b/default,cluster-a/shop",
            "applications": "app-b,app-a",
            "issues.severity": "warning,critical",
            "issues.status": "resolved,open",
            "issues.environment": "staging,production",
            "issues.q": " checkout ",
            "limit": 25,
        },
    )

    assert response.status_code == 200
    assert len(db.data_calls) == 1
    kwargs = db.data_calls[0]
    filters = kwargs["filters"]
    assert filters.clusters == ("cluster-a", "cluster-b")
    assert filters.namespaces == (
        ("cluster-a", "shop"),
        ("cluster-b", "default"),
    )
    assert filters.applications == ("app-a", "app-b")
    assert filters.severities == ("critical", "warning")
    assert filters.statuses == ("open", "resolved")
    assert filters.environments == ("production", "staging")
    assert filters.query == "checkout"
    assert kwargs["allowed_cluster_ids"] == {"cluster-a", "cluster-b"}
    assert kwargs["allowed_application_ids"] == {"app-a", "app-b"}
    assert kwargs["limit"] == 25

    body = response.json()
    assert body["items"][0]["issue_id"] == "issue-a"
    assert body["items"][0]["detail_id"] == "correlation-a"
    assert body["counts"]["filtered_count"] == 1
    assert body["counts"]["unfiltered_count"] == 7
    facets = {facet["axis"]: facet for facet in body["facets"]}
    assert facets["clusters"]["value"] == CLUSTER_ID
    assert facets["namespaces"]["value"] == f"{CLUSTER_ID}/shop"
    assert facets["applications"]["value"] == APPLICATION_ID
    assert "payload" not in json.dumps(body, sort_keys=True).casefold()
    assert "bearer secret" not in json.dumps(body, sort_keys=True).casefold()


def test_issues_label_selection_is_fail_closed_when_event_time_projection_is_unavailable() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )

    response = _make_client(db).get(
        "/issues",
        params={"clusters": CLUSTER_ID, "labels": "team=checkout"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["has_more"] is False
    assert body["next_cursor"] is None
    assert body["counts"]["filtered_count"] is None
    assert body["counts"]["filtered_count_completeness"] == "unavailable"
    assert body["selected_labels"] == [
        {
            "key": "team",
            "value": "checkout",
            "selector": "team=checkout",
            "status": "unavailable",
        }
    ]
    assert "issue_label_projection_unavailable" in body["snapshot"]["partial_reason_codes"]
    # Issue 저장소가 event-time projection의 unavailable 상태를 결정한다. 이 fake에는
    # current inventory 조회 API가 없으므로 그쪽으로 fallback하면 테스트가 즉시 깨진다.
    assert len(db.data_calls) == 1
    assert db.data_calls[0]["filters"].labels == (("team", "checkout"),)


def test_issues_cursor_is_bound_to_filter_and_authorization_scope() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
        paginated=True,
    )
    client = _make_client(db)
    first = client.get(
        "/issues",
        params={
            "clusters": CLUSTER_ID,
            "issues.severity": "critical",
            "limit": 1,
        },
    )
    assert first.status_code == 200
    cursor = first.json()["next_cursor"]
    assert isinstance(cursor, str) and cursor
    assert "issue-a" not in cursor

    changed_filter = client.get(
        "/issues",
        params={
            "clusters": CLUSTER_ID,
            "issues.severity": "warning",
            "limit": 1,
            "cursor": cursor,
        },
    )
    assert changed_filter.status_code == 422

    db.allowed_clusters = {CLUSTER_ID, "cluster-b"}
    changed_authorization = client.get(
        "/issues",
        params={
            "clusters": CLUSTER_ID,
            "issues.severity": "critical",
            "limit": 1,
            "cursor": cursor,
        },
    )
    assert changed_authorization.status_code == 422


def test_issue_filter_facets_are_server_aggregated_and_mark_mutable_counts_partial() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )

    response = _make_client(db).get(
        "/issues/filter-facets",
        params={
            "axis": "severity",
            "clusters": CLUSTER_ID,
            "issues.status": "open",
            "selected": "critical",
            "facet_q": "crit",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["surface"] == "issues"
    assert body["axis"] == "severity"
    assert body["items"] == [
        {
            "axis": "severity",
            "value": "critical",
            "label": "critical",
            "match_count": 3,
            "count_completeness": "partial",
            "availability": "available",
        }
    ]
    assert body["counts"]["filtered_count"] == 3
    assert body["counts"]["filtered_count_completeness"] == "partial"
    assert body["snapshot"]["snapshot_revision"] == 0
    assert "mutable_timeline_projection" in body["snapshot"]["partial_reason_codes"]
    assert len(db.facet_calls) == 1
    call = db.facet_calls[0]
    assert call["axis"] == "severity"
    assert call["facet_query"] == "crit"
    assert call["filters"].clusters == (CLUSTER_ID,)
    assert call["filters"].statuses == ("open",)
    assert call["allowed_cluster_ids"] == {CLUSTER_ID}


def test_issue_label_facets_use_event_time_projection_and_never_client_side_inventory() -> None:
    db = IssueFilterDb(
        allowed_clusters={CLUSTER_ID},
        allowed_applications={APPLICATION_ID},
    )

    response = _make_client(db).get(
        "/issues/label-facets",
        params={
            "clusters": CLUSTER_ID,
            "labels": "tier=critical",
            "facet_q": "team=check",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["surface"] == "issues"
    assert body["items"] == [
        {
            "key": "team",
            "value": "checkout",
            "selector": "team=checkout",
            "match_count": 2,
            "count_completeness": "partial",
        }
    ]
    assert body["selected_resolutions"] == [
        {
            "key": "tier",
            "value": "critical",
            "selector": "tier=critical",
            "status": "resolved",
        }
    ]
    assert body["counts"]["unfiltered_count_completeness"] == "partial"
    assert len(db.label_facet_calls) == 1
    call = db.label_facet_calls[0]
    assert call["filters"].labels == (("tier", "critical"),)
    assert call["facet_query"] == "team=check"
    assert call["allowed_cluster_ids"] == {CLUSTER_ID}
