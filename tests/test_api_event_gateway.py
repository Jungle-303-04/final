from __future__ import annotations

import asyncio
import logging
from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

from sqlalchemy.exc import OperationalError

from domains.target.events import AgentConnectedBody
from packages.contracts.auth import Actor
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
from packages.events.bus import NATS_MSG_ID_HEADER, NatsEventBus, consumer_config
from packages.events.envelope import event
from packages.runtime.gateway import ApiEventGateway


class MemoryPublisher:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, object],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        evt = event(subject, source, payload, correlation_id, causation_id)
        self.events.append(evt)
        return evt


class MemoryRecorder:
    def __init__(self) -> None:
        self.events: list[EventEnvelope] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.events.append(evt)


class DurableRecorder(MemoryRecorder):
    def __init__(self) -> None:
        super().__init__()
        self.staged: list[EventEnvelope] = []

    @contextmanager
    def unit_of_work(self):
        yield object()

    def stage_events(self, _conn: Any, events: list[EventEnvelope]) -> None:
        self.staged.extend(events)


def test_api_event_gateway_stages_lifecycle_hook_in_the_same_outbox_unit_of_work() -> None:
    class LifecycleRecorder(DurableRecorder):
        def __init__(self) -> None:
            super().__init__()
            self.order: list[str] = []
            self.active = False

        @contextmanager
        def unit_of_work(self):
            self.active = True
            self.order.append("begin")
            try:
                yield self
            finally:
                self.order.append("end")
                self.active = False

        def record_event(self, evt: EventEnvelope) -> None:
            assert self.active is True
            self.order.append("record")
            super().record_event(evt)

        def stage_events(self, conn: Any, events: list[EventEnvelope]) -> None:
            assert conn is self and self.active is True
            self.order.append("outbox")
            super().stage_events(conn, events)

    async def run() -> None:
        recorder = LifecycleRecorder()
        gateway = ApiEventGateway(MemoryPublisher(), recorder, "api-gateway")

        accepted = await gateway.accept_body(
            AgentConnectedBody(cluster_id="c1", agent_id="a1"),
            transactional_stage=lambda conn, evt: assert_lifecycle_stage(recorder, conn, evt),
        )

        assert recorder.events == [accepted.event]
        assert recorder.staged == [accepted.event]
        assert recorder.order == ["begin", "record", "outbox", "lifecycle", "end"]

    asyncio.run(run())


def assert_lifecycle_stage(recorder: DurableRecorder, conn: Any, _evt: EventEnvelope) -> None:
    assert conn is recorder
    assert getattr(recorder, "active", False) is True
    recorder.order.append("lifecycle")  # type: ignore[attr-defined]


class LockTimeoutOrig(Exception):
    sqlstate = "55P03"


def test_api_event_gateway_attaches_actor_and_records_event() -> None:
    async def run() -> None:
        publisher = MemoryPublisher()
        recorder = MemoryRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")
        actor = Actor("user-1", roles=("operator",))

        accepted = await gateway.accept(
            EventSubject.COMMAND_REQUESTED, {"action": "rollout_restart"}, actor=actor
        )

        assert accepted.response()["accepted"] is True
        assert publisher.events == [accepted.event]
        assert recorder.events == [accepted.event]
        assert accepted.event.payload["requested_by"] == "user-1"
        assert accepted.event.payload["actor"] == actor.to_body()

    asyncio.run(run())


def test_api_event_gateway_logs_accepted_event_context(caplog) -> None:
    async def run() -> None:
        publisher = MemoryPublisher()
        recorder = MemoryRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")
        actor = Actor("user-1", roles=("operator",))

        await gateway.accept(
            EventSubject.COMMAND_REQUESTED,
            {"action": "rollout_restart"},
            correlation_id="corr-request",
            actor=actor,
        )

    caplog.set_level(logging.INFO)
    asyncio.run(run())

    accepted = [
        record.context
        for record in caplog.records
        if record.getMessage() == "gateway_event_accepted"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert len(accepted) == 1
    context = accepted[0]
    assert context["subject"] == EventSubject.COMMAND_REQUESTED
    assert context["source"] == "api-gateway"
    assert context["correlation_id"] == "corr-request"
    assert context["actor_user_id"] == "user-1"
    assert context["requested_by"] == "user-1"
    assert context["durable_outbox"] is False


def test_api_event_gateway_stages_supported_recorder_without_direct_publish() -> None:
    async def run() -> None:
        publisher = MemoryPublisher()
        recorder = DurableRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")

        accepted = await gateway.accept_body(AgentConnectedBody(cluster_id="c1", agent_id="a1"))

        assert publisher.events == []
        assert recorder.events == [accepted.event]
        assert recorder.staged == [accepted.event]

    asyncio.run(run())


def test_api_event_gateway_retries_transient_outbox_lock() -> None:
    class FlakyDurableRecorder(DurableRecorder):
        def __init__(self) -> None:
            super().__init__()
            self.stage_attempts = 0

        def stage_events(self, _conn: Any, events: list[EventEnvelope]) -> None:
            self.stage_attempts += 1
            if self.stage_attempts == 1:
                raise OperationalError("update", {}, LockTimeoutOrig())
            super().stage_events(_conn, events)

    async def run() -> FlakyDurableRecorder:
        publisher = MemoryPublisher()
        recorder = FlakyDurableRecorder()
        gateway = ApiEventGateway(publisher, recorder, "api-gateway")

        accepted = await gateway.accept_body(AgentConnectedBody(cluster_id="c1", agent_id="a1"))

        assert publisher.events == []
        assert recorder.staged == [accepted.event]
        return recorder

    recorder = asyncio.run(run())
    assert recorder.stage_attempts == 2


def test_nats_publish_uses_event_id_as_message_id_header() -> None:
    async def run() -> None:
        class StubJetStream:
            def __init__(self) -> None:
                self.published: list[dict[str, object]] = []

            async def publish(
                self,
                subject: str,
                payload: bytes,
                headers: dict[str, object] | None = None,
            ) -> None:
                self.published.append(
                    {"subject": subject, "payload": payload, "headers": headers or {}}
                )

        bus = NatsEventBus()
        stub_js = StubJetStream()
        bus.js = stub_js
        evt = event("cluster.evidence.received", "api-gateway", {}, "corr-1")

        await bus.publish_envelope(evt)

        assert stub_js.published[0]["headers"][NATS_MSG_ID_HEADER] == evt.event_id

    asyncio.run(run())


def test_consumer_config_delegates_redelivery_limit_to_application_ledger(monkeypatch) -> None:
    # ack_wait > 핸들러 타임아웃(30s) → 처리 중 재배달 중복 방지,
    # JetStream 전달 횟수는 무제한이고 application ledger가 재시도/DLQ를 종결한다.
    monkeypatch.delenv("NATS_ACK_WAIT_SECONDS", raising=False)
    monkeypatch.delenv("NATS_MAX_DELIVER", raising=False)
    monkeypatch.delenv("NATS_MAX_ACK_PENDING", raising=False)
    monkeypatch.delenv("NATS_DELIVER_POLICY", raising=False)

    config = consumer_config()

    assert config.ack_wait == 60
    assert config.max_deliver == -1
    assert config.max_ack_pending == 100
    assert config.deliver_policy.value == "all"


def test_consumer_config_reads_env_overrides(monkeypatch) -> None:
    monkeypatch.setenv("NATS_ACK_WAIT_SECONDS", "120")
    monkeypatch.setenv("NATS_MAX_DELIVER", "6")
    monkeypatch.setenv("NATS_MAX_ACK_PENDING", "50")
    monkeypatch.setenv("NATS_DELIVER_POLICY", "new")

    config = consumer_config()

    assert config.ack_wait == 120
    assert config.max_deliver == 6
    assert config.max_ack_pending == 50
    assert config.deliver_policy.value == "new"


def test_subscribe_applies_consumer_config_to_pull_consumer() -> None:
    async def run() -> None:
        class StubJetStream:
            def __init__(self) -> None:
                self.calls: list[dict[str, object]] = []

            async def pull_subscribe(
                self,
                subject: str,
                durable: str,
                stream: str,
                config: object | None = None,
            ) -> object:
                self.calls.append(
                    {"subject": subject, "durable": durable, "stream": stream, "config": config}
                )
                return object()

        bus = NatsEventBus()
        stub_js = StubJetStream()
        bus.js = stub_js

        await bus.subscribe("command.requested", durable="command-worker")

        call = stub_js.calls[0]
        assert call["subject"] == "command.requested"
        assert call["durable"] == "command-worker"
        config = call["config"]
        assert config is not None
        assert config.ack_wait == 60
        assert config.max_deliver == -1
        assert config.max_ack_pending == 100

    asyncio.run(run())


def test_nats_consumer_metrics_reads_jetstream_consumer_info() -> None:
    async def run() -> None:
        class StubJetStream:
            def __init__(self) -> None:
                self.calls: list[tuple[str, str]] = []

            async def consumer_info(self, stream: str, durable: str) -> object:
                self.calls.append((stream, durable))
                return SimpleNamespace(
                    num_pending=7,
                    num_ack_pending=2,
                    num_redelivered=1,
                )

        bus = NatsEventBus()
        stub_js = StubJetStream()
        bus.js = stub_js

        sample = await bus.consumer_metrics("command.requested", "command-worker")

        assert stub_js.calls == [("SERVICE_EVENTS", "command-worker")]
        assert sample.subject == "command.requested"
        assert sample.durable == "command-worker"
        assert sample.pending == 7
        assert sample.ack_pending == 2
        assert sample.redelivered == 1

    asyncio.run(run())
