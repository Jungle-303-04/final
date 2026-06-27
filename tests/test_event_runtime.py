from __future__ import annotations

import asyncio
import json
from typing import Any

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.events.envelope import event
from packages.runtime.worker import EventProcessor, EventRetryPolicy


class FakeMessage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.data = json.dumps(payload).encode()
        self.acked = False
        self.nak_delay: int | None = None

    async def ack(self) -> None:
        self.acked = True

    async def nak(self, delay: int = 0) -> None:
        self.nak_delay = delay


class FakeProcessingStore:
    def __init__(
        self, attempts: int = 1, status: str = EventProcessingStatus.PROCESSING
    ) -> None:
        self.attempts = attempts
        self.status = status
        self.recorded: list[EventEnvelope] = []
        self.finished: list[tuple[str, str]] = []
        self.failed: list[tuple[str, str, str]] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.recorded.append(evt)

    def begin_event_processing(
        self, evt: EventEnvelope, consumer: str
    ) -> dict[str, Any]:
        return {"status": self.status, "attempts": self.attempts}

    def finish_event_processing(
        self, evt: EventEnvelope, consumer: str
    ) -> None:
        self.finished.append((evt.event_id, consumer))

    def fail_event_processing(
        self,
        evt: EventEnvelope,
        consumer: str,
        error: str,
        status: str,
    ) -> None:
        self.failed.append((evt.event_id, consumer, status))


class FakeDeadLetters:
    def __init__(self) -> None:
        self.captured: list[tuple[EventEnvelope, str, str, int]] = []

    async def capture(
        self,
        evt: EventEnvelope,
        consumer: str,
        error: Exception,
        attempts: int,
    ) -> EventEnvelope:
        self.captured.append((evt, consumer, str(error), attempts))
        return event(
            "dead_letter.created",
            consumer,
            {"original_event_id": evt.event_id, "attempts": attempts},
            evt.correlation_id,
            evt.event_id,
        )


def test_event_processor_acks_successful_handler() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-1")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore()
        dead_letters = FakeDeadLetters()
        handled: list[str] = []

        async def handler(received: EventEnvelope) -> None:
            handled.append(received.event_id)

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

        async def handler(_received: EventEnvelope) -> None:
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
        assert store.failed == [
            (evt.event_id, "command-worker", EventProcessingStatus.RETRYING)
        ]
        assert dead_letters.captured == []

    asyncio.run(run())


def test_event_processor_dead_letters_after_max_attempts() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": False}, "corr-3")
        message = FakeMessage(evt.to_dict())
        store = FakeProcessingStore(attempts=2)
        dead_letters = FakeDeadLetters()

        async def handler(_received: EventEnvelope) -> None:
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
            (
                evt.event_id,
                "command-worker",
                EventProcessingStatus.DEAD_LETTERED,
            )
        ]
        assert dead_letters.captured[0][1:] == (
            "command-worker",
            "permanent failure",
            2,
        )

    asyncio.run(run())
