"""Inventory filter SQL and product-wide facet projection contracts."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.inventory_filter import repository as repository_module
from domains.inventory_filter.query import ResourceFilters, parse_resource_filters
from domains.inventory_filter.repository import (
    InventoryFilterRepository,
    _apply_resource_filters,
    _current_versions,
    _physical_topology_statements,
    _resource_metric_history_statements,
)


def _filters(**overrides: str | bool | None) -> ResourceFilters:
    values: dict[str, str | bool | None] = {
        "clusters": "cluster-a,cluster-b",
        "namespaces": "cluster-a/shop,cluster-b/ops",
        "applications": "app-a,app-b",
        "resource_types": "deployment,service",
        "health": "healthy,degraded",
        "labels": "team=payments,tier=api",
        "query": "checkout",
        "include_deleted": False,
    }
    values.update(overrides)
    return parse_resource_filters(
        clusters=values["clusters"] if isinstance(values["clusters"], str) else None,
        namespaces=(values["namespaces"] if isinstance(values["namespaces"], str) else None),
        applications=(values["applications"] if isinstance(values["applications"], str) else None),
        resource_types=(
            values["resource_types"] if isinstance(values["resource_types"], str) else None
        ),
        health=values["health"] if isinstance(values["health"], str) else None,
        labels=values["labels"] if isinstance(values["labels"], str) else None,
        query=values["query"] if isinstance(values["query"], str) else None,
        include_deleted=bool(values["include_deleted"]),
    )


def _sql(statement: Any) -> str:
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return " ".join(str(compiled).casefold().split())


class _EmptyResult:
    def mappings(self) -> _EmptyResult:
        return self

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(())


class _RecordingConnection:
    def __init__(self) -> None:
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _EmptyResult:
        self.statements.append(statement)
        return _EmptyResult()


class _MappedResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _MappedResult:
        return self

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self.rows)

    def all(self) -> list[dict[str, Any]]:
        return self.rows


def test_current_versions_are_workspace_authorization_and_snapshot_scoped() -> None:
    sql = _sql(
        _current_versions(
            "workspace-a",
            ("cluster-a", "cluster-b"),
            42,
            include_deleted=False,
        )
    )

    assert "inventory_filter_revisions.workspace_id = 'workspace-a'" in sql
    assert "inventory_filter_revisions.cluster_id in ('cluster-a', 'cluster-b')" in sql
    assert "inventory_filter_revisions.revision_id <= 42" in sql
    assert "inventory_resource_versions.workspace_id = 'workspace-a'" in sql
    assert "inventory_resource_versions.cluster_id in ('cluster-a', 'cluster-b')" in sql
    assert "inventory_resource_versions.valid_from_revision <= 42" in sql
    assert "inventory_resource_versions.valid_to_revision > 42" in sql
    assert (
        "inventory_revisions_at_cursor.workspace_id = inventory_resource_versions.workspace_id"
        in sql
    )
    assert (
        "inventory_revisions_at_cursor.cluster_id = inventory_resource_versions.cluster_id" in sql
    )


def test_resolve_filter_clusters_returns_complete_response_identity() -> None:
    class Connection:
        def execute(self, _statement: Any) -> _MappedResult:
            return _MappedResult(
                [
                    {
                        "cluster_id": "cluster-a",
                        "name": "production",
                        "settings": {"cloud_provider": "eks"},
                    }
                ]
            )

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield Connection()

    repository = object.__new__(InventoryFilterRepository)
    repository.connection = connection  # type: ignore[method-assign]

    assert repository.resolve_filter_clusters("workspace-a", {"cluster-a"}) == {
        "cluster-a": {
            "cluster_id": "cluster-a",
            "name": "production",
            "provider": "eks",
        }
    }


def test_filter_snapshot_contexts_reads_each_cluster_freshness_in_one_scoped_query() -> None:
    class Connection:
        def __init__(self) -> None:
            self.statements: list[Any] = []

        def execute(self, statement: Any) -> _MappedResult:
            self.statements.append(statement)
            return _MappedResult(
                [
                    {
                        "cluster_id": "cluster-a",
                        "revision_id": 8,
                        "observed_at": None,
                        "labels_complete": True,
                        "resources_complete": True,
                        "application_bindings_complete": True,
                        "partial_reason_codes": [],
                    }
                ]
            )

    connection_instance = Connection()

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield connection_instance

    repository = object.__new__(InventoryFilterRepository)
    repository.connection = connection  # type: ignore[method-assign]

    contexts = repository.filter_snapshot_contexts("workspace-a", {"cluster-a", "cluster-b"})

    assert len(connection_instance.statements) == 1
    assert contexts == {
        "cluster-a": {
            "snapshot_revision": 8,
            "observed_at": None,
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
        },
        "cluster-b": {
            "snapshot_revision": 0,
            "observed_at": None,
            "labels_complete": False,
            "resources_complete": False,
            "application_bindings_complete": False,
            "partial_reason_codes": ["missing_inventory_projection"],
        },
    }
    sql = _sql(connection_instance.statements[0])
    assert "workspace_id = 'workspace-a'" in sql
    assert "cluster_id in ('cluster-a', 'cluster-b')" in sql


def test_resource_filter_sql_uses_same_axis_or_cross_axis_and_and_label_and() -> None:
    source = _current_versions(
        "workspace-a",
        ("cluster-a", "cluster-b"),
        42,
        include_deleted=False,
    )
    sql = _sql(
        _apply_resource_filters(
            source,
            filters=_filters(),
            allowed_application_ids=("app-a", "app-b"),
        )
    )

    # Scalar axes use IN (OR within the axis); namespace pairs use one OR group.
    assert "cluster_id in ('cluster-a', 'cluster-b')" in sql
    assert "resource_type in ('deployment', 'service')" in sql
    assert "health in ('degraded', 'healthy')" in sql
    assert "cluster_id = 'cluster-a' and" in sql
    assert "namespace = 'shop' or" in sql
    assert "cluster_id = 'cluster-b' and" in sql
    assert "namespace = 'ops'" in sql

    # Independent where predicates are ANDed, while every label gets its own EXISTS.
    assert sql.count("exists (select") == 3
    assert "selected_label_0.key = 'team'" in sql
    assert "selected_label_0.value = 'payments'" in sql
    assert "selected_label_1.key = 'tier'" in sql
    assert "selected_label_1.value = 'api'" in sql
    assert "inventory_resource_application_versions.application_id in ('app-a', 'app-b')" in sql
    assert "search_text like '%%checkout%%'" in sql


def test_physical_topology_sql_is_scoped_ranked_and_server_evaluates_filter_matches() -> None:
    server_statement, pod_statement, count_statement = _physical_topology_statements(
        workspace_id="workspace-a",
        cluster_ids=("cluster-a",),
        allowed_application_ids=("app-a", "app-b"),
        filters=_filters(clusters="cluster-a", namespaces="cluster-a/shop"),
        snapshot_revision=42,
    )
    server_sql = _sql(server_statement)
    pod_sql = _sql(pod_statement)
    count_sql = _sql(count_statement)

    for sql in (server_sql, pod_sql, count_sql):
        assert "workspace_id = 'workspace-a'" in sql
        assert "cluster_id in ('cluster-a')" in sql
        assert "revision_id <= 42" in sql
        assert "valid_from_revision <= 42" in sql
        assert "valid_to_revision > 42" in sql

    assert "resource_type = 'node'" in server_sql
    assert "resource_type = 'pod'" in pod_sql
    assert "physical_topology_filter_matches.version_id" in pod_sql
    assert "matches_filter" in pod_sql
    assert "row_number() over (partition by" in pod_sql
    assert "placement_rank <= 12" in pod_sql
    assert "matched_pod_count" in pod_sql
    assert "selected_label_0.key = 'team'" in pod_sql
    assert "selected_label_1.key = 'tier'" in pod_sql
    assert "application_id in ('app-a', 'app-b')" in pod_sql
    assert "filtered_count" in count_sql
    assert "unfiltered_count" in count_sql


def test_metric_history_sql_rechecks_filter_and_pins_samples_to_revision() -> None:
    resource_statement, history_statement = _resource_metric_history_statements(
        workspace_id="workspace-a",
        cluster_ids=("cluster-a",),
        allowed_application_ids=("app-a",),
        filters=_filters(clusters="cluster-a", namespaces="cluster-a/shop"),
        snapshot_revision=42,
        resource_ids=("pod-a", "pod-b"),
        window_seconds=3600,
        limit=60,
    )
    resource_sql = _sql(resource_statement)
    history_sql = _sql(history_statement)

    assert "workspace_id = 'workspace-a'" in resource_sql
    assert "cluster_id in ('cluster-a')" in resource_sql
    assert "valid_from_revision <= 42" in resource_sql
    assert "valid_to_revision > 42" in resource_sql
    assert "resource_type in ('pod', 'node')" in resource_sql
    assert "resource_type = 'node' or" in resource_sql
    assert "inventory_key in ('pod-a', 'pod-b')" in resource_sql
    assert "selected_label_0.key = 'team'" in resource_sql
    assert "application_id in ('app-a')" in resource_sql

    assert "cluster_usage_samples" in history_sql
    assert "inventory_filter_revisions" in history_sql
    assert (
        "inventory_filter_revisions.snapshot_id = cluster_usage_samples.snapshot_id" in history_sql
    )
    assert "inventory_filter_revisions.revision_id <= 42" in history_sql
    assert "row_number() over (partition by cluster_usage_samples.cluster_id" in history_sql
    assert "recency_rank <= 60" in history_sql


def test_global_facets_remove_only_their_own_axis_and_compile_scoped_sql(
    monkeypatch: Any,
) -> None:
    connection = _RecordingConnection()

    @contextmanager
    def recording_connection() -> Iterator[_RecordingConnection]:
        yield connection

    repository = object.__new__(InventoryFilterRepository)
    repository.connection = recording_connection  # type: ignore[method-assign]
    selected = _filters(query=None)
    applied: list[ResourceFilters] = []
    original_apply = repository_module._apply_resource_filters

    def record_apply(*args: Any, **kwargs: Any) -> Any:
        applied.append(kwargs["filters"])
        return original_apply(*args, **kwargs)

    monkeypatch.setattr(repository_module, "_apply_resource_filters", record_apply)

    result = repository.list_global_filter_facets(
        workspace_id="workspace-a",
        allowed_cluster_ids={"cluster-a", "cluster-b"},
        allowed_application_ids={"app-a", "app-b"},
        filters=selected,
        snapshot_revision=42,
        query="check",
        limit=20,
    )

    assert result == {
        "clusters": [],
        "namespaces": [],
        "applications": [],
        "resource_types": [],
        "labels": [],
        "resources": [],
    }
    assert len(applied) == 5
    assert applied[0].clusters == ()
    assert applied[0].namespaces == selected.namespaces
    assert applied[0].applications == selected.applications
    assert applied[1].clusters == selected.clusters
    assert applied[1].namespaces == ()
    assert applied[1].applications == selected.applications
    assert applied[2].clusters == selected.clusters
    assert applied[2].namespaces == selected.namespaces
    assert applied[2].applications == ()
    assert applied[3].resource_types == ()
    assert applied[3].clusters == selected.clusters
    assert applied[4] == selected
    assert all(item.query is None and item.include_deleted is False for item in applied)

    # Every candidate group is a real PostgreSQL-compilable statement. The common
    # temporal source keeps tenant, cluster authorization, and cursor boundaries in
    # all five queries; application candidates also retain application authorization.
    assert len(connection.statements) == 6
    sql_by_group = [_sql(statement) for statement in connection.statements]
    for sql in sql_by_group:
        assert "workspace_id = 'workspace-a'" in sql
        assert "cluster_id in ('cluster-a', 'cluster-b')" in sql
        assert "revision_id <= 42" in sql
        assert "valid_from_revision <= 42" in sql
        assert "valid_to_revision > 42" in sql
    assert "applications.application_id in ('app-a', 'app-b')" in sql_by_group[2]
    assert (
        "inventory_resource_application_versions.application_id in ('app-a', 'app-b')"
        in sql_by_group[0]
    )
    assert (
        "inventory_resource_application_versions.application_id in ('app-a', 'app-b')"
        in sql_by_group[1]
    )
    assert (
        "inventory_resource_application_versions.application_id in ('app-a', 'app-b')"
        in sql_by_group[3]
    )
    assert (
        "inventory_resource_application_versions.application_id in ('app-a', 'app-b')"
        in sql_by_group[4]
    )
