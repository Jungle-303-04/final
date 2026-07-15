from __future__ import annotations

import pytest

from domains.timeline.settings import (
    TIMELINE_MAX_BATCH_EVENTS_ENV,
    TIMELINE_MAX_FRAMES_PER_SECOND_ENV,
    TIMELINE_MAX_WINDOW_SECONDS_ENV,
    TIMELINE_REPLAY_POLL_SECONDS_ENV,
    TIMELINE_RETENTION_SECONDS_ENV,
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

    policy = timeline_realtime_policy()

    assert policy.model_dump() == {
        "max_batch_events": 25,
        "max_frames_per_second": 30,
        "retention_seconds": 3600,
        "resume": "cursor",
        "hidden_tab": "coalesce",
    }
    assert timeline_max_window_ms() == 7_200_000
    assert timeline_replay_poll_seconds() == 0.25


def test_timeline_realtime_policy_rejects_invalid_server_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(TIMELINE_MAX_FRAMES_PER_SECOND_ENV, "61")

    with pytest.raises(ValueError, match=TIMELINE_MAX_FRAMES_PER_SECOND_ENV):
        timeline_realtime_policy()
