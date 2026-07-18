"""Timeline aggregate and snapshot reads share one transaction-local connection."""

from __future__ import annotations

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from threading import Barrier, Lock
from typing import Any

from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import TimelineLedgerReadScope, TimelineLedgerRepository
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import TimelineQuery, TimelineWindow


class _Result:
    def __init__(self, rows: tuple[dict[str, object], ...] = ()) -> None:
        self.rows = rows

    def mappings(self) -> _Result:
        return self

    def one_or_none(self) -> dict[str, object] | None:
        return self.rows[0] if self.rows else None

    def scalar_one(self) -> int:
        return int(self.rows[0]["count"])

    def __iter__(self) -> Iterator[dict[str, object]]:
        return iter(self.rows)


class _Connection:
    def __init__(self) -> None:
        self.domain_statement_columns: list[tuple[str, ...]] = []

    def execute(self, statement: Any) -> _Result:
        selected = getattr(statement, "selected_columns", None)
        if selected is None:
            return _Result()
        columns = tuple(selected.keys())
        self.domain_statement_columns.append(columns)
        if columns == ("last_sequence", "retained_from_sequence"):
            return _Result(({"last_sequence": 7, "retained_from_sequence": 1},))
        return _Result()


class _Engine:
    def __init__(self, *, entry_barrier: Barrier | None = None) -> None:
        self.begin_count = 0
        self.connections: list[_Connection] = []
        self.entry_barrier = entry_barrier
        self.lock = Lock()

    @contextmanager
    def begin(self) -> Iterator[_Connection]:
        connection = _Connection()
        with self.lock:
            self.begin_count += 1
            self.connections.append(connection)
        if self.entry_barrier is not None:
            self.entry_barrier.wait(timeout=1)
        yield connection


def _scope_and_predicate() -> tuple[TimelineLedgerReadScope, TimelineEvidencePredicate]:
    scopes = (ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),)
    scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=scopes,
        inventory_cluster_ids=frozenset({"cluster-a"}),
    )
    query = TimelineQuery(
        scopes=scopes,
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode="live",
    )
    return scope, TimelineEvidencePredicate.from_query(scope, query)


def _repository(
    *, entry_barrier: Barrier | None = None
) -> tuple[TimelineLedgerRepository, _Engine]:
    repository = object.__new__(TimelineLedgerRepository)
    engine = _Engine(entry_barrier=entry_barrier)
    repository.engine = engine  # type: ignore[assignment]
    return repository, engine


def test_snapshot_cursor_and_events_share_one_read_transaction_connection() -> None:
    repository, engine = _repository()
    scope, predicate = _scope_and_predicate()

    snapshot = repository.snapshot_timeline_events(scope, predicate=predicate)

    assert snapshot.high_water_sequence == 7
    assert snapshot.retained_from_sequence == 1
    assert snapshot.records == ()
    assert engine.begin_count == 1
    assert len(engine.connections) == 1
    assert engine.connections[0].domain_statement_columns == [
        ("last_sequence", "retained_from_sequence"),
        (
            "workspace_id",
            "sequence",
            "source_key",
            "event_id",
            "source",
            "native_id",
            "activity",
            "cluster_id",
            "namespace",
            "freshness",
            "event_type",
            "severity",
            "title",
            "subject",
            "resource",
            "owner",
            "metadata",
            "occurred_at",
            "recorded_at",
        ),
    ]


def test_overview_aggregates_share_one_read_transaction_connection() -> None:
    repository, engine = _repository()
    scope, predicate = _scope_and_predicate()

    overview = repository.timeline_overview(
        scope,
        predicate=predicate,
        bucket_width_ms=1_000,
    )

    assert overview.buckets == ()
    assert overview.activity_counts == {}
    assert overview.kind_counts == {}
    assert overview.new_evidence_count is None
    assert engine.begin_count == 1
    assert len(engine.connections) == 1
    assert engine.connections[0].domain_statement_columns == [
        ("bucket_index", "event_count", "problem_count"),
        ("activity", "count"),
        ("kind", "count"),
    ]


def test_concurrent_snapshots_keep_request_transactions_isolated() -> None:
    repository, engine = _repository(entry_barrier=Barrier(2))
    scope, predicate = _scope_and_predicate()

    def read_snapshot() -> tuple[int, int]:
        snapshot = repository.snapshot_timeline_events(scope, predicate=predicate)
        return snapshot.high_water_sequence, snapshot.retained_from_sequence

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = tuple(pool.map(lambda _index: read_snapshot(), range(2)))

    assert results == ((7, 1), (7, 1))
    assert engine.begin_count == 2
    assert len({id(connection) for connection in engine.connections}) == 2
    assert all(len(connection.domain_statement_columns) == 2 for connection in engine.connections)
