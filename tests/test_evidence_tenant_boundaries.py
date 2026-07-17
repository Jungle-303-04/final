"""Raw evidence 조회 계약의 cluster 경계 회귀 테스트."""

from __future__ import annotations

from collections.abc import Collection, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
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


def _authorized_query_type() -> type:
    return import_module("domains.evidence.dependencies").AuthorizedEvidenceQuery


def _authorized_query_dependency() -> Any:
    return import_module("domains.evidence.dependencies").get_authorized_evidence_query


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

    for method_name in (
        "list_evidence",
        "list_evidence_windows",
        "list_latest_traffic_evidence_windows",
        "get_evidence",
    ):
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
    since = datetime(2026, 7, 18, tzinfo=UTC)
    assert repository.list_latest_traffic_evidence_windows("workspace-a", None, since=since) == []
    assert repository.list_latest_traffic_evidence_windows("workspace-a", set(), since=since) == []
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
    repository.list_latest_traffic_evidence_windows(
        "workspace-a",
        {"cluster-1"},
        since=datetime(2026, 7, 18, tzinfo=UTC),
    )
    repository.get_evidence("workspace-a", "evidence-1", {"cluster-1"})

    evidence_sql, evidence_params = _postgres_sql(statements[0])
    windows_sql, windows_params = _postgres_sql(statements[1])
    traffic_sql, traffic_params = _postgres_sql(statements[2])
    get_sql, get_params = _postgres_sql(statements[3])

    assert "evidence.workspace_id =" in evidence_sql
    assert "evidence.payload ->>" in evidence_sql
    assert " IN (" in evidence_sql
    assert {"workspace-a", "cluster-1"}.issubset(set(evidence_params.values()))

    for sql, params in ((windows_sql, windows_params), (get_sql, get_params)):
        assert "evidence_windows.workspace_id =" in sql
        assert "evidence_windows.cluster_id IN (" in sql
        assert {"workspace-a", "cluster-1"}.issubset(set(params.values()))

    assert "row_number() OVER (PARTITION BY evidence_windows.cluster_id" in traffic_sql
    assert "traffic_window_rank =" in traffic_sql
    assert "evidence_windows.source_id =" in traffic_sql
    assert {"workspace-a", "cluster-1", "cluster-snapshot"}.issubset(set(traffic_params.values()))

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


class _AdapterDb(_GrantedClustersDb):
    def __init__(self, accessible: set[str] | None) -> None:
        super().__init__(accessible)
        self.query_calls: list[tuple[str, str, set[str], dict[str, object]]] = []

    def list_evidence(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str] | None,
        **kwargs: object,
    ) -> list[dict[str, object]]:
        self.query_calls.append(
            ("list_evidence", workspace_id, set(allowed_cluster_ids or ()), kwargs)
        )
        return [{"id": 1, "workspace_id": workspace_id}]

    def list_evidence_windows(
        self,
        workspace_id: str,
        allowed_cluster_ids: Collection[str] | None,
        **kwargs: object,
    ) -> list[dict[str, object]]:
        self.query_calls.append(
            ("list_evidence_windows", workspace_id, set(allowed_cluster_ids or ()), kwargs)
        )
        return [{"evidence_key": "evidence-1", "workspace_id": workspace_id}]

    def get_evidence(
        self,
        workspace_id: str,
        evidence_key: str,
        allowed_cluster_ids: Collection[str] | None,
    ) -> dict[str, object] | None:
        self.query_calls.append(
            (
                "get_evidence",
                workspace_id,
                set(allowed_cluster_ids or ()),
                {"evidence_key": evidence_key},
            )
        )
        return {"cluster_id": "cluster-1", "logs": []}


def test_none_access_is_fail_closed_but_admin_clusters_are_explicitly_materialized() -> None:
    member_db = _GrantedClustersDb(None)
    member = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))

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
    admin = SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=(ServiceRole.SERVICE_ADMIN.value,),
    )

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
    current = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))
    allowed = _allowed_cluster_ids(
        access_db,
        current,
        "workspace-a",
        Permission.EVIDENCE_READ.value,
    )
    repository = _repository(ClusterScopedConnection())

    assert allowed == {"cluster-1"}
    assert repository.get_evidence("workspace-a", "evidence-cluster-2", allowed) is None


def test_authorized_query_preserves_existing_query_router_store_surface() -> None:
    adapter_type = _authorized_query_type()

    expected_parameters = {
        "list_evidence_records": (
            "self",
            "workspace_id",
            "correlation_id",
            "kind",
            "since",
            "until",
            "limit",
            "offset",
            "cursor",
        ),
        "list_evidence_windows_for_workspace": (
            "self",
            "workspace_id",
            "limit",
            "offset",
        ),
        "get_evidence_window_payload_for_workspace": (
            "self",
            "workspace_id",
            "evidence_key",
        ),
    }

    for method_name, names in expected_parameters.items():
        parameters = signature(getattr(adapter_type, method_name)).parameters
        assert tuple(parameters) == names
        assert parameters["workspace_id"].default is Parameter.empty


def test_authorized_query_forwards_session_scope_and_allowed_clusters() -> None:
    db = _AdapterDb({"cluster-1"})
    current = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))
    adapter = _authorized_query_type()(db=db, current=current)

    assert adapter.list_evidence_records(
        "workspace-a",
        correlation_id="corr-1",
        kind="cluster_evidence",
        since=None,
        until=None,
        limit=51,
        offset=3,
        cursor=None,
    ) == [{"id": 1, "workspace_id": "workspace-a"}]
    assert adapter.list_evidence_windows_for_workspace(
        "workspace-a",
        limit=21,
        offset=4,
    ) == [{"evidence_key": "evidence-1", "workspace_id": "workspace-a"}]
    assert adapter.get_evidence_window_payload_for_workspace(
        "workspace-a",
        "evidence-1",
    ) == {"cluster_id": "cluster-1", "logs": []}

    assert db.query_calls == [
        (
            "list_evidence",
            "workspace-a",
            {"cluster-1"},
            {
                "correlation_id": "corr-1",
                "kind": "cluster_evidence",
                "since": None,
                "until": None,
                "limit": 51,
                "offset": 3,
                "cursor": None,
            },
        ),
        (
            "list_evidence_windows",
            "workspace-a",
            {"cluster-1"},
            {"limit": 21, "offset": 4},
        ),
        (
            "get_evidence",
            "workspace-a",
            {"cluster-1"},
            {"evidence_key": "evidence-1"},
        ),
    ]


def test_authorized_query_rejects_non_session_workspace_without_query() -> None:
    db = _AdapterDb({"cluster-1"})
    current = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))
    adapter = _authorized_query_type()(db=db, current=current)

    assert adapter.list_evidence_records("workspace-b") == []
    assert adapter.list_evidence_windows_for_workspace("workspace-b", limit=20) == []
    assert adapter.get_evidence_window_payload_for_workspace("workspace-b", "evidence-b") is None
    assert db.query_calls == []


def test_authorized_query_empty_access_never_calls_evidence_repository() -> None:
    current = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))

    for accessible in (None, set()):
        db = _AdapterDb(accessible)
        adapter = _authorized_query_type()(db=db, current=current)

        assert adapter.list_evidence_records("workspace-a") == []
        assert adapter.list_evidence_windows_for_workspace("workspace-a", limit=20) == []
        assert (
            adapter.get_evidence_window_payload_for_workspace("workspace-a", "evidence-1") is None
        )
        assert db.query_calls == []


def test_authorized_evidence_dependency_is_session_and_database_bound() -> None:
    dependency = _authorized_query_dependency()
    parameters = signature(dependency).parameters
    require_session = import_module("domains.identity.dependencies").require_session
    get_db = import_module("packages.runtime.dependencies").get_db

    assert parameters["current"].default.dependency is require_session
    assert parameters["db"].default.dependency is get_db

    db = _AdapterDb({"cluster-1"})
    current = SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("user",))
    adapter = dependency(current=current, db=db)

    assert isinstance(adapter, _authorized_query_type())
    assert adapter.list_evidence_windows_for_workspace("workspace-a", limit=20) == [
        {"evidence_key": "evidence-1", "workspace_id": "workspace-a"}
    ]


def test_database_mro_has_one_evidence_query_method_owner_with_matching_signature() -> None:
    database_type = import_module("domains.registry").Database
    repository_type = _repository_type()

    for method_name in (
        "list_workspace_cluster_ids",
        "list_evidence",
        "list_evidence_windows",
        "get_evidence",
    ):
        owners = [base for base in database_type.__mro__[1:] if method_name in base.__dict__]
        assert owners == [repository_type]
        assert signature(getattr(database_type, method_name)) == signature(
            getattr(repository_type, method_name)
        )
