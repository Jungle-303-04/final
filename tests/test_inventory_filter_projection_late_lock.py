"""late-lock 프로젝션 임계구역 축소의 순서·의미론 등가 검증.

핵심 불변식:
- late(기본): 워크스페이스 advisory 락을 무거운 read(diff) 이후, revision 할당
  직전에만 잡는다 → 임계구역 축소. 그래도 락은 revision 할당~커밋을 감싼다.
- legacy(플래그 0): 원래대로 함수 시작에서 락을 잡는다.
- 두 경로가 동일한 version/label/application 쓰기와 동일한 mutation 을 만든다(의미론 등가).
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains.inventory_filter.repository import (
    InventoryFilterProjectionMutation,
    sync_inventory_filter_projection,
)

_OBSERVED_AT = datetime(2026, 7, 15, tzinfo=UTC)
_REVISION_ID = 100
_NEW_VERSION_ID = 500
_INVENTORY_KEY = "workspace-1|cluster-1|pod|payments|checkout"


class _Result:
    def __init__(self, *, scalar: Any = None, rows: list[Any] | None = None) -> None:
        self._scalar = scalar
        self._rows = rows if rows is not None else []

    def scalar_one(self) -> Any:
        return self._scalar

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[Any]:
        return self._rows

    def scalars(self) -> Iterable[Any]:
        return iter(self._rows)

    def __iter__(self) -> Any:
        return iter(self._rows)


def _resource_row() -> dict[str, Any]:
    return {
        "inventory_key": _INVENTORY_KEY,
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "payments",
        "name": "checkout",
        "uid": "pod-1",
        "resource_version": "1",
        "status": "Running",
        "health": "healthy",
        "labels": {"app": "checkout"},
        "summary": {},
        "observed_at": _OBSERVED_AT,
        "first_seen_at": _OBSERVED_AT,
        "deleted_at": None,
    }


class _RecordingProjectionConnection:
    """sync_inventory_filter_projection 의 쿼리를 SQL 로 분기해 결정적으로 응답·기록."""

    def __init__(self) -> None:
        self.statements: list[tuple[str, dict[str, Any]]] = []

    def execute(self, statement: object) -> _Result:
        compiled = statement.compile(dialect=postgresql.dialect())
        sql = str(compiled).lower()
        self.statements.append((sql, dict(compiled.params)))
        if "pg_advisory_xact_lock" in sql:
            return _Result()
        if "insert into inventory_filter_revisions" in sql:
            return _Result(scalar=_REVISION_ID)
        if "insert into inventory_resource_versions" in sql:
            return _Result(rows=[(_NEW_VERSION_ID, _INVENTORY_KEY)])
        if "from cluster_inventory_resources" in sql and sql.lstrip().startswith("select"):
            return _Result(rows=[_resource_row()])
        # authoritative application-binding join + active ACTIVE binding ids + active versions
        return _Result(rows=[])


def _run(flag_enabled: bool, monkeypatch: pytest.MonkeyPatch) -> _RecordingProjectionConnection:
    if flag_enabled:
        monkeypatch.delenv("INVENTORY_LATE_PROJECTION_LOCK", raising=False)
    else:
        monkeypatch.setenv("INVENTORY_LATE_PROJECTION_LOCK", "0")
    connection = _RecordingProjectionConnection()
    mutation = sync_inventory_filter_projection(
        connection,
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        snapshot_id="snapshot-1",
        observed_at=_OBSERVED_AT,
        labels_complete=True,
        resources_complete=True,
        partial_reason_codes=[],
    )
    assert isinstance(mutation, InventoryFilterProjectionMutation)
    assert mutation.revision_id == _REVISION_ID
    assert mutation.version_ids_by_inventory_key == {_INVENTORY_KEY: _NEW_VERSION_ID}
    return connection


def _index_of(connection: _RecordingProjectionConnection, needle: str) -> int:
    return next(index for index, (sql, _) in enumerate(connection.statements) if needle in sql)


def test_late_lock_acquires_workspace_lock_after_heavy_reads_and_before_revision(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connection = _run(flag_enabled=True, monkeypatch=monkeypatch)

    lock_index = _index_of(connection, "pg_advisory_xact_lock")
    prestate_index = _index_of(connection, "from cluster_inventory_resources")
    revision_index = _index_of(connection, "insert into inventory_filter_revisions")

    # Heavy cluster-local read happens OUTSIDE the critical section...
    assert prestate_index < lock_index
    # ...but the lock still wraps revision allocation (allocation order == commit order).
    assert lock_index < revision_index


def test_legacy_flag_restores_lock_first_ordering(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = _run(flag_enabled=False, monkeypatch=monkeypatch)

    lock_index = _index_of(connection, "pg_advisory_xact_lock")
    prestate_index = _index_of(connection, "from cluster_inventory_resources")
    revision_index = _index_of(connection, "insert into inventory_filter_revisions")

    # Original ordering: lock is held from the very top, before any projection work.
    assert lock_index < revision_index < prestate_index


def _write_params(connection: _RecordingProjectionConnection, needle: str) -> list[dict[str, Any]]:
    return [params for sql, params in connection.statements if needle in sql]


def test_late_and_legacy_produce_identical_projection_writes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    late = _run(flag_enabled=True, monkeypatch=monkeypatch)
    legacy = _run(flag_enabled=False, monkeypatch=monkeypatch)

    # The version/label/application writes must be byte-identical between the two paths.
    for needle in (
        "insert into inventory_resource_versions",
        "insert into inventory_resource_label_versions",
        "insert into inventory_resource_application_versions",
    ):
        assert _write_params(late, needle) == _write_params(legacy, needle)

    # The revision's final application-binding completeness + reason codes must match:
    # legacy reaches them via UPDATE, late writes them directly on INSERT.
    late_insert = _write_params(late, "insert into inventory_filter_revisions")[0]
    legacy_update = _write_params(legacy, "update inventory_filter_revisions")[0]
    assert (
        late_insert["application_bindings_complete"]
        == legacy_update["application_bindings_complete"]
    )
    assert late_insert["partial_reason_codes"] == legacy_update["partial_reason_codes"]
