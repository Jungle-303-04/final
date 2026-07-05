"""스트림 subject 자동 파생 검증 — 수동 와일드카드 목록의 drift 를 원천 차단."""

from __future__ import annotations

from domains.registry import load_domain_events
from packages.contracts.event_bus.registry import events
from packages.contracts.event_bus.subjects import (
    RESERVED_STREAM_SUBJECTS,
    STREAM_SUBJECTS,
    EventSubject,
)


def test_every_event_subject_is_covered_by_stream_wildcards() -> None:
    prefixes = {subject.split(".", 1)[0] + ".>" for subject in STREAM_SUBJECTS}
    for member in EventSubject:
        wildcard = member.value.split(".", 1)[0] + ".>"
        assert wildcard in prefixes, f"{member.value} not covered by stream subjects"


def test_stream_wildcards_have_no_orphans() -> None:
    """모든 와일드카드는 발행 enum 프리픽스이거나 명시된 예약 프리픽스여야 함."""
    enum_prefixes = {value.split(".", 1)[0] + ".>" for value in EventSubject}
    allowed = enum_prefixes | set(RESERVED_STREAM_SUBJECTS)

    for wildcard in STREAM_SUBJECTS:
        assert wildcard in allowed, f"orphan stream wildcard: {wildcard}"


def test_load_domain_events_registers_bodies_for_new_domains() -> None:
    """도메인 events.py 생성만으로 카탈로그에 등록되는지 — 최신 도메인(ai)으로 확인."""
    load_domain_events()

    registered = set(events._defs)
    assert EventSubject.AI_MESSAGE_RECEIVED in registered
    assert EventSubject.GIT_CHANGED in registered
    assert len(registered) >= 50
