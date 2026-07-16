from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.access import AuthorizedTimelineScope
from domains.timeline.cursor import TimelineCursorBinding, TimelineReplayCursorCodec
from domains.timeline.fanout import TimelineFanoutClosed, TimelineFanoutOverflow
from domains.timeline.predicate import TimelineEvidencePredicate
from domains.timeline.repository import (
    TimelineLedgerReadScope,
    TimelineLedgerRecord,
    TimelineReplayResult,
)
from domains.timeline.router import _resume_cursor, _timeline_sse_body
from domains.timeline.service import TimelineReadResolution
from domains.timeline.settings import timeline_capability_descriptor
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    RealtimePolicy,
    TimelineCapabilityDescriptor,
    TimelineCoverage,
    TimelineCursor,
    TimelineEvent,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineStreamFrame,
    TimelineWindow,
)


class ReplayReader:
    def __init__(self, results: list[TimelineReplayResult]) -> None:
        self.results = results
        self.calls: list[dict[str, object]] = []

    def __call__(self, _scope: object, **kwargs: object) -> TimelineReplayResult:
        self.calls.append(dict(kwargs))
        return self.results.pop(0)


class CoverageReader:
    """Return durable coverage states in server-side replay-poll order."""

    def __init__(self, results: list[tuple[TimelineCoverage, ...]] | None = None) -> None:
        self.results = results or []
        self.calls: list[dict[str, object]] = []

    def __call__(self, _scope: object, **kwargs: object) -> tuple[TimelineCoverage, ...]:
        self.calls.append(dict(kwargs))
        return self.results.pop(0) if self.results else ()


class ClosedSubscription:
    closed = False

    async def next(self) -> None:
        raise TimelineFanoutClosed("closed")

    async def close(self) -> None:
        self.closed = True


class OverflowThenClosedSubscription(ClosedSubscription):
    def __init__(self) -> None:
        self._overflowed = False

    async def next(self) -> None:
        if not self._overflowed:
            self._overflowed = True
            raise TimelineFanoutOverflow()
        raise TimelineFanoutClosed("closed")


class TimeoutThenClosedSubscription(ClosedSubscription):
    def __init__(self) -> None:
        self._timed_out = False

    async def next(self) -> None:
        if not self._timed_out:
            self._timed_out = True
            raise TimeoutError
        raise TimelineFanoutClosed("closed")


def _resolution(*, mode: str = "live", event_access: bool = False) -> TimelineReadResolution:
    scope = ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")
    query = TimelineQuery(
        scopes=(scope,),
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode=mode,  # type: ignore[arg-type]
    )
    authorized = AuthorizedTimelineScope(
        workspace_id="workspace-a",
        user_id="user-a",
        roles=("operator",),
        cluster_ids=frozenset({"cluster-a"}),
        application_ids=frozenset(),
        incident_cluster_ids=frozenset(),
        deployment_application_ids=frozenset(),
    )
    read_scope = TimelineLedgerReadScope(
        workspace_id="workspace-a",
        scopes=(scope,),
        inventory_cluster_ids=frozenset({"cluster-a"}),
        kubernetes_event_cluster_ids=(frozenset({"cluster-a"}) if event_access else frozenset()),
    )
    return TimelineReadResolution(
        authorized=authorized,
        query=query,
        scopes=(scope,),
        read_scope=read_scope,
        evidence_predicate=TimelineEvidencePredicate.from_query(read_scope, query),
        cursor_binding=TimelineCursorBinding.from_query(
            user_id="user-a",
            authorization_revision=authorized.authorization_revision,
            query=query,
        ),
        policy=RealtimePolicy(
            max_batch_events=2,
            max_frames_per_second=60,
            retention_seconds=86_400,
            resume="cursor",
            hidden_tab="coalesce",
            reconnect={
                "min_delay_ms": 500,
                "max_delay_ms": 30_000,
                "strategy": "full_jitter_exponential",
            },
            live_session={
                "max_age_ms": 30_000,
                "strategy": "replace_with_snapshot",
            },
        ),
        capabilities=TimelineCapabilityDescriptor(
            selected_source_mode="retained",
            available_source_modes=("retained",),
            max_retained_range_ms=2_592_000_000,
            query_bounds=timeline_capability_descriptor().query_bounds,
            namespace_filter_policy="not_required",
            control_surface=timeline_capability_descriptor().control_surface,
        ),
    )


def _event(*, occurred_at: datetime | None = None) -> TimelineEvent:
    scope = ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")
    resource = ResourceRef(kind="Deployment", namespace="payments", name="checkout", uid="uid-a")
    return TimelineEvent(
        event_id="event-7",
        source="inventory",
        source_key="inventory:event-7",
        native_id="event-7",
        activity="change",
        occurred_at=occurred_at or datetime(1970, 1, 1, 0, 0, 1, 500_000, tzinfo=UTC),
        scope=scope,
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment updated",
    )


def _available(
    *records: TimelineLedgerRecord,
    high_water_sequence: int = 7,
) -> TimelineReplayResult:
    return TimelineReplayResult(
        status="available",
        records=records,
        high_water_sequence=high_water_sequence,
        retained_from_sequence=1,
    )


def _cursor_codec() -> TimelineReplayCursorCodec:
    return TimelineReplayCursorCodec(FilterCursorCodec("timeline-sse-router-test-secret!!!!"))


def _frames(chunks: list[str]) -> list[TimelineStreamFrame]:
    frames: list[TimelineStreamFrame] = []
    for chunk in chunks:
        for line in chunk.splitlines():
            if line.startswith("data: "):
                frames.append(TimelineStreamFrame.model_validate_json(line.removeprefix("data: ")))
    return frames


def test_sse_replays_durable_records_then_reports_closed_fanout_without_raw_sequences() -> None:
    reader = ReplayReader(
        [
            _available(TimelineLedgerRecord(sequence=7, event=_event())),
            _available(),
        ]
    )
    subscription = ClosedSubscription()
    resolution = _resolution()
    cursor_codec = _cursor_codec()
    chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=reader,
                coverage_reader=CoverageReader(),
                subscription=subscription,
                resolution=resolution,
                cursor_codec=cursor_codec,
                after_sequence=4,
            )
        )
    )

    frames = _frames(chunks)
    assert [frame.kind for frame in frames] == ["event", "error"]
    assert frames[0].event.event_id == "event-7"
    assert cursor_codec.decode(frames[0].cursor, binding=resolution.cursor_binding) == 7
    assert cursor_codec.decode(frames[1].cursor, binding=resolution.cursor_binding) == 7
    assert all("sequence" not in chunk for chunk in chunks)
    assert reader.calls[0] == {
        "after_sequence": 4,
        "predicate": resolution.evidence_predicate,
        "limit": 2,
    }
    assert subscription.closed is True


def test_sse_overflow_replays_durable_suffix_and_retention_requires_resync() -> None:
    overflow_reader = ReplayReader(
        [
            _available(high_water_sequence=4),
            _available(TimelineLedgerRecord(sequence=7, event=_event())),
            _available(),
        ]
    )
    overflow_chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=overflow_reader,
                coverage_reader=CoverageReader(),
                subscription=OverflowThenClosedSubscription(),
                resolution=_resolution(),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )
    assert [frame.kind for frame in _frames(overflow_chunks)] == ["event", "error"]

    resync_reader = ReplayReader(
        [
            TimelineReplayResult(
                status="resync_required",
                records=(),
                high_water_sequence=9,
                retained_from_sequence=6,
                reason="retention_boundary",
            )
        ]
    )
    resync_chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=resync_reader,
                coverage_reader=CoverageReader(),
                subscription=ClosedSubscription(),
                resolution=_resolution(),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )
    assert [frame.kind for frame in _frames(resync_chunks)] == ["resync_required"]


def test_live_sse_allows_new_events_past_snapshot_upper_bound_but_frozen_does_not() -> None:
    event_after_snapshot = _event(occurred_at=datetime(1970, 1, 1, 0, 0, 2, 500_000, tzinfo=UTC))
    live_chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=ReplayReader(
                    [
                        _available(TimelineLedgerRecord(sequence=7, event=event_after_snapshot)),
                        _available(),
                    ]
                ),
                coverage_reader=CoverageReader(),
                subscription=ClosedSubscription(),
                resolution=_resolution(mode="live"),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )
    frozen_chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=ReplayReader(
                    [
                        _available(TimelineLedgerRecord(sequence=7, event=event_after_snapshot)),
                        _available(),
                    ]
                ),
                coverage_reader=CoverageReader(),
                subscription=ClosedSubscription(),
                resolution=_resolution(mode="frozen"),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )

    assert [frame.kind for frame in _frames(live_chunks)] == ["event", "error"]
    assert [frame.kind for frame in _frames(frozen_chunks)] == ["error"]


def test_sse_coalesces_durable_coverage_additions_without_changing_event_cursor() -> None:
    coverage = TimelineCoverage(
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        source="kubernetes_event",
        from_ms=1_200,
        to_ms=1_400,
        reason="collection_gap",
    )
    reader = CoverageReader([(), (coverage,)])
    resolution = _resolution(event_access=True)
    codec = _cursor_codec()
    chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=ReplayReader([_available(high_water_sequence=4)]),
                coverage_reader=reader,
                subscription=ClosedSubscription(),
                resolution=resolution,
                cursor_codec=codec,
                after_sequence=4,
            )
        )
    )

    frames = _frames(chunks)
    assert [frame.kind for frame in frames] == ["coverage", "error"]
    assert frames[0].coverage == (coverage,)
    assert codec.decode(frames[0].cursor, binding=resolution.cursor_binding) == 4
    assert all("sequence" not in chunk for chunk in chunks)
    assert reader.calls == [
        {"window": resolution.query.window},
        {"window": resolution.query.window},
    ]


def test_sse_repairs_coverage_only_changes_on_the_server_owned_replay_poll(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    coverage = TimelineCoverage(
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        source="kubernetes_event",
        from_ms=1_200,
        to_ms=1_400,
        reason="collection_gap",
    )
    polls: list[float] = []
    monkeypatch.setattr(
        "domains.timeline.router.timeline_replay_poll_seconds",
        lambda: polls.append(0.1) or 0.1,
    )
    chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=ReplayReader(
                    [_available(high_water_sequence=4), _available(high_water_sequence=4)]
                ),
                coverage_reader=CoverageReader([(), (), (coverage,)]),
                subscription=TimeoutThenClosedSubscription(),
                resolution=_resolution(event_access=True),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )

    assert [frame.kind for frame in _frames(chunks)] == ["coverage", "error"]
    assert polls == [0.1, 0.1]
    assert ": keep-alive\n\n" in chunks


def test_sse_requires_one_consistent_opaque_resume_cursor() -> None:
    cursor = TimelineCursor(token="opaque-body")
    assert _resume_cursor(cursor, None) == cursor
    assert _resume_cursor(None, "opaque-header") == TimelineCursor(token="opaque-header")
    with pytest.raises(HTTPException) as missing:
        _resume_cursor(None, None)
    with pytest.raises(HTTPException) as conflict:
        _resume_cursor(cursor, "opaque-header")

    assert missing.value.status_code == 422
    assert conflict.value.status_code == 422


async def _collect(stream: object) -> list[str]:
    return [item async for item in stream]
