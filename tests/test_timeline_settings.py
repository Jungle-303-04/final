from __future__ import annotations

import pytest

from domains.timeline.settings import (
    TIMELINE_LIVE_SESSION_MAX_AGE_MS_ENV,
    TIMELINE_MAX_BATCH_EVENTS_ENV,
    TIMELINE_MAX_FRAMES_PER_SECOND_ENV,
    TIMELINE_MAX_WINDOW_SECONDS_ENV,
    TIMELINE_RECONNECT_MAX_DELAY_MS_ENV,
    TIMELINE_RECONNECT_MIN_DELAY_MS_ENV,
    TIMELINE_REPLAY_POLL_SECONDS_ENV,
    TIMELINE_RETENTION_SECONDS_ENV,
    timeline_capability_descriptor,
    timeline_max_window_ms,
    timeline_realtime_policy,
    timeline_replay_poll_seconds,
)


def test_timeline_realtime_policy_is_server_owned_and_bounded(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMELINE_MAX_BATCH_EVENTS_ENV, "25")
    monkeypatch.setenv(TIMELINE_MAX_FRAMES_PER_SECOND_ENV, "30")
    monkeypatch.setenv(TIMELINE_RETENTION_SECONDS_ENV, "3600")
    monkeypatch.setenv(TIMELINE_MAX_WINDOW_SECONDS_ENV, "7200")
    monkeypatch.setenv(TIMELINE_REPLAY_POLL_SECONDS_ENV, "0.25")
    monkeypatch.setenv(TIMELINE_RECONNECT_MIN_DELAY_MS_ENV, "250")
    monkeypatch.setenv(TIMELINE_RECONNECT_MAX_DELAY_MS_ENV, "2000")
    monkeypatch.setenv(TIMELINE_LIVE_SESSION_MAX_AGE_MS_ENV, "30000")

    policy = timeline_realtime_policy()

    assert policy.model_dump() == {
        "max_batch_events": 25,
        "max_frames_per_second": 30,
        "retention_seconds": 3600,
        "resume": "cursor",
        "hidden_tab": "coalesce",
        "reconnect": {
            "min_delay_ms": 250,
            "max_delay_ms": 2000,
            "strategy": "full_jitter_exponential",
        },
        "live_session": {
            "max_age_ms": 30000,
            "strategy": "replace_with_snapshot",
        },
    }
    assert timeline_max_window_ms() == 7_200_000
    descriptor = timeline_capability_descriptor()
    assert descriptor.model_dump(exclude={"control_surface"}) == {
        "selected_source_mode": "retained",
        "available_source_modes": ("retained",),
        "max_retained_range_ms": 7_200_000,
        "namespace_filter_policy": "not_required",
    }
    controls = descriptor.control_surface
    assert [(item.id, item.label) for item in controls.views] == [
        ("list", "List"),
        ("swimlane", "Swimlane"),
    ]
    assert [(item.id, item.label) for item in controls.groupings] == [
        ("app", "Application"),
        ("owner", "Workload"),
        ("flat", "None"),
    ]
    assert [item.id for item in controls.sorts] == ["importance", "recent", "name"]
    assert [item.id for item in controls.activity] == ["all", "changes", "k8s_events"]
    assert controls.activity[0].problems_activity == ("unhealthy", "warning")
    assert controls.deleted.model_dump() == {
        "key": "include_deleted",
        "label": "Show deleted",
        "default": True,
    }
    assert controls.kinds.model_dump() == {
        "key": "kinds",
        "label": "Kinds",
        "selection": "multi",
        "empty_selection": "all",
    }
    assert [(item.id, item.duration_ms) for item in controls.time_ranges] == [
        ("1h", 3_600_000),
    ]
    assert controls.default_time_range_id == "1h"
    assert [(item.id, item.duration_ms) for item in controls.lens_zoom_rungs] == [
        ("15m", 900_000),
        ("30m", 1_800_000),
        ("1h", 3_600_000),
        ("2h", 7_200_000),
    ]
    assert controls.default_lens_zoom_rung == "1h"
    assert controls.pins.availability == "unavailable"
    assert timeline_replay_poll_seconds() == 0.25


def test_timeline_realtime_policy_rejects_invalid_server_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMELINE_MAX_FRAMES_PER_SECOND_ENV, "61")

    with pytest.raises(ValueError, match=TIMELINE_MAX_FRAMES_PER_SECOND_ENV):
        timeline_realtime_policy()


def test_timeline_reconnect_policy_rejects_an_inverted_server_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMELINE_RECONNECT_MIN_DELAY_MS_ENV, "5000")
    monkeypatch.setenv(TIMELINE_RECONNECT_MAX_DELAY_MS_ENV, "500")

    with pytest.raises(ValueError, match="minimum"):
        timeline_realtime_policy()


def test_timeline_live_session_policy_rejects_an_unbounded_server_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMELINE_LIVE_SESSION_MAX_AGE_MS_ENV, "300001")

    with pytest.raises(ValueError, match=TIMELINE_LIVE_SESSION_MAX_AGE_MS_ENV):
        timeline_realtime_policy()
