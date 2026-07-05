"""EventEnvelope 스키마 버전 하위호환 회귀 테스트."""

from __future__ import annotations

from packages.contracts.event_bus.interfaces import ENVELOPE_SCHEMA_VERSION, EventEnvelope

LEGACY_MESSAGE = {
    "event_id": "evt-1",
    "subject": "git.changed",
    "source": "git-pull-worker",
    "correlation_id": "corr-1",
    "causation_id": None,
    "created_at": "2026-01-01T00:00:00+00:00",
    "payload": {"commit_sha": "abc"},
}


def test_legacy_message_without_version_defaults_to_1() -> None:
    evt = EventEnvelope.from_mapping(LEGACY_MESSAGE)
    assert evt.schema_version == 1


def test_round_trip_preserves_schema_version() -> None:
    evt = EventEnvelope.from_mapping({**LEGACY_MESSAGE, "schema_version": 2})
    assert EventEnvelope.from_mapping(evt.to_dict()).schema_version == 2


def test_to_dict_always_includes_schema_version() -> None:
    evt = EventEnvelope.from_mapping(LEGACY_MESSAGE)
    assert evt.to_dict()["schema_version"] == ENVELOPE_SCHEMA_VERSION


def test_unknown_fields_are_ignored() -> None:
    # 신버전 producer 가 필드를 추가해도 구버전 consumer 는 무시하고 처리 가능
    evt = EventEnvelope.from_mapping({**LEGACY_MESSAGE, "future_field": "x"})
    assert evt.event_id == "evt-1"
