from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from typing import Any

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.processing import CLAIM_BLOCKED, EventProcessingStatus
from packages.contracts.interfaces import EventProcessingRecord
from packages.events.envelope import event
from packages.runtime.worker import EventProcessor, EventRetryPolicy


class FakeMessage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.data = json.dumps(payload).encode()
        self.acked = False
        self.nak_delay: int | None = None

    @classmethod
    def raw(cls, data: bytes) -> FakeMessage:
        message = cls({})
        message.data = data
        return message

    async def ack(self) -> None:
        self.acked = True

    async def nak(self, delay: int = 0) -> None:
        self.nak_delay = delay


class FakeProcessingStore:
    def __init__(self, attempts: int = 1, status: str = EventProcessingStatus.PROCESSING) -> None:
        self.attempts = attempts
        self.status = status
        self.recorded: list[EventEnvelope] = []
        self.finished: list[tuple[str, str]] = []
        self.failed: list[tuple[str, str, str]] = []
        self.staged: list[EventEnvelope] = []

    @contextmanager
    def unit_of_work(self):
        yield None

    def stage_events(self, conn: Any, events: list[EventEnvelope]) -> None:
        self.staged.extend(events)

    def record_event(self, evt: EventEnvelope) -> None:
        self.recorded.append(evt)

    def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> dict[str, Any]:
        return EventProcessingRecord(status=self.status, attempts=self.attempts)

    def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None:
        self.finished.append((evt.event_id, consumer))

    def fail_event_processing(
        self, evt: EventEnvelope, consumer: str, error: str, status: str
    ) -> None:
        self.failed.append((evt.event_id, consumer, status))


class FakeDeadLetters:
    def __init__(self) -> None:
        self.captured: list[tuple[EventEnvelope, str, str, int]] = []
        self.raw: list[tuple[bytes, str, str]] = []

    async def capture(
        self, evt: EventEnvelope, consumer: str, error: Exception, attempts: int
    ) -> EventEnvelope:
        self.captured.append((evt, consumer, str(error), attempts))
        return event(
            "dead_letter.created",
            consumer,
            {"original_event_id": evt.event_id, "attempts": attempts},
            evt.correlation_id,
            evt.event_id,
        )

    async def capture_raw(self, raw: bytes, consumer: str, error: Exception) -> EventEnvelope:
        self.raw.append((raw, consumer, str(error)))
        return event(
            "dead_letter.created",
            consumer,
            {"original_subject": "__decode_failed__", "raw": raw.decode(errors="replace")},
            "decode-failure",
            None,
        )


def test_retry_policy_env_defaults_remain_unchanged() -> None:
    # env 미설정 시 기존 기본값과 동일해야 함(배포 호환)
    policy = EventRetryPolicy()
    assert policy.max_attempts == 3
    assert policy.fetch_batch_size == 1
    assert policy.idle_sleep_seconds == 0.25
    assert policy.handler_timeout_seconds == 30


def test_event_processor_acks_successful_handler() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-1")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore()
        dead_letters = FakeDeadLetters()
        handled: list[str] = []

        async def handler(received: EventEnvelope) -> list[EventEnvelope]:
            handled.append(received.event_id)
            return []

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2),
        )

        await processor.process(message)

        assert message.acked is True
        assert message.nak_delay is None
        assert handled == [evt.event_id]
        assert store.finished == [(evt.event_id, "command-worker")]
        assert dead_letters.captured == []

    asyncio.run(run())


def test_event_processor_naks_retryable_failure() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": False}, "corr-2")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore(attempts=1)
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise RuntimeError("temporary failure")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2, retry_delay_seconds=7),
        )

        await processor.process(message)

        assert message.acked is False
        assert message.nak_delay == 7
        assert store.failed == [(evt.event_id, "command-worker", EventProcessingStatus.RETRYING)]
        assert dead_letters.captured == []

    asyncio.run(run())


def test_event_processor_dead_letters_after_max_attempts() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": False}, "corr-3")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore(attempts=2)
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise RuntimeError("permanent failure")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2),
        )

        await processor.process(message)

        assert message.acked is True
        assert message.nak_delay is None
        assert store.failed == [
            (evt.event_id, "command-worker", EventProcessingStatus.DEAD_LETTERED)
        ]
        assert dead_letters.captured[0][1:] == ("command-worker", "permanent failure", 2)

    asyncio.run(run())


def test_event_processor_skips_terminal_duplicate_with_ack() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-4")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore(status=EventProcessingStatus.PROCESSED)
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise AssertionError("이미 종결된 이벤트는 핸들러 실행 금지")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2),
        )

        await processor.process(message)

        assert message.acked is True
        assert message.nak_delay is None
        assert store.finished == []

    asyncio.run(run())


def test_event_processor_naks_when_claim_blocked_by_fresh_processing() -> None:
    # 다른 인스턴스의 신선한 PROCESSING → claim 미획득. 종결이 아니므로 ack 로
    # 소거하지 않고 nak 로 재확인을 예약함(원 처리자 사망 시 유실 방지).
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-5")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore(status=CLAIM_BLOCKED)
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise AssertionError("claim 미획득 이벤트는 핸들러 실행 금지")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2, retry_delay_seconds=5),
        )

        await processor.process(message)

        assert message.acked is False
        assert message.nak_delay == 5
        assert store.finished == []
        assert dead_letters.captured == []

    asyncio.run(run())


def test_event_processor_acks_and_raw_dead_letters_decode_failure() -> None:
    async def run() -> None:
        message = FakeMessage.raw(b"{not-json")
        store = FakeProcessingStore()
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise AssertionError("handler must not run for malformed payload")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2),
        )

        await processor.process(message)

        assert message.acked is True
        assert message.nak_delay is None
        assert dead_letters.raw[0][0] == b"{not-json"
        assert store.recorded == []

    asyncio.run(run())
