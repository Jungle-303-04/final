"""Issues repository SQL and authorization-bound serialization contracts."""

from __future__ import annotations

from typing import Any

from sqlalchemy.dialects import postgresql

from domains.dashboard.router import queue_issue_item
from domains.issue_filter.query import parse_issue_filters, without_facet_axis
from domains.issue_filter.repository import (
    IssueFilterRepository,
    _apply_issue_filters,
    _authorized_issues,
    _label_facet_statement,
    _queue_visibility,
    _selected_label_match_counts,
    _serialize_issue,
    _serialize_queue_issue,
)


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-a",
        "namespaces": "cluster-a/shop",
        "applications": "app-a",
        "severities": "critical",
        "categories": "container_restart",
        "statuses": "open",
        "environments": "production",
        "labels": "team=payments,tier=api",
        "query": "checkout",
    }
    values.update(overrides)
    return parse_issue_filters(**values)


def _sql(statement: Any) -> str:
    return " ".join(str(statement.compile(dialect=postgresql.dialect())).lower().split())


def test_authorized_issue_source_is_cluster_scoped_deduplicated_and_payload_free() -> None:
    sql = _sql(_authorized_issues("workspace-a", {"cluster-a"}))

    assert "rca_timeline.workspace_id =" in sql
    assert "rca_timeline.cluster_id in" in sql
    assert "partition by rca_timeline.cluster_id, rca_timeline.incident_id" in sql
    assert "row_number() over" in sql
    assert "issue_rank =" in sql
    assert "payload" not in sql


def test_empty_cluster_authorization_never_checks_out_a_connection() -> None:
    repository = object.__new__(IssueFilterRepository)

    def forbidden_connection():
        raise AssertionError("empty authorization must not reach the database")

    repository.connection = forbidden_connection  # type: ignore[method-assign]
    result = repository.list_filtered_issues(
        workspace_id="workspace-a",
        allowed_cluster_ids=set(),
        allowed_application_ids={"app-a"},
        filters=_filters(),
        position=None,
        limit=50,
    )

    assert result["items"] == []
    assert result["counts"]["filtered_count"] == 0


def test_application_or_and_label_and_filters_require_complete_jsonb_projection() -> None:
    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")
    filters = _filters(applications="app-a,app-b", labels="team=payments,tier=api")
    statement = _apply_issue_filters(
        source,
        filters=filters,
        allowed_application_ids={"app-a", "app-b"},
    )
    sql = _sql(statement)

    assert "application_ids_complete is true" in sql
    assert "labels_complete is true" in sql
    assert "category_complete is true" in sql
    assert "category in" in sql
    assert sql.count("application_ids @>") == 2
    assert sql.count("labels @>") == 2

    denied = _sql(
        _apply_issue_filters(
            source,
            filters=filters,
            allowed_application_ids={"app-a"},
        )
    )
    assert "where false" in denied


def test_label_facet_candidates_keep_existing_label_selectors_as_and_predicates() -> None:
    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")
    filtered = _apply_issue_filters(
        source,
        filters=_filters(labels="team=payments,tier=api"),
        allowed_application_ids={"app-a"},
    ).cte("filtered_issues")
    sql = _sql(
        _label_facet_statement(
            filtered,
            facet_query=None,
            position=None,
            limit=50,
        )
    )

    assert "jsonb_each_text" in sql
    assert sql.count("labels @>") == 2
    assert "labels_complete is true" in sql


def test_embedded_facet_source_removes_only_its_own_axis() -> None:
    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")
    filters = _filters(severities="critical,warning", statuses="open")
    sql = _sql(
        _apply_issue_filters(
            source,
            filters=without_facet_axis(filters, "severity"),
            allowed_application_ids={"app-a"},
        )
    )

    assert "severity in" not in sql
    assert "issue_state in" in sql


def test_queue_filters_are_authorized_bounded_and_count_matches_before_cap() -> None:
    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")
    statement = _apply_issue_filters(
        source,
        filters=_filters(
            namespaces="cluster-a/shop",
            severities="critical,warning",
            categories="container_restart,scheduling",
        ),
        allowed_application_ids={"app-a"},
    ).limit(100)
    sql = _sql(statement)

    assert "workspace_id" in sql
    assert "cluster_id in" in sql
    assert "namespace =" in sql
    assert "severity_complete is true" in sql
    assert "category_complete is true" in sql
    assert "limit" in sql


def test_empty_queue_authorization_never_checks_out_a_connection() -> None:
    repository = object.__new__(IssueFilterRepository)

    def forbidden_connection():
        raise AssertionError("empty authorization must not reach the database")

    repository.connection = forbidden_connection  # type: ignore[method-assign]
    result = repository.list_rca_issue_queue(
        "workspace-a",
        set(),
        namespaces=(("cluster-a", "shop"),),
        severities=("critical",),
        categories=("container_restart",),
        limit=50,
    )

    assert result["items"] == []
    assert result["total_matched"] == 0
    assert result["visibility"]["state"] == "restricted"
    assert result["visibility"]["reason_codes"] == ["no_authorized_clusters"]


def test_queue_visibility_reports_permission_scoped_results() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def one(self) -> dict[str, int]:
            return {
                "total": 4,
                "namespaces_complete": 4,
                "severity_complete": 4,
                "category_complete": 4,
            }

    class Connection:
        def execute(self, statement: Any) -> Result:
            return Result()

    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")
    visibility = _queue_visibility(
        Connection(),
        source,
        requested_namespaces=(),
        filters=_filters(
            namespaces=None,
            severities=None,
            categories=None,
            applications=None,
            statuses=None,
            environments=None,
            labels=None,
            query=None,
        ),
        authorized_cluster_count=1,
        permission_scope_limited=True,
    )

    assert visibility == {
        "state": "partial",
        "completeness": "partial",
        "authorized_cluster_count": 1,
        "requested_namespaces": [],
        "reason_codes": ["cluster_scope_permission_limited"],
    }


class _EmptyMappingsResult:
    def mappings(self) -> _EmptyMappingsResult:
        return self

    def __iter__(self):
        return iter(())


class _RecordingConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _EmptyMappingsResult:
        self.statements.append(statement)
        return _EmptyMappingsResult()


def test_selected_label_counts_use_one_grouped_statement_for_all_selectors() -> None:
    connection = _RecordingConnection()
    source = _authorized_issues("workspace-a", {"cluster-a"}).cte("authorized_issues")

    result = _selected_label_match_counts(
        connection,
        source,
        filters=_filters(labels="team=payments,tier=api"),
        allowed_application_ids={"app-a"},
    )

    assert len(connection.statements) == 1
    sql = _sql(connection.statements[0])
    assert "jsonb_each_text" in sql
    assert "group by" in sql
    assert result == [
        {"key": "team", "value": "payments", "match_count": 0},
        {"key": "tier", "value": "api", "match_count": 0},
    ]


def test_application_redaction_downgrades_row_completeness() -> None:
    item = _serialize_issue(
        {
            "issue_id": "issue:cluster-a:incident-a",
            "detail_id": "incident-a",
            "correlation_id": "correlation-a",
            "cluster_id": "cluster-a",
            "namespace": "shop",
            "resource_kind": "Deployment",
            "resource_name": "checkout",
            "symptom": "ImagePullBackOff",
            "severity": "critical",
            "category": "container_restart",
            "category_complete": True,
            "issue_state": "open",
            "current_subject": "incidents.detected",
            "pipeline_status": "incident_detected",
            "environment": None,
            "environment_complete": False,
            "application_ids": ["app-a", "app-secret"],
            "application_ids_complete": True,
            "labels_complete": False,
            "root_cause": None,
            "confidence": None,
            "updated_at": "2026-07-13T20:20:00Z",
        },
        allowed_application_ids={"app-a"},
    )

    assert item["application_ids"] == ["app-a"]
    assert item["application_binding_completeness"] == "partial"
    assert "app-secret" not in str(item)


def test_queue_projection_restores_dashboard_contract_field_names() -> None:
    projected = _serialize_queue_issue(
        {
            "workspace_id": "workspace-a",
            "correlation_id": "correlation-a",
            "cluster_id": "cluster-a",
            "detail_id": "incident-a",
            "namespace": "shop",
            "resource_kind": "Deployment",
            "resource_name": "checkout",
            "symptom": "ImagePullBackOff",
            "severity": "critical",
            "severity_complete": True,
            "category": "container_restart",
            "category_complete": True,
            "current_subject": "incident.detected",
            "pipeline_status": "incident_detected",
            "supporting_evidence": [],
            "missing_evidence": [],
            "updated_at": "2026-07-17T00:00:00Z",
        }
    )

    item = queue_issue_item(projected)

    assert item.incident_id == "incident-a"
    assert item.incident_namespace == "shop"
    assert item.incident_resource_kind == "Deployment"
    assert item.incident_resource_name == "checkout"
    assert item.incident_symptom == "ImagePullBackOff"
    assert item.status == "incident_detected"
