from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.gitops.overview_query import parse_gitops_overview_filters
from domains.gitops.overview_repository import GitOpsOverviewRepository


class _Result:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self.rows)


class _Connection:
    def __init__(self) -> None:
        self.statements: list[Any] = []
        self.results = [
            _Result(
                [
                    {
                        "application_id": "app-a",
                        "application_name": "storefront",
                        "binding_id": "binding-a",
                        "cluster_id": "cluster-a",
                        "namespace": "argocd",
                        "environment": "production",
                        "status": "active",
                        "revision": "abc123",
                        "observed_at": None,
                    }
                ]
            ),
            _Result(
                [
                    {
                        "version_id": 17,
                        "cluster_id": "cluster-a",
                        "api_version": "argoproj.io/v1alpha1",
                        "kind": "Application",
                        "namespace": "argocd",
                        "name": "storefront",
                        "uid": "application-uid",
                        "resource_version": "17",
                    }
                ]
            ),
            _Result([{"version_id": 17, "application_id": "app-a"}]),
        ]

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        return self.results.pop(0)


def test_overview_repository_uses_fixed_bounded_temporal_queries() -> None:
    connection_instance = _Connection()

    @contextmanager
    def connection() -> Iterator[_Connection]:
        yield connection_instance

    repository = object.__new__(GitOpsOverviewRepository)
    repository.connection = connection  # type: ignore[method-assign]
    filters = parse_gitops_overview_filters(
        clusters="cluster-a",
        namespaces="cluster-a/argocd",
        applications=None,
        providers=None,
        kinds="Application",
        labels=None,
        query="store",
    )

    result = repository.list_gitops_overview(
        workspace_id="workspace-a",
        allowed_cluster_ids={"cluster-a"},
        allowed_application_ids={"app-a"},
        filters=filters,
        snapshot_revision=42,
        limit=100,
    )

    assert len(connection_instance.statements) == 3
    assert result["has_more"] is False
    assert result["inventory_rows"][0]["application_ids"] == ["app-a"]
    registered_sql = _sql(connection_instance.statements[0])
    inventory_sql = _sql(connection_instance.statements[1])
    assert "deployment_bindings.workspace_id = 'workspace-a'" in registered_sql
    assert "deployment_bindings.cluster_id in ('cluster-a')" in registered_sql
    assert "applications.application_id in ('app-a')" in registered_sql
    assert "limit 101" in registered_sql
    assert "inventory_resource_versions.workspace_id = 'workspace-a'" in inventory_sql
    assert "inventory_resource_versions.cluster_id in ('cluster-a')" in inventory_sql
    assert "inventory_filter_revisions.revision_id <= 42" in inventory_sql
    assert "argoproj.io/%" in inventory_sql
    assert "source.toolkit.fluxcd.io/%" in inventory_sql
    assert "limit 101" in inventory_sql


def _sql(statement: Any) -> str:
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return " ".join(str(compiled).casefold().split())
