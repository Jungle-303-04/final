from __future__ import annotations

from typing import Any

from sqlalchemy.dialects import postgresql

from domains.application_filter.query import parse_application_filters, without_facet_axis
from domains.application_filter.repository import (
    _apply_application_filters,
    _authorized_applications,
    _facet_statement,
    _serialize_application,
)


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-a",
        "namespaces": "cluster-a/shop",
        "applications": "app-a",
        "environments": "production",
        "statuses": "active",
        "pending_promotion": "false",
        "labels": None,
        "query": "checkout",
    }
    values.update(overrides)
    return parse_application_filters(**values)


def _sql(statement: Any) -> str:
    return " ".join(str(statement.compile(dialect=postgresql.dialect())).casefold().split())


def test_application_source_scopes_workspace_apps_clusters_and_latest_run() -> None:
    sql = _sql(_authorized_applications("workspace-a", ("cluster-a",), ("app-a",)))

    assert "applications.workspace_id =" in sql
    assert "applications.application_id in" in sql
    assert "workflow_runs.workspace_id =" in sql
    assert "workflow_runs.cluster_id in" in sql
    assert "row_number() over" in sql
    assert "workflow_run_rank =" in sql
    assert "deployment_bindings.workspace_id = applications.workspace_id" in sql
    assert "deployment_bindings.repository_id = applications.repository_id" in sql
    assert "deployment_bindings.app_name = applications.name" in sql
    assert "credential_ref" not in sql
    assert "access_policy" not in sql
    assert "metadata" not in sql


def test_application_filters_keep_cluster_namespace_environment_on_one_binding() -> None:
    source = _authorized_applications("workspace-a", ("cluster-a",), ("app-a",)).cte("apps")
    sql = _sql(
        _apply_application_filters(
            source,
            filters=_filters(),
            allowed_cluster_ids=("cluster-a",),
            allowed_application_ids=("app-a",),
        )
    )

    assert sql.count("exists (select") == 1
    assert "deployment_bindings.cluster_id in" in sql
    assert "deployment_bindings.namespace =" in sql
    assert "lower(deployment_bindings.environment) in" in sql
    assert "deployment_bindings.status =" in sql
    assert "pending_promotion is false" in sql


def test_application_labels_fail_closed_instead_of_reading_metadata() -> None:
    source = _authorized_applications("workspace-a", ("cluster-a",), ("app-a",)).cte("apps")
    sql = _sql(
        _apply_application_filters(
            source,
            filters=_filters(labels="team=checkout"),
            allowed_cluster_ids=("cluster-a",),
            allowed_application_ids=("app-a",),
        )
    )

    assert "where false" in sql
    assert "metadata" not in sql


def test_all_application_facets_compile_without_sensitive_columns() -> None:
    source = _authorized_applications("workspace-a", ("cluster-a",), ("app-a",)).cte("apps")
    filters = _filters()

    for axis in (
        "clusters",
        "namespaces",
        "applications",
        "environment",
        "status",
        "pending_promotion",
    ):
        facet_filters = without_facet_axis(filters, axis)
        facet_source = _apply_application_filters(
            source,
            filters=facet_filters,
            allowed_cluster_ids=("cluster-a",),
            allowed_application_ids=("app-a",),
        ).cte(f"facet_{axis}")
        sql = _sql(
            _facet_statement(
                facet_source,
                filters=facet_filters,
                axis=axis,
                allowed_cluster_ids=("cluster-a",),
                facet_query=None,
                position=None,
                limit=50,
            )
        )
        assert "credential_ref" not in sql
        assert "access_policy" not in sql
        assert "metadata" not in sql


def test_application_serializer_whitelists_provider_neutral_fields() -> None:
    item = _serialize_application(
        {
            "application_id": "app-a",
            "repository_id": "repo-a",
            "name": "checkout",
            "status": "active",
            "pending_promotion": False,
            "updated_at": "2026-07-14T01:00:00Z",
            "metadata": {"credential_ref": "secret"},
        },
        bindings={},
    )

    assert set(item) == {
        "application_id",
        "display_name",
        "repository_ids",
        "cluster_ids",
        "namespace_refs",
        "environments",
        "lifecycle_status",
        "pending_promotion",
        "binding_count",
        "updated_at",
        "binding_completeness",
        "label_projection_completeness",
    }
    assert "secret" not in str(item)
