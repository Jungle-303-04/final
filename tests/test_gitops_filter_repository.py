from __future__ import annotations

from typing import Any

from domains.gitops_filter.query import parse_gitops_filters
from domains.gitops_filter.repository import (
    _apply_gitops_filters,
    _authorized_changes,
    _serialize_change,
)
from sqlalchemy.dialects import postgresql


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-a",
        "namespaces": "cluster-a/shop",
        "applications": "app-a",
        "environments": "production",
        "approvals": "pending",
        "change_types": None,
        "labels": None,
        "query": "checkout",
    }
    values.update(overrides)
    return parse_gitops_filters(**values)


def _sql(statement: Any) -> str:
    return " ".join(str(statement.compile(dialect=postgresql.dialect())).casefold().split())


def test_gitops_source_is_tenant_and_grant_scoped_without_sensitive_columns() -> None:
    sql = _sql(_authorized_changes("workspace-a", ("cluster-a",), ("app-a",)))

    assert "workflow_runs.workspace_id =" in sql
    assert "workflow_runs.cluster_id in" in sql
    assert "workflow_runs.application_id in" in sql
    assert "deployment_bindings.workspace_id = workflow_runs.workspace_id" in sql
    assert "approvals.workspace_id = workflow_runs.workspace_id" in sql
    assert "row_number() over" in sql
    assert "credential_ref" not in sql
    assert "access_policy" not in sql
    assert "metadata" not in sql
    assert "details" not in sql


def test_change_type_and_labels_fail_closed_instead_of_reading_raw_payloads() -> None:
    source = _authorized_changes("workspace-a", ("cluster-a",), ("app-a",)).cte("changes")
    sql = _sql(
        _apply_gitops_filters(
            source,
            filters=_filters(change_types="image", labels="team=checkout"),
            allowed_cluster_ids=("cluster-a",),
            allowed_application_ids=("app-a",),
        )
    )

    assert "where false" in sql
    assert "metadata" not in sql
    assert "details" not in sql


def test_gitops_serializer_whitelists_provider_neutral_fields() -> None:
    item = _serialize_change(
        {
            "workflow_run_id": "run-1",
            "application_id": "app-a",
            "repository_id": "repo-a",
            "binding_id": "binding-a",
            "cluster_id": "cluster-a",
            "namespace": "shop",
            "environment": "production",
            "commit_sha": "abc123",
            "status": "waiting_for_approval",
            "current_step": "approval",
            "approval_status": "pending",
            "summary": "checkout rollout",
            "updated_at": "2026-07-14T03:00:00Z",
            "metadata": {"credential_ref": "secret"},
        }
    )

    assert set(item) == {
        "change_id",
        "application_id",
        "repository_id",
        "binding_id",
        "cluster_id",
        "namespace",
        "environment",
        "revision",
        "status",
        "current_step",
        "approval_status",
        "change_type",
        "summary",
        "updated_at",
        "change_type_completeness",
        "label_projection_completeness",
    }
    assert "secret" not in str(item)
