from __future__ import annotations

import asyncio

from packages.runtime.operation_events import (
    DurableOperationEventBroker,
    InMemoryOperationEventBroker,
    RedisOperationEventBroker,
)


def test_operation_event_broker_fans_out_only_matching_command_events() -> None:
    async def run() -> None:
        broker = InMemoryOperationEventBroker()
        matching = await broker.subscribe("command-1")
        other = await broker.subscribe("command-2")

        published = await broker.publish(
            command_id="command-1",
            kind="progress",
            payload={"status": "running"},
        )

        assert published.command_id == "command-1"
        assert published.sequence == 1
        assert published.kind == "progress"
        assert published.payload == {"status": "running"}
        assert await matching.next() == published
        assert other.empty()
        await matching.close()
        await other.close()

    asyncio.run(run())


def test_broker_announces_an_already_staged_event_without_rewriting_its_sequence() -> None:
    from packages.contracts.parity import OperationEvent

    async def run() -> None:
        broker = InMemoryOperationEventBroker()
        subscription = await broker.subscribe("command-1", workspace_id="workspace-1")
        terminal = OperationEvent(
            command_id="command-1",
            sequence=4,
            kind="completed",
            payload={"cluster_id": "cluster-1", "status": "completed"},
        )

        await broker.announce(terminal, workspace_id="workspace-1")

        assert await subscription.next() == terminal
        await subscription.close()

    asyncio.run(run())


def test_durable_operation_events_are_persisted_before_fanout_and_stop_after_terminal() -> None:
    class Store:
        def __init__(self) -> None:
            self.events: list[tuple[str, str, str, dict[str, object]]] = []
            self.sequence = 0
            self.terminal = False

        async def append_command_operation_event(
            self,
            workspace_id: str,
            command_id: str,
            kind: str,
            payload: dict[str, object],
        ) -> object | None:
            if self.terminal:
                return None
            self.sequence += 1
            self.events.append((workspace_id, command_id, kind, payload))
            if kind in {"completed", "failed"}:
                self.terminal = True
            from packages.contracts.parity import OperationEvent

            return OperationEvent(
                command_id=command_id,
                sequence=self.sequence,
                kind=kind,
                payload=payload,
            )

    async def run() -> None:
        store = Store()
        broker = DurableOperationEventBroker(store)
        subscription = await broker.subscribe("command-1", workspace_id="workspace-1")

        running = await broker.publish(
            workspace_id="workspace-1",
            command_id="command-1",
            kind="progress",
            payload={"cluster_id": "cluster-1", "status": "running"},
        )
        completed = await broker.publish(
            workspace_id="workspace-1",
            command_id="command-1",
            kind="completed",
            payload={"cluster_id": "cluster-1", "status": "completed"},
        )
        duplicate_terminal = await broker.publish(
            workspace_id="workspace-1",
            command_id="command-1",
            kind="completed",
            payload={"cluster_id": "cluster-1", "status": "completed"},
        )

        assert store.events == [
            (
                "workspace-1",
                "command-1",
                "progress",
                {"cluster_id": "cluster-1", "status": "running"},
            ),
            (
                "workspace-1",
                "command-1",
                "completed",
                {"cluster_id": "cluster-1", "status": "completed"},
            ),
        ]
        assert running is not None
        assert completed is not None
        assert duplicate_terminal is None
        assert [await subscription.next(), await subscription.next()] == [running, completed]
        await subscription.close()

    asyncio.run(run())


def test_redis_publish_failure_keeps_committed_event_available_to_local_subscribers() -> None:
    """Redis is a wake-up transport, never the success condition of an operation event."""

    class Store:
        async def append_command_operation_event(
            self,
            _workspace_id: str,
            command_id: str,
            kind: str,
            payload: dict[str, object],
        ) -> object:
            from packages.contracts.parity import OperationEvent

            return OperationEvent(command_id=command_id, sequence=1, kind=kind, payload=payload)

    class UnavailableRedis:
        async def publish(self, *_args: object) -> None:
            raise ConnectionError("redis unavailable")

    async def run() -> None:
        broker = RedisOperationEventBroker("redis://unused", Store())
        broker._client = UnavailableRedis()  # type: ignore[assignment]
        subscription = await broker.subscribe("command-1", workspace_id="workspace-1")

        event = await broker.publish(
            workspace_id="workspace-1",
            command_id="command-1",
            kind="completed",
            payload={"cluster_id": "cluster-1", "status": "completed"},
        )

        assert event is not None
        assert await subscription.next() == event
        await subscription.close()

    asyncio.run(run())


def test_redis_broker_starts_in_db_backed_degraded_mode_when_redis_is_unavailable() -> None:
    """A Redis outage must not stop the gateway's durable operation stream."""

    class Store:
        async def append_command_operation_event(
            self,
            _workspace_id: str,
            command_id: str,
            kind: str,
            payload: dict[str, object],
        ) -> object:
            from packages.contracts.parity import OperationEvent

            return OperationEvent(command_id=command_id, sequence=1, kind=kind, payload=payload)

    class UnavailableRedis:
        async def ping(self) -> None:
            from redis.exceptions import ConnectionError as RedisConnectionError

            raise RedisConnectionError("redis unavailable")

        async def aclose(self) -> None:
            return None

    async def run() -> None:
        broker = RedisOperationEventBroker(
            "redis://unused", Store(), redis_factory=lambda _url: UnavailableRedis()
        )

        await broker.start()
        subscription = await broker.subscribe("command-1", workspace_id="workspace-1")
        event = await broker.publish(
            workspace_id="workspace-1",
            command_id="command-1",
            kind="progress",
            payload={"cluster_id": "cluster-1", "status": "running"},
        )

        assert broker._client is None
        assert event is not None
        assert await subscription.next() == event
        await subscription.close()
        await broker.close()

    asyncio.run(run())


def test_redis_broker_reconnects_after_starting_in_degraded_mode(monkeypatch) -> None:
    import packages.runtime.operation_events as operation_events

    class Store:
        async def append_command_operation_event(self, *_args: object, **_kwargs: object) -> None:
            return None

    class PubSub:
        async def psubscribe(self, *_channels: str) -> None:
            return None

        async def listen(self):
            while True:
                await asyncio.sleep(3600)
                yield None

        async def aclose(self) -> None:
            return None

    class Redis:
        def __init__(self, *, available: bool) -> None:
            self.available = available

        async def ping(self) -> None:
            if not self.available:
                raise ConnectionError("redis unavailable")

        def pubsub(self, **_kwargs: object) -> PubSub:
            return PubSub()

        async def aclose(self) -> None:
            return None

    attempts: list[Redis] = []

    def factory(_url: str) -> Redis:
        client = Redis(available=bool(attempts))
        attempts.append(client)
        return client

    monkeypatch.setattr(operation_events, "OPERATION_EVENT_RECONNECT_INITIAL_SECONDS", 0)
    monkeypatch.setattr(operation_events, "OPERATION_EVENT_RECONNECT_MAX_SECONDS", 0)

    async def run() -> None:
        broker = RedisOperationEventBroker("redis://unused", Store(), redis_factory=factory)
        await broker.start()

        for _ in range(10):
            if broker._client is not None:
                break
            await asyncio.sleep(0)

        assert len(attempts) >= 2
        assert broker._client is attempts[-1]
        await broker.close()

    asyncio.run(run())
