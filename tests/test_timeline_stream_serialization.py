"""Timeline transport serialization must never make a partial replay look complete."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import pytest

from domains.timeline.settings import timeline_capability_descriptor
from domains.timeline.streams import (
    TimelineStreamProtocolError,
    encode_ndjson,
    encode_sse,
    encode_sse_frame,
)
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    RealtimePolicy,
    TimelineCapabilityDescriptor,
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
            max_retained_range_ms=7_200_000,
            query_bounds=timeline_capability_descriptor().query_bounds,
            namespace_filter_policy="not_required",
            control_surface=timeline_capability_descriptor().control_surface,
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
        '{"kind":"end","cursor":{"token":"timeline-cursor-5"},"pin_set_revision":null}'
    )
    assert encode_sse(frames).split("\n\n")[-2].splitlines() == [
        "id: timeline-cursor-5",
        "event: end",
        'data: {"kind":"end","cursor":{"token":"timeline-cursor-5"},"pin_set_revision":null}',
    ]


def test_serialized_timeline_events_keep_their_discriminated_subject_kind() -> None:
    encoded = encode_ndjson((_snapshot(), TimelineStreamFrame(kind="end", cursor=_cursor(4))))
    snapshot = TimelineStreamFrame.model_validate_json(encoded.splitlines()[0])

    assert snapshot.events[0].subject.kind == "resource"


def test_snapshot_serializes_the_server_owned_reconnect_budget() -> None:
    encoded = encode_ndjson((_snapshot(), TimelineStreamFrame(kind="end", cursor=_cursor(4))))
    snapshot = TimelineStreamFrame.model_validate_json(encoded.splitlines()[0])

    assert snapshot.policy is not None
    assert snapshot.policy.reconnect.model_dump() == {
        "min_delay_ms": 500,
        "max_delay_ms": 30_000,
        "strategy": "full_jitter_exponential",
    }
    assert snapshot.policy.live_session.model_dump() == {
        "max_age_ms": 30_000,
        "strategy": "replace_with_snapshot",
    }
    assert snapshot.capabilities is not None
    assert snapshot.capabilities.model_dump(exclude={"control_surface", "query_bounds"}) == {
        "selected_source_mode": "retained",
        "available_source_modes": ("retained",),
        "max_retained_range_ms": 7_200_000,
        "namespace_filter_policy": "not_required",
    }
    assert snapshot.capabilities.query_bounds.max_window_ms == 2_592_000_000


def test_stream_keeps_fields_required_by_the_strict_browser_contract() -> None:
    snapshot_line, end_line = encode_ndjson(
        (_snapshot(), TimelineStreamFrame(kind="end", cursor=_cursor(4)))
    ).splitlines()
    snapshot = json.loads(snapshot_line)
    end = json.loads(end_line)
    controls = snapshot["capabilities"]["control_surface"]

    assert snapshot["pin_set_revision"] is None
    assert snapshot["scopes"][0]["namespaces"] == []
    assert snapshot["scopes"][0]["freshness"] == "live"
    assert snapshot["events"][0]["owner"] is None
    assert snapshot["events"][0]["metadata"] == {}
    assert controls["views"][0]["description"] is None
    assert controls["activity"][0]["activity"] == []
    assert controls["activity"][0]["problems_activity"] == ["unhealthy", "warning"]
    assert controls["custom_time_range_id"] == "custom"
    assert end == {
        "kind": "end",
        "cursor": {"token": "timeline-cursor-4"},
        "pin_set_revision": None,
    }


def test_live_sse_frame_keeps_opaque_cursor_without_claiming_a_terminal() -> None:
    frame = TimelineStreamFrame(kind="event", cursor=_cursor(5), event=_event(5))
    lines = encode_sse_frame(frame).splitlines()
    payload = json.loads(lines[2].removeprefix("data: "))

    assert lines[:2] == [
        "id: timeline-cursor-5",
        "event: event",
    ]
    assert payload["pin_set_revision"] is None
    assert payload["event"]["subject"]["kind"] == "resource"
    assert payload["event"]["owner"] is None


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
