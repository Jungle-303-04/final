"""Timeline P0 ledger contracts: identity, replay, and opaque resume safety."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from sqlalchemy.dialects import postgresql

from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.cursor import (
    TimelineCursorBinding,
    TimelineReplayCursorCodec,
    timeline_query_fingerprint,
)
from domains.timeline.mapping import inventory_timeline_event
from domains.timeline.repository import (
    TimelineLedgerReadScope,
    TimelineLedgerRepository,
    TimelineReplayResult,
    TimelineSnapshotLimitExceeded,
    _timeline_events_statement,
    replay_result,
)
from packages.contracts.parity import ClusterScope, Freshness, ResourceRef
from packages.contracts.timeline import (
    TimelineEvent,
    TimelineInventoryLocatorSubject,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineWindow,
)


def _query(
    *,
    workspace_id: str = "workspace-a",
    cluster_id: str = "cluster-a",
    freshness: Freshness = "live",
    from_ms: int = 1_000,
    to_ms: int = 2_000,
) -> TimelineQuery:
    return TimelineQuery(
        scopes=(
            ClusterScope(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                freshness=freshness,
            ),
        ),
        window=TimelineWindow(from_ms=from_ms, to_ms=to_ms),
    )


def _resource_event(source_key: str, event_id: str) -> TimelineEvent:
    resource = ResourceRef(kind="Deployment", namespace="payments", name="checkout", uid="uid-1")
    return TimelineEvent(
        event_id=event_id,
        source="inventory",
        source_key=source_key,
        native_id=f"native-{event_id}",
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment checkout updated",
    )


def test_inventory_mapping_only_relates_a_resource_when_its_uid_is_present() -> None:
    exact = inventory_timeline_event(
        event_id="inventory-version-1",
        source_key="inventory:version-1",
        native_id="version-1",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        api_version="apps/v1",
        resource_kind="Deployment",
        namespace="payments",
        name="checkout",
        uid="deployment-uid",
        title="Deployment checkout updated",
    )
    missing_uid = inventory_timeline_event(
        event_id="inventory-version-2",
        source_key="inventory:version-2",
        native_id="version-2",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        api_version="v1",
        resource_kind="ConfigMap",
        namespace="payments",
        name="runtime-config",
        uid=None,
        title="ConfigMap runtime-config observed",
    )

    assert isinstance(exact.subject, TimelineResourceSubject)
    assert exact.resource == exact.subject.resource
    assert exact.resource.uid == "deployment-uid"
    assert isinstance(missing_uid.subject, TimelineInventoryLocatorSubject)
    assert missing_uid.resource is None
    assert missing_uid.subject.inventory_key == "version-2"


def test_timeline_cursor_is_bound_to_user_workspace_query_and_authorization_revision() -> None:
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-cursor-test-secret-32-bytes!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(),
        snapshot_revision=7,
    )
    cursor = codec.encode(binding, sequence=42)

    assert codec.decode(cursor, binding=binding) == 42
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"user_id": "user-b"}),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"query": _query(cluster_id="cluster-b")}),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"authorization_revision": "auth-revision-b"}),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"query": _query(workspace_id="workspace-b")}),
        )


def test_timeline_cursor_keeps_resume_valid_for_freshness_only_scope_changes() -> None:
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-cursor-test-secret-32-bytes!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(freshness="live"),
        snapshot_revision=7,
    )
    stale = binding.model_copy(update={"query": _query(freshness="stale")})
    cursor = codec.encode(binding, sequence=42)

    assert timeline_query_fingerprint(binding.query) == timeline_query_fingerprint(stale.query)
    assert codec.decode(cursor, binding=stale) == 42
    assert timeline_query_fingerprint(binding.query) != timeline_query_fingerprint(
        _query(from_ms=1_001)
    )


def test_expired_timeline_cursor_is_rejected_before_replay_and_retention_requires_resync() -> None:
    now = [1_000]
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec(
            "timeline-cursor-test-secret-32-bytes!!",
            ttl_seconds=10,
            now=lambda: now[0],
        )
    )
    binding = TimelineCursorBinding(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(),
        snapshot_revision=7,
    )
    cursor = codec.encode(binding, sequence=7)
    now[0] = 1_010

    with pytest.raises(ValueError, match="cursor expired"):
        codec.decode(cursor, binding=binding)


def test_replay_reports_resync_when_the_cursor_precedes_the_retention_boundary() -> None:
    result = replay_result(
        after_sequence=7,
        retained_from_sequence=9,
        high_water_sequence=12,
        events=(_resource_event("inventory:11", "event-11"),),
    )

    assert isinstance(result, TimelineReplayResult)
    assert result.status == "resync_required"
    assert result.reason == "retention_boundary"
    assert result.events == ()


def test_replay_records_preserve_ledger_order_and_dedupe_uses_source_key() -> None:
    earliest = _resource_event("inventory:1", "event-1")
    later = _resource_event("inventory:2", "event-2")
    duplicate = _resource_event("inventory:1", "event-1-reported-again")
    result = replay_result(
        after_sequence=0,
        retained_from_sequence=1,
        high_water_sequence=2,
        events=((2, later), (1, earliest), (3, duplicate)),
    )

    assert result.status == "available"
    assert [event.event_id for event in result.events] == ["event-1", "event-2"]


def test_ledger_repository_persists_one_row_for_duplicate_source_key_under_cursor_lock() -> None:
    class Result:
        def __init__(self, row: dict[str, Any] | None = None, scalar: int | None = None) -> None:
            self.row = row
            self.scalar = scalar

        def mappings(self) -> Result:
            return self

        def one(self) -> dict[str, Any]:
            assert self.row is not None
            return self.row

        def one_or_none(self) -> dict[str, Any] | None:
            return self.row

        def scalar_one(self) -> int:
            assert self.scalar is not None
            return self.scalar

    class DurableConnection:
        def __init__(self) -> None:
            self.last_sequence = 0
            self.rows: dict[str, dict[str, Any]] = {}
            self.lock_count = 0

        def execute(self, statement: Any) -> Result:
            table = getattr(statement, "table", None)
            table_name = getattr(table, "name", None)
            params = statement.compile().params
            if table_name == "timeline_event_cursors" and statement.is_insert:
                return Result()
            if table_name == "timeline_event_cursors" and statement.is_update:
                self.last_sequence = int(params["last_sequence"])
                return Result(scalar=self.last_sequence)
            if table_name == "timeline_events" and statement.is_insert:
                row = dict(params)
                self.rows[str(row["source_key"])] = row
                return Result(row=row)

            columns = statement.selected_columns.keys()
            if "source_key" in columns:
                source_key = str(params["source_key_1"])
                return Result(row=self.rows.get(source_key))
            self.lock_count += 1
            return Result(row={"last_sequence": self.last_sequence, "retained_from_sequence": 1})

    connection = DurableConnection()

    @contextmanager
    def transaction() -> Iterator[DurableConnection]:
        yield connection

    repository = object.__new__(TimelineLedgerRepository)
    repository.connection = transaction

    first = repository.append_timeline_event(_resource_event("inventory:1", "event-1"))
    duplicate = repository.append_timeline_event(
        _resource_event("inventory:1", "event-1-reported-again")
    )

    assert first.inserted is True
    assert first.sequence == 1
    assert duplicate.inserted is False
    assert duplicate.sequence == 1
    assert duplicate.event.event_id == "event-1"
    assert connection.last_sequence == 1
    assert len(connection.rows) == 1
    assert connection.lock_count == 2


def test_history_window_query_is_half_open_to_avoid_adjacent_window_duplicates() -> None:
    statement = _timeline_events_statement(
        TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
        ),
        after_sequence=0,
        through_sequence=12,
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        limit=2,
        replay_order=False,
    )
    sql = " ".join(
        str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        .casefold()
        .split()
    )

    assert "timeline_events.occurred_at >= '1970-01-01 00:00:01+00:00'" in sql
    assert "timeline_events.occurred_at < '1970-01-01 00:00:02+00:00'" in sql
    assert "timeline_events.occurred_at <=" not in sql


def test_snapshot_excludes_rows_before_retention_boundary_and_rejects_partial_limit() -> None:
    class Repository:
        def __init__(self, events: tuple[TimelineEvent, ...]) -> None:
            self.events = events
            self.calls: list[dict[str, object]] = []

        def _cursor_state(self, _workspace_id: str) -> tuple[int, int]:
            return 12, 9

        def _read_events(self, _read_scope: object, **kwargs: object) -> tuple[TimelineEvent, ...]:
            self.calls.append(kwargs)
            return self.events

    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
    )
    window = TimelineWindow(from_ms=1_000, to_ms=2_000)
    full = Repository((_resource_event("inventory:9", "event-9"),))

    snapshot = TimelineLedgerRepository.snapshot_timeline_events(
        full,
        scope,
        window=window,
        limit=1,
    )

    assert snapshot.events[0].event_id == "event-9"
    assert full.calls == [
        {
            "after_sequence": 8,
            "through_sequence": 12,
            "window": window,
            "limit": 2,
            "replay_order": False,
        }
    ]

    overflow = Repository(
        (
            _resource_event("inventory:9", "event-9"),
            _resource_event("inventory:10", "event-10"),
        )
    )
    with pytest.raises(TimelineSnapshotLimitExceeded, match="limit exceeded"):
        TimelineLedgerRepository.snapshot_timeline_events(
            overflow,
            scope,
            window=window,
            limit=1,
        )
