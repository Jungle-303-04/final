"""Timeline P0 ledger contracts: identity, replay, and opaque resume safety."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.cursor import (
    TimelineCursorBinding,
    TimelineReplayCursorCodec,
    timeline_query_fingerprint,
)
from domains.timeline.mapping import inventory_timeline_event
from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import (
    TimelineLedgerReadScope,
    TimelineLedgerRecord,
    TimelineLedgerRepository,
    TimelineLedgerSnapshot,
    TimelineReplayResult,
    TimelineSnapshotLimitExceeded,
    _timeline_events_statement,
    replay_result,
)
from packages.contracts.parity import ClusterScope, Freshness, ResourceRef
from packages.contracts.timeline import (
    TimelineApplicationWorkflowSubject,
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
        mode="live",
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


def _timeline_sql(scope: TimelineLedgerReadScope) -> str:
    statement = _timeline_events_statement(
        scope,
        predicate=TimelineEvidencePredicate.from_query(scope, _query()),
        after_sequence=0,
        through_sequence=12,
        phase="snapshot",
        limit=2,
        replay_order=False,
    )
    return " ".join(
        str(statement.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))
        .casefold()
        .split()
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
    binding = TimelineCursorBinding.from_query(
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
            binding=TimelineCursorBinding.from_query(
                user_id="user-a",
                authorization_revision="auth-revision-a",
                query=_query(cluster_id="cluster-b"),
                snapshot_revision=7,
            ),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=binding.model_copy(update={"authorization_revision": "auth-revision-b"}),
        )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            cursor,
            binding=TimelineCursorBinding.from_query(
                user_id="user-a",
                authorization_revision="auth-revision-a",
                query=_query(workspace_id="workspace-b"),
                snapshot_revision=7,
            ),
        )


def test_timeline_cursor_keeps_resume_valid_for_freshness_only_scope_changes() -> None:
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-cursor-test-secret-32-bytes!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding.from_query(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(freshness="live"),
        snapshot_revision=7,
    )
    duplicate_freshness = TimelineQuery(
        scopes=(
            ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a", freshness="live"),
            ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a", freshness="stale"),
        ),
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode="live",
    )
    stale = TimelineCursorBinding.from_query(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=duplicate_freshness,
        snapshot_revision=7,
    )
    cursor = codec.encode(binding, sequence=42)

    assert timeline_query_fingerprint(_query(freshness="live")) == timeline_query_fingerprint(
        duplicate_freshness
    )
    assert len(stale.replay_identity.scopes) == 1
    assert stale.replay_identity.scopes[0].freshness == "live"
    assert codec.decode(cursor, binding=stale) == 42
    assert timeline_query_fingerprint(_query(freshness="live")) != timeline_query_fingerprint(
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
    binding = TimelineCursorBinding.from_query(
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


def test_scoped_replay_keeps_internal_sequences_for_opaque_event_cursors_across_gaps() -> None:
    class Repository:
        def _cursor_state(self, _workspace_id: str) -> tuple[int, int]:
            return 5, 1

        def _read_records(
            self, _read_scope: object, **_kwargs: object
        ) -> tuple[TimelineLedgerRecord, ...]:
            # Workspace sequence 3 and 4 belong to a different cluster and are not visible here.
            return (
                TimelineLedgerRecord(2, _resource_event("inventory:2", "event-2")),
                TimelineLedgerRecord(5, _resource_event("inventory:5", "event-5")),
            )

    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
    )
    replay = TimelineLedgerRepository.replay_timeline_events(
        Repository(),
        scope,
        after_sequence=1,
        predicate=TimelineEvidencePredicate.from_query(scope, _query()),
    )
    codec = TimelineReplayCursorCodec(
        FilterCursorCodec("timeline-cursor-test-secret-32-bytes!!", now=lambda: 1_000)
    )
    binding = TimelineCursorBinding.from_query(
        user_id="user-a",
        authorization_revision="auth-revision-a",
        query=_query(),
        snapshot_revision=7,
    )
    cursors = tuple(codec.encode(binding, sequence=record.sequence) for record in replay.records)
    snapshot = TimelineLedgerSnapshot(
        records=replay.records,
        high_water_sequence=replay.high_water_sequence,
        retained_from_sequence=replay.retained_from_sequence,
    )
    snapshot_cursor = codec.encode(binding, sequence=snapshot.high_water_sequence)

    assert [record.sequence for record in replay.records] == [2, 5]
    assert [event.event_id for event in replay.events] == ["event-2", "event-5"]
    assert [codec.decode(cursor, binding=binding) for cursor in cursors] == [2, 5]
    assert codec.decode(snapshot_cursor, binding=binding) == 5
    assert all(not cursor.token.isdigit() for cursor in cursors)


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


def test_application_timeline_sources_require_a_real_application_workflow_subject() -> None:
    event = _resource_event("inventory:1", "event-1")
    invalid = event.model_dump()
    invalid.update(
        source="application_workflow",
        source_key="workflow:run-1",
        native_id="run-1",
        event_type="deployment",
    )

    with pytest.raises(ValidationError, match="application workflow subject"):
        TimelineEvent(**invalid)

    valid = TimelineEvent(
        event_id="workflow-event-1",
        source="application_workflow",
        source_key="workflow:run-1",
        native_id="run-1",
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        subject=TimelineApplicationWorkflowSubject(
            application_id="application-owned",
            binding_id="binding-1",
            workflow_run_id="run-1",
        ),
        event_type="deployment",
        severity="info",
        title="Application deployment updated",
    )

    assert valid.subject.application_id == "application-owned"


def test_timeline_sql_requires_source_specific_grants_and_namespace_scope() -> None:
    requested = (
        ClusterScope(
            workspace_id="workspace-a",
            cluster_id="cluster-a",
            namespaces=("payments",),
        ),
    )

    inventory_sql = _timeline_sql(
        TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=requested,
            inventory_cluster_ids=frozenset({"cluster-a"}),
        )
    )
    incident_sql = _timeline_sql(
        TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=requested,
            incident_cluster_ids=frozenset({"cluster-a"}),
        )
    )
    application_workflow_sql = _timeline_sql(
        TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=requested,
            application_workflow_ids=frozenset({"deployment-owned"}),
        )
    )
    gitops_sql = _timeline_sql(
        TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=requested,
            gitops_application_ids=frozenset({"application-read-owned"}),
        )
    )
    deny_sql = _timeline_sql(TimelineLedgerReadScope(workspace_id="workspace-a", scopes=requested))

    assert "timeline_events.source = 'inventory'" in inventory_sql
    assert "'incident'" not in inventory_sql
    assert "application_id" not in inventory_sql
    assert "timeline_events.source = 'incident'" in incident_sql
    assert "'inventory'" not in incident_sql
    assert "application_id" not in incident_sql
    assert "timeline_events.source = 'application_workflow'" in application_workflow_sql
    assert (
        "(timeline_events.subject ->> 'application_id') in ('deployment-owned')"
        in application_workflow_sql
    )
    assert "'gitops'" not in application_workflow_sql
    assert "timeline_events.source = 'gitops'" in gitops_sql
    assert (
        "(timeline_events.subject ->> 'application_id') in ('application-read-owned')" in gitops_sql
    )
    assert "'application_workflow'" not in gitops_sql
    assert "timeline_events.namespace in ('payments')" in inventory_sql
    assert "timeline_events.namespace in ('payments')" in incident_sql
    assert "timeline_events.namespace in ('payments')" in application_workflow_sql
    assert "timeline_events.namespace in ('payments')" in gitops_sql
    assert "and false" in deny_sql


def test_history_window_query_is_half_open_to_avoid_adjacent_window_duplicates() -> None:
    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
        inventory_cluster_ids=frozenset({"cluster-a"}),
    )
    statement = _timeline_events_statement(
        scope,
        predicate=TimelineEvidencePredicate.from_query(scope, _query()),
        after_sequence=0,
        through_sequence=12,
        phase="snapshot",
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
        def __init__(self, records: tuple[TimelineLedgerRecord, ...]) -> None:
            self.records = records
            self.calls: list[dict[str, object]] = []

        def _cursor_state(self, _workspace_id: str) -> tuple[int, int]:
            return 12, 9

        def _read_records(
            self, _read_scope: object, **kwargs: object
        ) -> tuple[TimelineLedgerRecord, ...]:
            self.calls.append(kwargs)
            return self.records

    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),),
    )
    predicate = TimelineEvidencePredicate.from_query(scope, _query())
    full = Repository((TimelineLedgerRecord(9, _resource_event("inventory:9", "event-9")),))

    snapshot = TimelineLedgerRepository.snapshot_timeline_events(
        full,
        scope,
        predicate=predicate,
        limit=1,
    )

    assert snapshot.events[0].event_id == "event-9"
    assert snapshot.records[0].sequence == 9
    assert full.calls == [
        {
            "after_sequence": 8,
            "through_sequence": 12,
            "predicate": predicate,
            "phase": "snapshot",
            "limit": 2,
            "replay_order": False,
        }
    ]

    overflow = Repository(
        (
            TimelineLedgerRecord(9, _resource_event("inventory:9", "event-9")),
            TimelineLedgerRecord(10, _resource_event("inventory:10", "event-10")),
        )
    )
    with pytest.raises(TimelineSnapshotLimitExceeded, match="limit exceeded"):
        TimelineLedgerRepository.snapshot_timeline_events(
            overflow,
            scope,
            predicate=predicate,
            limit=1,
        )
