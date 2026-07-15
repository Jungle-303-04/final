"""Realtime command-operation fan-out with a Redis-backed production broker.

The browser stream is never synthesized from polling. Every command state
transition publishes an immutable OperationEvent; Redis Pub/Sub forwards it
to all gateway replicas and each replica fans it out through bounded,
per-command subscriptions.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any, Protocol

from redis.asyncio import Redis as AsyncRedis

from packages.contracts.parity import OperationEvent, OperationEventKind

OPERATION_EVENT_CHANNEL_PREFIX = "opsia:operation-events:"
OPERATION_EVENT_SEQUENCE_PREFIX = "opsia:operation-event-sequence:"
OPERATION_EVENT_QUEUE_MAX = 64
RedisFactory = Callable[[str], AsyncRedis]


class OperationEventSubscription:
    """One bounded browser subscription. Slow clients retain the latest event."""

    def __init__(
        self,
        command_id: str,
        queue: asyncio.Queue[OperationEvent],
        close: Callable[[], Awaitable[None]],
    ) -> None:
        self.command_id = command_id
        self._queue = queue
        self._close = close
        self._closed = False

    async def next(self) -> OperationEvent:
        return await self._queue.get()

    def empty(self) -> bool:
        return self._queue.empty()

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        await self._close()


class OperationEventBroker(Protocol):
    async def start(self) -> None: ...

    async def close(self) -> None: ...

    async def subscribe(self, command_id: str) -> OperationEventSubscription: ...

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent: ...


class InMemoryOperationEventBroker:
    """Deterministic test/local broker with the same bounded fan-out behavior."""

    def __init__(self) -> None:
        self._sequences: dict[str, int] = defaultdict(int)
        self._subscriptions: dict[str, set[asyncio.Queue[OperationEvent]]] = defaultdict(set)

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        self._subscriptions.clear()

    async def subscribe(self, command_id: str) -> OperationEventSubscription:
        queue: asyncio.Queue[OperationEvent] = asyncio.Queue(maxsize=OPERATION_EVENT_QUEUE_MAX)
        self._subscriptions[command_id].add(queue)

        async def close() -> None:
            subscribers = self._subscriptions.get(command_id)
            if subscribers is None:
                return
            subscribers.discard(queue)
            if not subscribers:
                self._subscriptions.pop(command_id, None)

        return OperationEventSubscription(command_id, queue, close)

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent:
        self._sequences[command_id] += 1
        event = OperationEvent(
            command_id=command_id,
            sequence=self._sequences[command_id],
            kind=kind,
            payload=payload,
        )
        await self.deliver(event)
        return event

    async def deliver(self, event: OperationEvent) -> None:
        for queue in tuple(self._subscriptions.get(event.command_id, ())):
            _offer(queue, event)


class RedisOperationEventBroker:
    """Cross-replica operation-event broker with Redis sequence authority."""

    def __init__(self, redis_url: str, *, redis_factory: RedisFactory | None = None) -> None:
        self._redis_url = redis_url
        self._redis_factory = redis_factory or _redis_client
        self._client: AsyncRedis | None = None
        self._pubsub: Any | None = None
        self._listener: asyncio.Task[None] | None = None
        self._local = InMemoryOperationEventBroker()

    async def start(self) -> None:
        if self._client is not None:
            return
        client = self._redis_factory(self._redis_url)
        await client.ping()
        pubsub = client.pubsub(ignore_subscribe_messages=True)
        await pubsub.psubscribe(f"{OPERATION_EVENT_CHANNEL_PREFIX}*")
        self._client = client
        self._pubsub = pubsub
        await self._local.start()
        self._listener = asyncio.create_task(self._listen(), name="operation-event-redis-listener")

    async def close(self) -> None:
        if self._listener is not None:
            self._listener.cancel()
            with suppress(asyncio.CancelledError):
                await self._listener
            self._listener = None
        pubsub = self._pubsub
        self._pubsub = None
        if pubsub is not None:
            await pubsub.aclose()
        client = self._client
        self._client = None
        if client is not None:
            await client.aclose()
        await self._local.close()

    async def subscribe(self, command_id: str) -> OperationEventSubscription:
        return await self._local.subscribe(command_id)

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent:
        client = self._require_client()
        sequence = int(await client.incr(_sequence_key(command_id)))
        event = OperationEvent(
            command_id=command_id,
            sequence=sequence,
            kind=kind,
            payload=payload,
        )
        await client.publish(_channel(command_id), event.model_dump_json())
        return event

    async def _listen(self) -> None:
        assert self._pubsub is not None
        async for raw in self._pubsub.listen():
            if not isinstance(raw, dict) or raw.get("type") not in {"message", "pmessage"}:
                continue
            try:
                event = OperationEvent.model_validate_json(raw.get("data"))
            except (TypeError, ValueError):
                continue
            await self._local.deliver(event)

    def _require_client(self) -> AsyncRedis:
        if self._client is None:
            raise RuntimeError("operation event broker is not connected")
        return self._client


def _redis_client(url: str) -> AsyncRedis:
    return AsyncRedis.from_url(
        url,
        decode_responses=True,
        socket_timeout=5,
        socket_connect_timeout=5,
        socket_keepalive=True,
        health_check_interval=30,
        retry_on_timeout=True,
    )


def _channel(command_id: str) -> str:
    return f"{OPERATION_EVENT_CHANNEL_PREFIX}{command_id}"


def _sequence_key(command_id: str) -> str:
    return f"{OPERATION_EVENT_SEQUENCE_PREFIX}{command_id}"


def _offer(queue: asyncio.Queue[OperationEvent], event: OperationEvent) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        while not queue.empty():
            queue.get_nowait()
        queue.put_nowait(event)
