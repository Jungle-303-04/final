from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy.dialects import postgresql

from domains.helm.repository import HelmReleaseRepository


def test_helm_storage_query_selects_only_allowlisted_metadata() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[object]:
            return []

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect

    assert (
        repository.list_helm_storage_observations(
            workspace_id="workspace-a",
            cluster_ids={"cluster-a"},
            namespaces={"storefront"},
        )
        == []
    )

    assert connection.statement is not None
    selected = set(connection.statement.selected_columns.keys())  # type: ignore[union-attr]
    assert selected == {
        "workspace_id",
        "cluster_id",
        "inventory_key",
        "api_version",
        "kind",
        "namespace",
        "name",
        "uid",
        "resource_version",
        "labels",
        "observed_at",
    }
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    ).lower()
    assert "raw" not in sql
    assert "annotations" not in sql
    assert "summary" not in sql


def test_helm_owned_resource_query_reads_only_exact_ownership_and_safe_metadata() -> None:
    class Result:
        def mappings(self) -> Result:
            return self

        def all(self) -> list[dict[str, object]]:
            return [
                {
                    "workspace_id": "workspace-a",
                    "cluster_id": "cluster-a",
                    "inventory_key": "deployment-storefront",
                    "api_version": "apps/v1",
                    "kind": "Deployment",
                    "namespace": "storefront",
                    "name": "storefront",
                    "uid": "deployment-storefront",
                    "status": "Available",
                    "health": "healthy",
                    "observed_at": None,
                    "release_name": "storefront",
                    "release_namespace": "storefront",
                },
                {
                    "workspace_id": "workspace-a",
                    "cluster_id": "cluster-a",
                    "inventory_key": "service-storefront",
                    "api_version": "v1",
                    "kind": "Service",
                    "namespace": "storefront",
                    "name": "storefront-http",
                    "uid": "service-storefront",
                    "status": "Active",
                    "health": "healthy",
                    "observed_at": None,
                    "release_name": "storefront",
                    "release_namespace": "storefront",
                },
            ]

    class Connection:
        statement: object | None = None

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(HelmReleaseRepository)
    repository.connection = connect
    batch = repository.list_helm_owned_resource_observations(
        workspace_id="workspace-a",
        release_scopes=(("cluster-a", "storefront", "storefront"),),
        limit=1,
    )

    assert batch.truncated is True
    assert len(batch.rows) == 1
    assert connection.statement is not None
    selected = set(connection.statement.selected_columns.keys())  # type: ignore[union-attr]
    assert selected == {
        "workspace_id",
        "cluster_id",
        "inventory_key",
        "api_version",
        "kind",
        "namespace",
        "name",
        "uid",
        "status",
        "health",
        "observed_at",
        "release_name",
        "release_namespace",
        "chart_label",
    }
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert "meta.helm.sh/release-name" in sql
    assert "meta.helm.sh/release-namespace" in sql
    assert "app.kubernetes.io/managed-by" in sql
    assert "raw" not in sql.lower()
    assert "summary" not in sql.lower()
