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
