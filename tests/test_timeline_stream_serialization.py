"""Timeline transport serialization must never make a partial replay look complete."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from domains.timeline.streams import TimelineStreamProtocolError, encode_ndjson, encode_sse
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import TimelineEvent, TimelineStreamFrame


def _event(cursor: int) -> TimelineEvent:
    return TimelineEvent(
        event_id=f"event-{cursor}",
        cursor=cursor,
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        resource=ResourceRef(kind="Pod", namespace="default", name="api", uid="uid-a"),
        event_type="update",
        severity="info",
        title="Pod api updated",
    )


def test_ndjson_and_sse_use_one_ordered_terminal_protocol() -> None:
    frames = (
        TimelineStreamFrame(kind="snapshot", cursor=4, events=[_event(4)]),
        TimelineStreamFrame(kind="event", cursor=5, event=_event(5)),
        TimelineStreamFrame(kind="end", cursor=5),
    )

    assert encode_ndjson(frames).splitlines()[-1] == '{"kind":"end","cursor":5}'
    assert encode_sse(frames).split("\n\n")[-2].splitlines() == [
        "id: 5",
        "event: end",
        'data: {"kind":"end","cursor":5}',
    ]


@pytest.mark.parametrize(
    ("frames", "message"),
    [
        ((TimelineStreamFrame(kind="snapshot", cursor=0),), "terminal frame is required"),
        (
            (
                TimelineStreamFrame(kind="snapshot", cursor=3),
                TimelineStreamFrame(kind="event", cursor=3, event=_event(3)),
                TimelineStreamFrame(kind="end", cursor=3),
            ),
            "strictly advance",
        ),
        (
            (
                TimelineStreamFrame(kind="snapshot", cursor=3),
                TimelineStreamFrame(kind="end", cursor=3),
                TimelineStreamFrame(kind="event", cursor=4, event=_event(4)),
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
