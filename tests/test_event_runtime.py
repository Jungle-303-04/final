from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest

from packages.contracts.event_bus.interfaces import EventConsumerMetrics, EventEnvelope
from packages.contracts.event_bus.processing import CLAIM_BLOCKED, EventProcessingStatus
from packages.contracts.interfaces import EventProcessingRecord
from packages.events.envelope import event
from packages.runtime import worker
from packages.runtime.worker import (
    EventHandlerSpec,
    EventProcessor,
    EventRetryPolicy,
    WorkerRuntime,
    record_consumer_lag_metrics,
)


class StubMessage:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.data = json.dumps(payload).encode()
        self.acked = False
        self.nak_delay: int | None = None

    @classmethod
    def raw(cls, data: bytes) -> StubMessage:
        message = cls({})
        message.data = data
        return message

    async def ack(self) -> None:
        self.acked = True

    async def nak(self, delay: int = 0) -> None:
        self.nak_delay = delay


class StubProcessingStore:
    def __init__(self, attempts: int = 1, status: str = EventProcessingStatus.PROCESSING) -> None:
        self.attempts = attempts
        self.status = status
        self.recorded: list[EventEnvelope] = []
        self.finished: list[tuple[str, str]] = []
        self.finish_durations: list[int | None] = []
        self.failed: list[tuple[str, str, str]] = []
        self.failure_durations: list[int | None] = []
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

    def finish_event_processing(
        self, evt: EventEnvelope, consumer: str, duration_ms: int | None = None
    ) -> None:
        self.finished.append((evt.event_id, consumer))
        self.finish_durations.append(duration_ms)

    def fail_event_processing(
        self,
        evt: EventEnvelope,
        consumer: str,
        error: str,
        status: str,
        duration_ms: int | None = None,
    ) -> None:
        self.failed.append((evt.event_id, consumer, status))
        self.failure_durations.append(duration_ms)


class StatefulProcessingStore(StubProcessingStore):
    def finish_event_processing(
        self, evt: EventEnvelope, consumer: str, duration_ms: int | None = None
    ) -> None:
        super().finish_event_processing(evt, consumer, duration_ms)
        self.status = EventProcessingStatus.PROCESSED

    def fail_event_processing(
        self,
        evt: EventEnvelope,
        consumer: str,
        error: str,
        status: str,
        duration_ms: int | None = None,
    ) -> None:
        super().fail_event_processing(evt, consumer, error, status, duration_ms)
        self.status = status


class StubDeadLetters:
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
        message = StubMessage(evt.to_dict())
        store = StubProcessingStore()
        dead_letters = StubDeadLetters()
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
        assert isinstance(store.finish_durations[0], int)
        assert dead_letters.captured == []

    asyncio.run(run())


def test_post_commit_ack_failure_preserves_terminal_ledger_for_redelivery() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-ack-failure")

        class AckFailingMessage(StubMessage):
            async def ack(self) -> None:
                raise RuntimeError("ack unavailable")

        first_delivery = AckFailingMessage(evt.to_dict())
        store = StatefulProcessingStore()
        dead_letters = StubDeadLetters()
        handled: list[str] = []

        async def handler(received: EventEnvelope) -> list[EventEnvelope]:
            handled.append(received.event_id)
            return []

        policy = EventRetryPolicy(max_attempts=2, retry_delay_seconds=7)
        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            dead_letters,  # type: ignore[arg-type]
            policy,
        )

        with pytest.raises(RuntimeError, match="ack unavailable"):
            await processor.process(first_delivery)

        # WorkerRuntime catches the propagated error and requests redelivery.
        await first_delivery.nak(delay=policy.retry_delay_seconds)
        redelivery = StubMessage(evt.to_dict())
        await processor.process(redelivery)

        assert first_delivery.nak_delay == 7
        assert redelivery.acked is True
        assert handled == [evt.event_id]
        assert store.status == EventProcessingStatus.PROCESSED
        assert store.finished == [(evt.event_id, "command-worker")]
        assert store.failed == []
        assert dead_letters.captured == []

    asyncio.run(run())


def test_worker_runtime_naks_propagated_processor_error(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    async def run() -> None:
        signal_handlers: dict[int, Any] = {}

        class RuntimeMessage:
            def __init__(self) -> None:
                self.data = b"{}"
                self.nak_delay: int | None = None

            async def nak(self, delay: int = 0) -> None:
                self.nak_delay = delay
                signal_handlers[worker.signal.SIGTERM]()

        message = RuntimeMessage()

        class Subscription:
            async def fetch(self, batch: int, timeout: float) -> list[RuntimeMessage]:
                return [message]

        class Bus:
            async def connect(self) -> None:
                return None

            async def subscribe(self, subject: str, durable: str) -> Subscription:
                return Subscription()

            async def close(self) -> None:
                return None

        class Db:
            def dispose(self) -> None:
                return None

        class Relay:
            def __init__(self, *_args: Any) -> None:
                pass

            async def run_once(self) -> int:
                return 0

        class FailingProcessor:
            def __init__(self, *_args: Any) -> None:
                pass

            async def process(self, _message: RuntimeMessage) -> None:
                raise RuntimeError("post-commit ack unavailable")

        async def wait_for_database(_db: Any) -> None:
            return None

        async def handler(_event: EventEnvelope) -> list[EventEnvelope]:
            return []

        from packages.storage import database

        monkeypatch.setattr(database, "wait_for_database", wait_for_database)
        monkeypatch.setattr(worker, "EventProcessor", FailingProcessor)
        monkeypatch.setattr(worker, "OutboxRelay", Relay)
        monkeypatch.setattr(worker, "HEARTBEAT_PATH", str(tmp_path / "heartbeat"))
        monkeypatch.setattr(
            worker.signal,
            "signal",
            lambda signum, callback: signal_handlers.__setitem__(signum, callback),
        )
        spec = EventHandlerSpec(
            service_name="command-worker",
            subjects=("command.requested",),
            handler_factory=lambda _events, _db: handler,
            retry_policy=EventRetryPolicy(retry_delay_seconds=7, idle_sleep_seconds=0),
        )

        await WorkerRuntime(spec, bus=Bus(), db=Db()).run()  # type: ignore[arg-type]

        assert message.nak_delay == 7

    asyncio.run(run())


def test_event_processor_naks_retryable_failure() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": False}, "corr-2")
        message = StubMessage(evt.to_dict())
        store = StubProcessingStore(attempts=1)
        dead_letters = StubDeadLetters()

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
        assert isinstance(store.failure_durations[0], int)
        assert dead_letters.captured == []

    asyncio.run(run())


def test_event_processor_dead_letters_after_max_attempts() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": False}, "corr-3")
        message = StubMessage(evt.to_dict())
        store = StubProcessingStore(attempts=2)
        dead_letters = StubDeadLetters()

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
        assert isinstance(store.failure_durations[0], int)
        assert dead_letters.captured[0][1:] == ("command-worker", "permanent failure", 2)

    asyncio.run(run())


def test_event_processor_skips_terminal_duplicate_with_ack() -> None:
    async def run() -> None:
        evt = event("command.requested", "test", {"ok": True}, "corr-4")
        message = StubMessage(evt.to_dict())
        store = StubProcessingStore(status=EventProcessingStatus.PROCESSED)
        dead_letters = StubDeadLetters()

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
        message = StubMessage(evt.to_dict())
        store = StubProcessingStore(status=CLAIM_BLOCKED)
        dead_letters = StubDeadLetters()

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
        message = StubMessage.raw(b"{not-json")
        store = StubProcessingStore()
        dead_letters = StubDeadLetters()

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


def test_event_processor_naks_when_raw_dead_letter_storage_fails() -> None:
    async def run() -> None:
        message = StubMessage.raw(b"{not-json")
        store = StubProcessingStore()

        class FailingDeadLetters(StubDeadLetters):
            async def capture_raw(
                self, raw: bytes, consumer: str, error: Exception
            ) -> EventEnvelope:
                raise RuntimeError("dead letter database unavailable")

        async def handler(_received: EventEnvelope) -> list[EventEnvelope]:
            raise AssertionError("handler must not run for malformed payload")

        processor = EventProcessor(
            "command-worker",
            handler,
            store,  # type: ignore[arg-type]
            FailingDeadLetters(),
            EventRetryPolicy(max_attempts=2, retry_delay_seconds=7),
        )

        await processor.process(message)

        assert message.acked is False
        assert message.nak_delay == 7
        assert store.recorded == []

    asyncio.run(run())


def test_record_consumer_lag_metrics_records_subject_durable_samples() -> None:
    async def run() -> None:
        class MetricsBus:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str]] = []

            async def consumer_metrics(self, subject: str, durable: str) -> EventConsumerMetrics:
                self.calls.append((subject, durable))
                return EventConsumerMetrics(
                    stream="SERVICE_EVENTS",
                    subject=subject,
                    durable=durable,
                    pending=5,
                    ack_pending=1,
                    redelivered=0,
                )

        class MetricsStore:
            def __init__(self) -> None:
                self.samples: list[EventConsumerMetrics] = []

            def record_event_consumer_metrics(self, sample: EventConsumerMetrics) -> None:
                self.samples.append(sample)

        async def handler(_evt: EventEnvelope) -> list[EventEnvelope]:
            return []

        bus = MetricsBus()
        store = MetricsStore()
        spec = EventHandlerSpec(
            service_name="workflow-controller",
            subjects=("workflow.run.started", "workflow.run.completed"),
            handler_factory=lambda _events, _db: handler,
        )

        await record_consumer_lag_metrics(bus, store, spec)  # type: ignore[arg-type]

        assert bus.calls == [
            (
                "workflow.run.started",
                "workflow-controller-workflow-run-started",
            ),
            (
                "workflow.run.completed",
                "workflow-controller-workflow-run-completed",
            ),
        ]
        assert [sample.pending for sample in store.samples] == [5, 5]

    asyncio.run(run())
