"""Safe Timeline coverage projection for global Kubernetes Event capture evidence."""

from __future__ import annotations

from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy.dialects import postgresql

from domains.inventory.repository import InventoryRepository
from domains.timeline.coverage import (
    TimelineCoverageLimitExceeded,
    project_kubernetes_event_capture_coverage,
)
from domains.timeline.repository import TimelineLedgerReadScope
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import TimelineWindow


def _timestamp(second: int) -> datetime:
    return datetime(2026, 7, 16, 12, 0, second, tzinfo=UTC)


def _scope(*, namespaces: tuple[str, ...] = ("payments",)) -> ClusterScope:
    return ClusterScope(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        namespaces=namespaces,
        freshness="live",
    )


def _read_scope(*, event_access: bool = True) -> TimelineLedgerReadScope:
    return TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(_scope(),),
        kubernetes_event_cluster_ids=frozenset({"cluster-a"}) if event_access else frozenset(),
    )


def _snapshot(
    *,
    observed_at: datetime | str,
    complete: bool,
    gap: str | None = None,
    proof: bool = True,
    truncated: object = False,
) -> dict[str, object]:
    coverage: dict[str, object] = {
        "scope": "all_namespaces",
        "pagination": "continue",
        "page_count": 1,
        "event_count": 0,
    }
    if proof:
        coverage["resource_version"] = "rv-1"
    if gap:
        coverage["gap"] = gap
    return {
        "cluster_id": "cluster-a",
        "summary": {
            "summary": {
                "kubernetes_event_capture": {
                    "complete": complete,
                    "truncated": truncated,
                    "reason": "complete" if complete else gap or "network_error",
                    "freshness": {
                        "observed_at": (
                            observed_at.isoformat()
                            if isinstance(observed_at, datetime)
                            else observed_at
                        ),
                        "max_age_seconds": 120,
                    },
                    "coverage": coverage,
                }
            }
        },
    }


def _window(*, from_second: int = 0, to_second: int = 59) -> TimelineWindow:
    return TimelineWindow(
        from_ms=int(_timestamp(from_second).timestamp() * 1_000),
        to_ms=int(_timestamp(to_second).timestamp() * 1_000),
    )


def test_closed_event_capture_gap_uses_only_observed_failure_and_proven_recovery() -> None:
    coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(
            _snapshot(observed_at=_timestamp(10), complete=False, gap="rbac_denied"),
            _snapshot(observed_at=_timestamp(20), complete=True),
        ),
    )

    assert len(coverage) == 1
    projected = coverage[0]
    assert projected.scope == _scope()
    assert projected.source == "kubernetes_event"
    assert projected.reason == "collection_gap"
    assert projected.from_ms == int(_timestamp(10).timestamp() * 1_000)
    assert projected.to_ms == int(_timestamp(20).timestamp() * 1_000)
    assert "rbac_denied" not in projected.model_dump_json()


def test_open_or_unproven_event_capture_gap_is_not_given_an_invented_end_bound() -> None:
    open_gap = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(_snapshot(observed_at=_timestamp(10), complete=False, gap="timeout"),),
    )
    missing_proof = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(
            _snapshot(observed_at=_timestamp(10), complete=False, gap="timeout"),
            _snapshot(observed_at=_timestamp(20), complete=True, proof=False),
        ),
    )

    assert open_gap == ()
    assert missing_proof == ()


def test_proven_recovery_closes_only_the_active_candidate_and_keeps_history_immutable() -> None:
    coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(
            _snapshot(observed_at=_timestamp(10), complete=False, gap="timeout"),
            _snapshot(observed_at=_timestamp(20), complete=True),
            _snapshot(observed_at=_timestamp(30), complete=True),
        ),
    )

    assert [(item.from_ms, item.to_ms) for item in coverage] == [
        (int(_timestamp(10).timestamp() * 1_000), int(_timestamp(20).timestamp() * 1_000))
    ]


def test_projection_uses_query_authorization_and_window_without_clipping_observed_bounds() -> None:
    snapshots = (
        _snapshot(observed_at=_timestamp(10), complete=False, gap="network_error"),
        _snapshot(observed_at=_timestamp(20), complete=True),
    )

    overlapping = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(from_second=15, to_second=25),
        snapshots=snapshots,
    )
    forbidden = project_kubernetes_event_capture_coverage(
        _read_scope(event_access=False),
        window=_window(),
        snapshots=snapshots,
    )
    outside_window = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(from_second=30, to_second=40),
        snapshots=snapshots,
    )

    assert [(item.from_ms, item.to_ms) for item in overlapping] == [
        (int(_timestamp(10).timestamp() * 1_000), int(_timestamp(20).timestamp() * 1_000))
    ]
    assert forbidden == ()
    assert outside_window == ()


def test_only_explicit_incomplete_gap_evidence_opens_coverage() -> None:
    missing_gap_evidence = _snapshot(observed_at=_timestamp(10), complete=False)

    coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(
            missing_gap_evidence,
            _snapshot(observed_at=_timestamp(20), complete=True),
        ),
    )

    assert coverage == ()


def test_ordered_coverage_projection_fails_closed_at_the_response_interval_bound() -> None:
    snapshots = (
        _snapshot(
            observed_at=_timestamp(index * 2),
            complete=False,
            gap="timeout",
        )
        if index % 2 == 0
        else _snapshot(
            observed_at=_timestamp(index * 2),
            complete=True,
        )
        for index in range(8)
    )

    with pytest.raises(TimelineCoverageLimitExceeded):
        project_kubernetes_event_capture_coverage(
            _read_scope(),
            window=TimelineWindow(
                from_ms=int(_timestamp(0).timestamp() * 1_000),
                to_ms=int(_timestamp(59).timestamp() * 1_000),
            ),
            snapshots=snapshots,
            snapshots_ordered=True,
            max_intervals=3,
        )


def test_bounded_pre_window_baseline_preserves_large_history_projection() -> None:
    """One opening gap plus window rows is equivalent to the complete history scan."""
    base = datetime(2026, 1, 1, tzinfo=UTC)

    def at(minute: int) -> datetime:
        return base + timedelta(minutes=minute)

    # Ten thousand closed historical observations establish that response work
    # must not grow with cluster lifetime.  The final repeated pre-window gap
    # must retain its first observed bound, not the latest repeated report.
    old_history = tuple(
        _snapshot(
            observed_at=at(index),
            complete=index % 2 == 1,
            gap=None if index % 2 == 1 else "timeout",
        )
        for index in range(10_000)
    )
    opening_gap = _snapshot(observed_at=at(10_010), complete=False, gap="timeout")
    repeated_gaps = tuple(
        _snapshot(observed_at=at(minute), complete=False, gap="timeout")
        for minute in range(10_011, 10_021)
    )
    window_rows = (
        _snapshot(observed_at=at(10_040), complete=True),
        _snapshot(observed_at=at(10_050), complete=False, gap="rbac_denied"),
        _snapshot(observed_at=at(10_055), complete=True),
    )
    window = TimelineWindow(
        from_ms=int(at(10_030).timestamp() * 1_000),
        to_ms=int(at(10_060).timestamp() * 1_000),
    )

    complete_scan = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=window,
        snapshots=(*old_history, opening_gap, *repeated_gaps, *window_rows),
        snapshots_ordered=True,
    )
    bounded_scan_rows = (opening_gap, *window_rows)
    bounded_scan = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=window,
        snapshots=bounded_scan_rows,
        snapshots_ordered=True,
    )

    assert bounded_scan == complete_scan
    assert len(old_history) + 1 + len(repeated_gaps) + len(window_rows) == 10_014
    assert len(bounded_scan_rows) == 4
    assert bounded_scan[0].from_ms == int(at(10_010).timestamp() * 1_000)


def test_bounded_projection_skips_malformed_observation_before_valid_gap() -> None:
    """A malformed candidate must not hide the next valid lateral gap row."""
    malformed = _snapshot(observed_at="not-a-timestamp", complete=False, gap="timeout")
    valid_gap = _snapshot(observed_at=_timestamp(10), complete=False, gap="timeout")
    recovery = _snapshot(observed_at=_timestamp(20), complete=True)

    complete_scan = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(malformed, valid_gap, recovery),
        snapshots_ordered=True,
    )
    bounded_scan = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(valid_gap, recovery),
        snapshots_ordered=True,
    )

    assert bounded_scan == complete_scan
    assert [(item.from_ms, item.to_ms) for item in bounded_scan] == [
        (
            int(_timestamp(10).timestamp() * 1_000),
            int(_timestamp(20).timestamp() * 1_000),
        )
    ]


def test_gap_requires_boolean_truncated_but_accepts_either_boolean_value() -> None:
    """The SQL gap predicate mirrors the projector's capture decoder exactly."""
    false_gap = _snapshot(
        observed_at=_timestamp(10), complete=False, gap="timeout", truncated=False
    )
    true_gap = _snapshot(observed_at=_timestamp(30), complete=False, gap="timeout", truncated=True)
    invalid_gap = _snapshot(
        observed_at=_timestamp(40), complete=False, gap="timeout", truncated="false"
    )

    false_coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(false_gap, _snapshot(observed_at=_timestamp(20), complete=True)),
    )
    true_coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(true_gap, _snapshot(observed_at=_timestamp(50), complete=True)),
    )
    invalid_coverage = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=_window(),
        snapshots=(invalid_gap, _snapshot(observed_at=_timestamp(50), complete=True)),
    )

    assert len(false_coverage) == 1
    assert len(true_coverage) == 1
    assert invalid_coverage == ()


def test_capture_time_window_preserves_mismatched_collection_boundary() -> None:
    """Semantic observation time, not DB arrival time, selects boundary rows."""
    gap = _snapshot(observed_at=_timestamp(10), complete=False, gap="timeout")
    recovery = _snapshot(observed_at=_timestamp(20), complete=True)
    window = _window(from_second=15, to_second=25)

    # The recovery arrived before the response window by collected_at, while its
    # capture evidence was observed inside it.  A collected_at-bounded query
    # discarded both rows; the derived observation-time index selects the gap
    # baseline plus recovery exactly like the complete semantic projection.
    collected_at = {
        id(gap): _timestamp(5),
        id(recovery): _timestamp(6),
    }
    assert all(value < _timestamp(15) for value in collected_at.values())
    collected_time_bounded = tuple(
        snapshot
        for snapshot in (gap, recovery)
        if _timestamp(15) <= collected_at[id(snapshot)] < _timestamp(25)
    )
    complete_scan = project_kubernetes_event_capture_coverage(
        _read_scope(), window=window, snapshots=(gap, recovery), snapshots_ordered=True
    )
    old_bounded_scan = project_kubernetes_event_capture_coverage(
        _read_scope(),
        window=window,
        snapshots=collected_time_bounded,
        snapshots_ordered=True,
    )
    capture_time_bounded = project_kubernetes_event_capture_coverage(
        _read_scope(), window=window, snapshots=(gap, recovery), snapshots_ordered=True
    )

    assert old_bounded_scan == ()
    assert capture_time_bounded == complete_scan
    assert len(capture_time_bounded) == 1


def test_repository_reads_only_authorized_snapshot_coverage_evidence() -> None:
    def capture(row: Mapping[str, object]) -> object:
        summary = row["summary"]
        assert isinstance(summary, Mapping)
        source_summary = summary["summary"]
        assert isinstance(source_summary, Mapping)
        return source_summary["kubernetes_event_capture"]

    rows = [
        {
            "cluster_id": "cluster-a",
            "status": "accepted",
            "event_capture": capture(
                _snapshot(observed_at=_timestamp(10), complete=False, gap="timeout")
            ),
        },
        {
            "cluster_id": "cluster-a",
            "status": "accepted",
            "event_capture": capture(_snapshot(observed_at=_timestamp(20), complete=True)),
        },
    ]

    class Result:
        partition_sizes: list[int] = []

        def mappings(self) -> Result:
            return self

        def partitions(self, size: int) -> Iterator[list[dict[str, object]]]:
            self.partition_sizes.append(size)
            yield rows

    class Connection:
        statement: object | None = None
        execution_options_kwargs: dict[str, object] = {}

        def execution_options(self, **kwargs: object) -> Connection:
            self.execution_options_kwargs = dict(kwargs)
            return self

        def execute(self, statement: object) -> Result:
            self.statement = statement
            return Result()

    connection = Connection()

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield connection

    repository = object.__new__(InventoryRepository)
    repository.connection = connect
    coverage = repository.snapshot_timeline_coverage(_read_scope(), window=_window())

    assert [(item.from_ms, item.to_ms) for item in coverage] == [
        (int(_timestamp(10).timestamp() * 1_000), int(_timestamp(20).timestamp() * 1_000))
    ]
    assert connection.statement is not None
    selected = connection.statement.selected_columns.keys()  # type: ignore[union-attr]
    assert list(selected) == ["cluster_id", "status", "event_capture"]
    sql = str(
        connection.statement.compile(  # type: ignore[union-attr]
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    ).lower()
    assert "cluster_inventory_snapshots.workspace_id = 'workspace-a'" in sql
    assert "cluster_inventory_snapshots.status != 'ignored_stale'" in sql
    assert "kubernetes_event_capture" in sql
    assert "is not null" in sql
    assert "cluster_inventory_snapshots.event_capture_observed_at <" in sql
    assert "cluster_inventory_snapshots.summary as summary" not in sql
    assert "raw" not in sql
    assert connection.execution_options_kwargs == {
        "max_row_buffer": 128,
        "stream_results": True,
    }
    assert Result.partition_sizes == [128]


def test_repository_stops_streaming_capture_projection_after_request_cancellation() -> None:
    capture = {
        "complete": False,
        "truncated": False,
        "reason": "timeout",
        "freshness": {
            "observed_at": _timestamp(10).isoformat(),
            "max_age_seconds": 120,
        },
        "coverage": {
            "scope": "all_namespaces",
            "pagination": "continue",
            "gap": "timeout",
        },
    }

    class Result:
        partitions_read = 0

        def mappings(self) -> Result:
            return self

        def partitions(self, _size: int) -> Iterator[list[dict[str, object]]]:
            for _index in range(10):
                self.partitions_read += 1
                yield [
                    {
                        "cluster_id": "cluster-a",
                        "status": "accepted",
                        "event_capture": capture,
                    }
                ]

    result = Result()

    class Connection:
        def execution_options(self, **_kwargs: object) -> Connection:
            return self

        def execute(self, _statement: object) -> Result:
            return result

    @contextmanager
    def connect() -> Iterator[Connection]:
        yield Connection()

    repository = object.__new__(InventoryRepository)
    repository.connection = connect

    coverage = repository.snapshot_timeline_coverage(
        _read_scope(),
        window=_window(),
        cancelled=lambda: result.partitions_read >= 1,
    )

    assert coverage == ()
    assert result.partitions_read == 1
