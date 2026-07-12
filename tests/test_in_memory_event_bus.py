from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

import pytest
from packages.events.in_memory import InMemoryEventBus

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.events.bus import NatsEventBus
from packages.events.envelope import event
from packages.runtime.app import App
from packages.runtime.service import WorkerService
from packages.runtime.worker import EventHandlerSpec, WorkerRuntime


async def empty_handler(_evt: EventEnvelope) -> list[EventEnvelope]:
    return []


def handler_factory(_events: Any, _db: Any) -> Callable[..., Any]:
    return empty_handler


def test_in_memory_bus_replays_backlog_in_order_and_acks_messages() -> None:
    async def run() -> None:
        bus = InMemoryEventBus()
        await bus.connect()
        emitted = await bus.emit(
            "command.requested",
            "api-gateway",
            {"command": "restart"},
            correlation_id="corr-memory",
        )
        relayed = event(
            "command.requested",
            "outbox-relay",
            {"command": "scale"},
            correlation_id="corr-relay",
        )
        assert await bus.publish_envelope(relayed) is relayed

        subscription = await bus.subscribe("command.requested", durable="command-worker")
        messages = await subscription.fetch(batch=2, timeout=0.1)

        assert [json.loads(message.data) for message in messages] == [
            emitted.to_dict(),
            relayed.to_dict(),
        ]
        metrics = await bus.consumer_metrics("command.requested", "command-worker")
        assert (metrics.pending, metrics.ack_pending, metrics.redelivered) == (0, 2, 0)

        for message in messages:
            await message.ack()

        metrics = await bus.consumer_metrics("command.requested", "command-worker")
        assert (metrics.pending, metrics.ack_pending, metrics.redelivered) == (0, 0, 0)
        with pytest.raises(TimeoutError):
            await subscription.fetch(batch=1, timeout=0.01)
        await bus.close()

    asyncio.run(run())


def test_in_memory_bus_nak_redelivers_the_same_message() -> None:
    async def run() -> None:
        bus = InMemoryEventBus()
        await bus.connect()
        subscription = await bus.subscribe("command.*", durable="command-worker")
        emitted = await bus.emit(
            "command.requested",
            "api-gateway",
            {"command": "restart"},
            correlation_id="corr-redelivery",
        )

        first = (await subscription.fetch(batch=1, timeout=0.1))[0]
        await first.nak()
        redelivered = (await subscription.fetch(batch=1, timeout=0.1))[0]

        assert json.loads(redelivered.data) == emitted.to_dict()
        metrics = await bus.consumer_metrics("command.*", "command-worker")
        assert (metrics.pending, metrics.ack_pending, metrics.redelivered) == (0, 1, 1)
        await redelivered.ack()
        await bus.close()

    asyncio.run(run())


def test_in_memory_bus_fans_out_to_matching_durable_subscriptions_only() -> None:
    async def run() -> None:
        bus = InMemoryEventBus()
        await bus.connect()
        exact = await bus.subscribe("command.requested", durable="command-worker")
        all_events = await bus.subscribe(">", durable="audit-worker")
        unrelated = await bus.subscribe("git.changed", durable="git-worker")

        emitted = await bus.emit(
            "command.requested",
            "api-gateway",
            {"command": "restart"},
            correlation_id="corr-fanout",
        )

        exact_message = (await exact.fetch(batch=1, timeout=0.1))[0]
        audit_message = (await all_events.fetch(batch=1, timeout=0.1))[0]
        assert json.loads(exact_message.data) == emitted.to_dict()
        assert json.loads(audit_message.data) == emitted.to_dict()
        with pytest.raises(TimeoutError):
            await unrelated.fetch(batch=1, timeout=0.01)

        await exact_message.ack()
        await audit_message.ack()
        await bus.close()

    asyncio.run(run())


def test_app_run_forwards_optional_bus_to_worker_service(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from packages.runtime import service as runtime_service

    captured: dict[str, Any] = {}

    class SpyWorkerService:
        def __init__(
            self,
            service_name: str,
            subjects: tuple[str, ...],
            factory: Callable[..., Any],
            durable_name: str | None = None,
            bus: Any | None = None,
        ) -> None:
            captured.update(
                service_name=service_name,
                subjects=subjects,
                factory=factory,
                durable_name=durable_name,
                bus=bus,
            )

        def run(self) -> None:
            captured["ran"] = True

    monkeypatch.setattr(runtime_service, "WorkerService", SpyWorkerService)
    bus = InMemoryEventBus()
    app = App("in-memory-worker")

    @app.on_any
    async def handle(_evt: EventEnvelope) -> None:
        return None

    app.run(bus=bus)

    assert captured["service_name"] == "in-memory-worker"
    assert captured["subjects"] == (">",)
    assert captured["bus"] is bus
    assert captured["ran"] is True


def test_worker_service_injects_bus_and_keeps_nats_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from packages.runtime import service as runtime_service

    injected: list[Any | None] = []

    class SpyWorkerRuntime:
        def __init__(self, _spec: EventHandlerSpec, bus: Any | None = None) -> None:
            injected.append(bus)

        async def run(self) -> None:
            return None

    monkeypatch.setattr(runtime_service, "WorkerRuntime", SpyWorkerRuntime)
    memory_bus = InMemoryEventBus()

    asyncio.run(
        WorkerService(
            "in-memory-worker",
            ("command.requested",),
            handler_factory,
            bus=memory_bus,
        ).serve()
    )
    asyncio.run(
        WorkerService(
            "nats-worker",
            ("command.requested",),
            handler_factory,
        ).serve()
    )

    assert injected == [memory_bus, None]

    spec = EventHandlerSpec(
        service_name="nats-worker",
        subjects=("command.requested",),
        handler_factory=handler_factory,
    )
    assert isinstance(WorkerRuntime(spec, db=object()).bus, NatsEventBus)  # type: ignore[arg-type]
