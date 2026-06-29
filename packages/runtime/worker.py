from __future__ import annotations

import asyncio
import json
import signal
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from packages.config.logs import get_logger
from packages.contracts.event_bus.interfaces import (
    EventClient,
    EventConsumerBus,
    EventEnvelope,
    EventHandler,
    EventMessage,
)
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.event_bus.subscriptions import durable_name
from packages.contracts.interfaces import EventProcessingStore
from packages.events.bus import (
    DeadLetterSink,
    NatsEventBus,
    RecordedEventClient,
    event_causation,
    event_context,
)
from packages.runtime.ledger import Ledger
from packages.runtime.relay import OutboxRelay

if TYPE_CHECKING:
    from packages.storage.database import Database

logger = get_logger("worker")

DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_RETRY_DELAY_SECONDS = 2
DEFAULT_FETCH_BATCH_SIZE = 1
DEFAULT_FETCH_TIMEOUT_SECONDS = 1
HEARTBEAT_PATH = "/tmp/heartbeat"  # liveness exec probe 가 mtime 신선도 검사


@dataclass(frozen=True)
class EventRetryPolicy:
    max_attempts: int = DEFAULT_MAX_ATTEMPTS
    retry_delay_seconds: int = DEFAULT_RETRY_DELAY_SECONDS
    fetch_batch_size: int = DEFAULT_FETCH_BATCH_SIZE
    fetch_timeout_seconds: int = DEFAULT_FETCH_TIMEOUT_SECONDS


@dataclass(frozen=True)
class EventHandlerSpec:
    service_name: str
    subjects: tuple[str, ...]
    handler_factory: Callable[[EventClient, Database], EventHandler]
    durable_name: str | None = None
    retry_policy: EventRetryPolicy = EventRetryPolicy()

    @property
    def durable(self) -> str:
        return durable_name(self.service_name, self.durable_name)

    def durable_for(self, subject: str) -> str:
        """subject 여러 개면 컨슈머 이름 충돌 방지 위해 subject 로 namespace."""
        if len(self.subjects) <= 1:
            return self.durable
        slug = subject.replace(".", "-").replace(">", "all").replace("*", "any")
        return f"{self.durable}-{slug}"


class Codec(Protocol):
    def decode(self, message: EventMessage) -> EventEnvelope: ...


class JsonCodec:
    def decode(self, message: EventMessage) -> EventEnvelope:
        return EventEnvelope.from_mapping(json.loads(message.data.decode()))


class DeadLetterPort(Protocol):
    async def capture(
        self, evt: EventEnvelope, consumer: str, error: Exception, attempts: int
    ) -> EventEnvelope: ...

    async def capture_raw(self, raw: bytes, consumer: str, error: Exception) -> EventEnvelope: ...


class EventProcessor:
    def __init__(
        self,
        service_name: str,
        handler: EventHandler,
        store: EventProcessingStore,
        dead_letters: DeadLetterPort,
        retry_policy: EventRetryPolicy,
        codec: Codec | None = None,
        ledger: Ledger | None = None,
    ) -> None:
        self.service_name = service_name
        self.handler = handler
        self.store = store
        self.dead_letters = dead_letters
        self.retry_policy = retry_policy
        self.codec = codec if codec is not None else JsonCodec()
        self.ledger = ledger if ledger is not None else Ledger(store, service_name)

    async def process(self, message: EventMessage) -> None:
        try:
            evt = self.codec.decode(message)
        except Exception as exc:
            await self.dead_letters.capture_raw(message.data, self.service_name, exc)
            logger.error(
                "decode_dead_letter",
                extra={"context": {"consumer": self.service_name}},
                exc_info=exc,
            )
            await message.ack()
            return
        attempts = 0
        try:
            # 업무쓰기 + outbox 적재 + ledger 완료를 한 트랜잭션으로(원자성).
            with self.store.unit_of_work() as conn:
                processing = self.ledger.begin(evt)
                if processing.status != EventProcessingStatus.PROCESSING:
                    await message.ack()  # 이미 처리됨(중복) → skip
                    return
                attempts = processing.attempts
                context = {**event_context(evt), "consumer": self.service_name}
                logger.info("handling", extra={"context": context})
                with event_causation(evt.event_id):
                    outbox_events = await self.handler(evt)
                self.store.stage_events(conn, outbox_events)
                self.ledger.finish(evt)
            await message.ack()
        except Exception as exc:
            await self.fail(message, evt, exc, attempts)

    async def fail(
        self, message: EventMessage, evt: EventEnvelope, error: Exception, attempts: int
    ) -> None:
        context = {**event_context(evt), "consumer": self.service_name, "attempts": attempts}
        if attempts >= self.retry_policy.max_attempts:
            self.ledger.dead_letter(evt, error)
            await self.dead_letters.capture(evt, self.service_name, error, attempts)
            logger.error("dead_letter", extra={"context": context}, exc_info=error)
            await message.ack()
            return

        self.ledger.retry(evt, error)
        logger.warning("retry", extra={"context": context}, exc_info=error)
        await message.nak(delay=self.retry_policy.retry_delay_seconds)


class WorkerRuntime:
    def __init__(
        self,
        spec: EventHandlerSpec,
        bus: EventConsumerBus | None = None,
        db: Database | None = None,
    ) -> None:
        self.spec = spec
        if db is None:
            from packages.storage.database import Database

            db = Database()
        self.bus = bus if bus is not None else NatsEventBus()
        self.db = db

    async def run(self) -> None:
        from packages.storage.database import wait_for_database

        Path(HEARTBEAT_PATH).touch()  # 시작 즉시 생존 표시(DB 대기 중 liveness 오살 방지)
        await wait_for_database(self.db)
        await self.bus.connect()
        # subject 마다 별도 컨슈머(줄) — 한 줄이 막혀도 다른 subject 는 계속 흐름.
        subs = [
            (subject, await self.bus.subscribe(subject, durable=self.spec.durable_for(subject)))
            for subject in self.spec.subjects
        ]
        events = RecordedEventClient(self.bus, self.db)
        handler = self.spec.handler_factory(events, self.db)
        processor = EventProcessor(
            self.spec.service_name,
            handler,
            self.db,
            DeadLetterSink(events, self.db, self.spec.service_name),
            self.spec.retry_policy,
        )
        relay = OutboxRelay(self.db, self.bus, self.spec.service_name)
        stopping = asyncio.Event()
        signal.signal(signal.SIGTERM, lambda *_: stopping.set())
        signal.signal(signal.SIGINT, lambda *_: stopping.set())
        lifecycle = {"consumer": self.spec.service_name, "subjects": list(self.spec.subjects)}
        logger.info("subscribed", extra={"context": lifecycle})

        while not stopping.is_set():
            Path(HEARTBEAT_PATH).touch()  # liveness 하트비트(루프 생존 신호)
            try:
                await relay.run_once()  # outbox → NATS 발행
            except Exception as exc:
                logger.warning("relay_error", extra={"context": lifecycle}, exc_info=exc)
            for _subject, sub in subs:
                try:
                    messages = await sub.fetch(
                        self.spec.retry_policy.fetch_batch_size,
                        timeout=self.spec.retry_policy.fetch_timeout_seconds,
                    )
                except TimeoutError:
                    continue
                except Exception as exc:
                    logger.warning("fetch_error", extra={"context": lifecycle}, exc_info=exc)
                    await asyncio.sleep(1)
                    continue

                for message in messages:
                    try:
                        await processor.process(message)
                    except Exception as exc:
                        logger.error(
                            "processor_error", extra={"context": lifecycle}, exc_info=exc
                        )
                        await message.nak(delay=self.spec.retry_policy.retry_delay_seconds)

        await self.bus.close()
        dispose_async = getattr(self.db, "dispose_async", None)
        if dispose_async is not None:
            await dispose_async()
        dispose = getattr(self.db, "dispose", None)
        if dispose is not None:
            dispose()
