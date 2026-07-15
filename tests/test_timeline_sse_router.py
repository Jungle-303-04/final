from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.access import AuthorizedTimelineScope
from domains.timeline.cursor import TimelineCursorBinding, TimelineReplayCursorCodec
from domains.timeline.fanout import TimelineFanoutClosed, TimelineFanoutOverflow
from domains.timeline.repository import (
    TimelineLedgerReadScope,
    TimelineLedgerRecord,
    TimelineReplayResult,
)
from domains.timeline.router import _resume_cursor, _timeline_sse_body
from domains.timeline.service import TimelineReadResolution
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    RealtimePolicy,
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


def _resolution() -> TimelineReadResolution:
    scope = ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")
    query = TimelineQuery(scopes=(scope,), window=TimelineWindow(from_ms=1_000, to_ms=2_000))
    authorized = AuthorizedTimelineScope(
        workspace_id="workspace-a",
        user_id="user-a",
        roles=("operator",),
        cluster_ids=frozenset({"cluster-a"}),
        application_ids=frozenset(),
        incident_cluster_ids=frozenset(),
        deployment_application_ids=frozenset(),
    )
    return TimelineReadResolution(
        authorized=authorized,
        query=query,
        scopes=(scope,),
        read_scope=TimelineLedgerReadScope(
            workspace_id="workspace-a",
            scopes=(scope,),
            inventory_cluster_ids=frozenset({"cluster-a"}),
        ),
        cursor_binding=TimelineCursorBinding(
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
    )


def _event() -> TimelineEvent:
    scope = ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")
    resource = ResourceRef(kind="Deployment", namespace="payments", name="checkout", uid="uid-a")
    return TimelineEvent(
        event_id="event-7",
        source="inventory",
        source_key="inventory:event-7",
        native_id="event-7",
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=scope,
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment updated",
    )


def _available(*records: TimelineLedgerRecord) -> TimelineReplayResult:
    return TimelineReplayResult(
        status="available",
        records=records,
        high_water_sequence=7,
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
    assert reader.calls == [{"after_sequence": 4, "limit": 2}]
    assert subscription.closed is True


def test_sse_overflow_replays_durable_suffix_and_retention_requires_resync() -> None:
    overflow_reader = ReplayReader(
        [
            _available(),
            _available(TimelineLedgerRecord(sequence=7, event=_event())),
            _available(),
        ]
    )
    overflow_chunks = asyncio.run(
        _collect(
            _timeline_sse_body(
                replay_reader=overflow_reader,
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
                subscription=ClosedSubscription(),
                resolution=_resolution(),
                cursor_codec=_cursor_codec(),
                after_sequence=4,
            )
        )
    )
    assert [frame.kind for frame in _frames(resync_chunks)] == ["resync_required"]


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
