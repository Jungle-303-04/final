"""Raw evidence 조회 계약의 cluster 경계 회귀 테스트."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from importlib import import_module
from inspect import Parameter, signature
from types import SimpleNamespace
from typing import Any

from sqlalchemy.dialects import postgresql

from packages.contracts.identity import Permission, ServiceRole


def _repository_type() -> type:
    return import_module("domains.evidence.repository").EvidenceQueryRepository


def _allowed_cluster_ids(*args: Any, **kwargs: Any) -> set[str]:
    resolver = import_module("domains.identity.dependencies").resolve_allowed_cluster_ids
    return resolver(*args, **kwargs)


def _postgres_sql(statement: Any) -> tuple[str, dict[str, object]]:
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"render_postcompile": True},
    )
    return " ".join(str(compiled).split()), dict(compiled.params)


class _MappingsResult:
    def __init__(self, rows: list[dict[str, object]] | None = None) -> None:
        self._rows = rows or []

    def mappings(self) -> _MappingsResult:
        return self

    def all(self) -> list[dict[str, object]]:
        return self._rows

    def first(self) -> dict[str, object] | None:
        return self._rows[0] if self._rows else None

    def scalar_one_or_none(self) -> object | None:
        if not self._rows:
            return None
        return self._rows[0].get("payload")


def _repository(connection: Any) -> Any:
    @contextmanager
    def fake_connection() -> Iterator[Any]:
        yield connection

    repository = object.__new__(_repository_type())
    repository.connection = fake_connection  # type: ignore[method-assign]
    return repository


def test_evidence_repository_requires_explicit_allowed_cluster_ids() -> None:
    repository_type = _repository_type()

    for method_name in ("list_evidence", "list_evidence_windows", "get_evidence"):
        parameters = signature(getattr(repository_type, method_name)).parameters
        assert parameters["allowed_cluster_ids"].default is Parameter.empty


def test_empty_or_none_cluster_access_returns_no_evidence_without_query() -> None:
    class NoQueryConnection:
        def execute(self, statement: Any) -> _MappingsResult:
            raise AssertionError(f"empty access must not query evidence: {statement}")

    repository = _repository(NoQueryConnection())

    assert repository.list_evidence("workspace-a", None) == []
    assert repository.list_evidence("workspace-a", set()) == []
    assert repository.list_evidence_windows("workspace-a", None, limit=20) == []
    assert repository.list_evidence_windows("workspace-a", set(), limit=20) == []
    assert repository.get_evidence("workspace-a", "evidence-b", None) is None
    assert repository.get_evidence("workspace-a", "evidence-b", set()) is None


def test_evidence_queries_enforce_workspace_and_cluster_in_sql() -> None:
    statements: list[Any] = []

    class CaptureConnection:
        def execute(self, statement: Any) -> _MappingsResult:
            statements.append(statement)
            return _MappingsResult()

    repository = _repository(CaptureConnection())
    repository.list_evidence("workspace-a", {"cluster-1"})
    repository.list_evidence_windows("workspace-a", {"cluster-1"}, limit=20)
    repository.get_evidence("workspace-a", "evidence-1", {"cluster-1"})

    evidence_sql, evidence_params = _postgres_sql(statements[0])
    windows_sql, windows_params = _postgres_sql(statements[1])
    get_sql, get_params = _postgres_sql(statements[2])

    assert "evidence.workspace_id =" in evidence_sql
    assert "evidence.payload ->>" in evidence_sql
    assert " IN (" in evidence_sql
    assert {"workspace-a", "cluster-1"}.issubset(set(evidence_params.values()))

    for sql, params in ((windows_sql, windows_params), (get_sql, get_params)):
        assert "evidence_windows.workspace_id =" in sql
        assert "evidence_windows.cluster_id IN (" in sql
        assert {"workspace-a", "cluster-1"}.issubset(set(params.values()))

    assert "evidence_windows.evidence_key =" in get_sql
    assert "evidence-1" in get_params.values()


class _GrantedClustersDb:
    def __init__(self, accessible: set[str] | None) -> None:
        self.accessible = accessible
        self.materialized = False

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str] | None:
        assert (user_id, workspace_id, resource_type, permission) == (
            "user-a",
            "workspace-a",
            "cluster",
            Permission.EVIDENCE_READ.value,
        )
        return self.accessible

    def list_workspace_cluster_ids(self, workspace_id: str) -> set[str]:
        self.materialized = True
        assert workspace_id == "workspace-a"
        return {"cluster-1", "cluster-2"}


def test_none_access_is_fail_closed_but_admin_clusters_are_explicitly_materialized() -> None:
    member_db = _GrantedClustersDb(None)
    member = SimpleNamespace(user_id="user-a", roles=("user",))

    assert (
        _allowed_cluster_ids(
            member_db,
            member,
            "workspace-a",
            Permission.EVIDENCE_READ.value,
        )
        == set()
    )
    assert member_db.materialized is False

    admin_db = _GrantedClustersDb(None)
    admin = SimpleNamespace(user_id="user-a", roles=(ServiceRole.SERVICE_ADMIN.value,))

    assert _allowed_cluster_ids(
        admin_db,
        admin,
        "workspace-a",
        Permission.EVIDENCE_READ.value,
    ) == {"cluster-1", "cluster-2"}
    assert admin_db.materialized is True


def test_cluster_1_grant_cannot_read_cluster_2_raw_evidence() -> None:
    victim_payload = {
        "cluster_id": "cluster-2",
        "logs": [{"message": "workspace secret"}],
    }

    class ClusterScopedConnection:
        def execute(self, statement: Any) -> _MappingsResult:
            sql, params = _postgres_sql(statement)
            cluster_values = {
                value for value in params.values() if str(value).startswith("cluster-")
            }
            guarded = "evidence_windows.cluster_id IN (" in sql
            if guarded and "cluster-2" not in cluster_values:
                return _MappingsResult()
            return _MappingsResult([{"payload": victim_payload}])

    access_db = _GrantedClustersDb({"cluster-1"})
    current = SimpleNamespace(user_id="user-a", roles=("user",))
    allowed = _allowed_cluster_ids(
        access_db,
        current,
        "workspace-a",
        Permission.EVIDENCE_READ.value,
    )
    repository = _repository(ClusterScopedConnection())

    assert allowed == {"cluster-1"}
    assert repository.get_evidence("workspace-a", "evidence-cluster-2", allowed) is None
