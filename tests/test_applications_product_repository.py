from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains.applications.repository import (
    APPLICATION_CATALOG_MAX_APPLICATIONS,
    ApplicationsProductRepository,
)
from domains.registry import Database


def _sql(statement: Any) -> str:
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return " ".join(str(compiled).casefold().split())


def _compiled(statement: Any) -> tuple[str, dict[str, Any]]:
    compiled = statement.compile(dialect=postgresql.dialect())
    sql = " ".join(str(compiled).casefold().split())
    return sql, compiled.params


class Result:
    def __init__(self, rows: list[dict[str, Any]] | None = None, scalar: int = 0) -> None:
        self.rows = rows or []
        self.scalar = scalar

    def mappings(self) -> Result:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def scalar_one(self) -> int:
        return self.scalar

    def __iter__(self) -> Iterator[dict[str, Any]]:
        return iter(self.rows)


def test_product_repository_is_composed_into_runtime_database() -> None:
    assert issubclass(Database, ApplicationsProductRepository)
    assert callable(Database.get_application_inventory_evidence)
    assert callable(Database.get_application_incident_evidence)
    assert callable(Database.get_application_catalog_states)


def test_application_inventory_query_is_workspace_application_and_cluster_scoped() -> None:
    class Connection:
        def __init__(self) -> None:
            self.statements: list[Any] = []

        def execute(self, statement: Any) -> Result:
            self.statements.append(statement)
            return Result(
                [
                    {
                        "inventory_key": "pod-a",
                        "cluster_id": "cluster-a",
                        "resource_type": "pod",
                        "api_version": "v1",
                        "kind": "Pod",
                        "namespace": "shop",
                        "name": "checkout-a",
                        "uid": "pod-uid",
                        "status": "Running",
                        "health": "healthy",
                        "labels": {"app": "checkout"},
                        "summary": {"restart_total": 0},
                        "application_binding_complete": True,
                        "observed_at": datetime(2026, 7, 14, tzinfo=UTC),
                    }
                ]
            )

    connection_value = Connection()

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield connection_value

    repository = object.__new__(ApplicationsProductRepository)
    repository.connection = connection  # type: ignore[method-assign]
    rows = repository.get_application_inventory_evidence(
        workspace_id="workspace-a",
        application_id="app-a",
        allowed_cluster_ids={"cluster-a"},
    )

    sql = _sql(connection_value.statements[0])
    assert "inventory_resource_versions.workspace_id = 'workspace-a'" in sql
    assert "inventory_resource_versions.cluster_id in ('cluster-a')" in sql
    assert "inventory_resource_versions.valid_to_revision is null" in sql
    assert "inventory_resource_application_versions.application_id = 'app-a'" in sql
    assert rows[0]["id"] == "pod-a"
    assert set(rows[0]) == {
        "id",
        "cluster_id",
        "resource_type",
        "api_version",
        "kind",
        "namespace",
        "name",
        "uid",
        "status",
        "health",
        "labels",
        "summary",
        "binding_complete",
        "observed_at",
    }


def test_application_incident_query_requires_exact_application_projection() -> None:
    class Connection:
        def __init__(self) -> None:
            self.statements: list[Any] = []
            self.call = 0

        def execute(self, statement: Any) -> Result:
            self.statements.append(statement)
            self.call += 1
            if self.call == 1:
                return Result([])
            if self.call == 2:
                return Result(scalar=0)
            return Result(scalar=0)

    connection_value = Connection()

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield connection_value

    repository = object.__new__(ApplicationsProductRepository)
    repository.connection = connection  # type: ignore[method-assign]
    result = repository.get_application_incident_evidence(
        workspace_id="workspace-a",
        application_id="app-a",
        allowed_cluster_ids={"cluster-a"},
    )

    compiled = [_compiled(statement) for statement in connection_value.statements]
    item_sql, item_params = compiled[0]
    incomplete_sql, incomplete_params = compiled[1]
    open_sql, open_params = compiled[2]
    for sql, params in compiled:
        assert "rca_timeline.workspace_id =" in sql
        assert "rca_timeline.cluster_id in" in sql
        assert "rca_timeline.incident_id is not null" in sql
        assert "workspace-a" in params.values()
        assert any(value == ["cluster-a"] for value in params.values())
    assert "rca_timeline.application_ids_complete is true" in item_sql
    assert "rca_timeline.application_ids @>" in item_sql
    assert ["app-a"] in item_params.values()
    assert "rca_timeline.application_ids_complete is false" in incomplete_sql
    assert "app-a" not in incomplete_params.values()
    assert ["app-a"] in open_params.values()
    assert result == {"complete": True, "open_count": 0, "items": []}


def test_application_catalog_reads_200_states_with_seven_statements() -> None:
    application_ids = [f"app-{index:03d}" for index in range(APPLICATION_CATALOG_MAX_APPLICATIONS)]
    observed_at = datetime(2026, 7, 14, 10, tzinfo=UTC)
    bindings = [
        {
            "application_id": application_id,
            "binding_id": f"binding-{application_id}",
            "cluster_id": "cluster-a",
            "namespace": "shop",
            "environment": "prod",
            "status": "active",
        }
        for application_id in application_ids
    ]
    runs = [
        {
            "workflow_run_id": f"run-{application_id}",
            "workspace_id": "workspace-a",
            "application_id": application_id,
            "binding_id": f"binding-{application_id}",
            "environment": "prod",
            "cluster_id": "cluster-a",
            "commit_sha": f"sha-{application_id}",
            "status": "succeeded",
            "current_step": "done",
            "summary": "deployed",
            "command_id": None,
            "metadata": {},
            "created_at": observed_at,
            "updated_at": observed_at,
        }
        for application_id in application_ids
    ]
    steps = [
        {
            "workflow_run_id": f"run-{application_id}",
            "name": "diff",
            "status": "succeeded",
            "message": None,
            "details": {"status": "no_change", "has_changes": False, "changes": []},
            "updated_at": observed_at,
        }
        for application_id in application_ids
    ]
    inventory = [
        {
            "application_id": application_id,
            "inventory_key": f"pod-{application_id}",
            "cluster_id": "cluster-a",
            "resource_type": "pod",
            "api_version": "v1",
            "kind": "Pod",
            "namespace": "shop",
            "name": f"pod-{application_id}",
            "uid": f"uid-{application_id}",
            "status": "Running",
            "health": "healthy",
            "labels": {"app": application_id},
            "summary": {"restart_total": 0},
            "application_binding_complete": True,
            "observed_at": observed_at,
        }
        for application_id in application_ids
    ]
    incidents = [
        {
            "application_id": application_ids[0],
            "incident_id": "incident-a",
            "correlation_id": "corr-a",
            "incident_symptom": "CrashLoopBackOff",
            "root_cause": None,
            "status": "incident_detected",
            "created_at": observed_at,
            "updated_at": observed_at,
            "open_count": 1,
            "rank": 1,
        }
    ]
    snapshot_contexts = [
        {
            "revision_id": 42,
            "snapshot_id": "snapshot-a",
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "observed_at": observed_at,
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
            "created_at": observed_at,
            "rank": 1,
        }
    ]

    class Connection:
        def __init__(self) -> None:
            self.statements: list[Any] = []
            self.results = [
                Result(bindings),
                Result(runs),
                Result(steps),
                Result(inventory),
                Result(incidents),
                Result(scalar=1),
                Result(snapshot_contexts),
            ]

        def execute(self, statement: Any) -> Result:
            self.statements.append(statement)
            return self.results.pop(0)

    connection_value = Connection()

    @contextmanager
    def connection() -> Iterator[Connection]:
        yield connection_value

    repository = object.__new__(ApplicationsProductRepository)
    repository.connection = connection  # type: ignore[method-assign]

    states = repository.get_application_catalog_states(
        workspace_id="workspace-a",
        application_ids=application_ids,
        allowed_cluster_ids={"cluster-a"},
    )

    assert len(connection_value.statements) == 7
    assert len(states) == APPLICATION_CATALOG_MAX_APPLICATIONS
    first = states[application_ids[0]]
    assert first["bindings"][0]["cluster_id"] == "cluster-a"
    assert first["runs"][0]["steps"][0]["name"] == "diff"
    assert first["inventory_rows"][0]["id"] == f"pod-{application_ids[0]}"
    assert first["inventory_context"]["snapshot_revision"] == 42
    assert first["incident_evidence"] == {
        "complete": False,
        "open_count": None,
        "items": [
            {
                "id": "incident-a",
                "title": "CrashLoopBackOff",
                "status": "incident_detected",
                "started_at": observed_at.isoformat(),
                "updated_at": observed_at.isoformat(),
            }
        ],
    }
    sql = [_compiled(statement)[0] for statement in connection_value.statements]
    assert "row_number() over (partition by applications.application_id" in sql[0]
    assert "row_number() over (partition by workflow_runs.application_id" in sql[1]
    assert "join lateral jsonb_array_elements_text" in sql[4]
    assert "application_ids_complete is false" in sql[5]
    assert "row_number() over (partition by inventory_filter_revisions.cluster_id" in sql[6]


def test_application_catalog_rejects_more_than_contract_limit_before_query() -> None:
    repository = object.__new__(ApplicationsProductRepository)

    with pytest.raises(ValueError, match="application catalog batch exceeds 200"):
        repository.get_application_catalog_states(
            workspace_id="workspace-a",
            application_ids=[f"app-{index:03d}" for index in range(201)],
            allowed_cluster_ids={"cluster-a"},
        )
