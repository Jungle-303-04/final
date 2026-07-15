"""Timeline transport serialization must never make a partial replay look complete."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from domains.timeline.streams import TimelineStreamProtocolError, encode_ndjson, encode_sse
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    RealtimePolicy,
    TimelineCursor,
    TimelineEvent,
    TimelineResourceSubject,
    TimelineStreamFrame,
)


def _cursor(sequence: int) -> TimelineCursor:
    return TimelineCursor(token=f"timeline-cursor-{sequence}")


def _event(sequence: int) -> TimelineEvent:
    resource = ResourceRef(kind="Pod", namespace="default", name="api", uid="uid-a")
    return TimelineEvent(
        event_id=f"event-{sequence}",
        source="inventory",
        source_key=f"inventory:event-{sequence}",
        native_id=f"native-{sequence}",
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Pod api updated",
    )


def _snapshot(sequence: int = 4) -> TimelineStreamFrame:
    return TimelineStreamFrame(
        kind="snapshot",
        cursor=_cursor(sequence),
        scopes=[ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")],
        policy=RealtimePolicy(
            max_batch_events=100,
            max_frames_per_second=60,
            retention_seconds=86_400,
            resume="cursor",
            hidden_tab="coalesce",
        ),
        events=[_event(sequence)] if sequence else [],
    )


def test_ndjson_and_sse_use_one_ordered_terminal_protocol() -> None:
    frames = (
        _snapshot(),
        TimelineStreamFrame(kind="event", cursor=_cursor(5), event=_event(5)),
        TimelineStreamFrame(kind="end", cursor=_cursor(5)),
    )

    assert encode_ndjson(frames).splitlines()[-1] == (
        '{"kind":"end","cursor":{"token":"timeline-cursor-5"}}'
    )
    assert encode_sse(frames).split("\n\n")[-2].splitlines() == [
        "id: timeline-cursor-5",
        "event: end",
        'data: {"kind":"end","cursor":{"token":"timeline-cursor-5"}}',
    ]


@pytest.mark.parametrize(
    ("frames", "message"),
    [
        ((_snapshot(0),), "terminal frame is required"),
        (
            (
                _snapshot(3),
                TimelineStreamFrame(kind="event", cursor=_cursor(3), event=_event(3)),
                TimelineStreamFrame(kind="end", cursor=_cursor(3)),
            ),
            "must advance",
        ),
        (
            (
                _snapshot(3),
                TimelineStreamFrame(kind="end", cursor=_cursor(3)),
                TimelineStreamFrame(kind="event", cursor=_cursor(4), event=_event(4)),
            ),
            "must be last",
        ),
    ],
)
def test_stream_encoder_rejects_truncated_or_invalid_replay(
    frames: tuple[TimelineStreamFrame, ...], message: str
) -> None:
    with pytest.raises(TimelineStreamProtocolError, match=message):
        encode_ndjson(frames)
