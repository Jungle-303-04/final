"""Durable command-operation events with Redis used only as a wake-up channel.

Every browser-visible event is first appended to PostgreSQL.  Redis Pub/Sub
announces an already committed row across gateway replicas; it never assigns a
sequence or reconstructs state.  SSE readers replay the database cursor before
using this live fan-out, so a reconnect or a Pub/Sub gap cannot invent state.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any, Protocol

from redis.asyncio import Redis as AsyncRedis

from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.parity import OperationEvent, OperationEventKind

OPERATION_EVENT_CHANNEL_PREFIX = "opsia:operation-events:"
OPERATION_EVENT_QUEUE_MAX = 64
RedisFactory = Callable[[str], AsyncRedis]
LOGGER = logging.getLogger(__name__)


class OperationEventStore(Protocol):
    """Storage authority required by the production event broker."""

    async def append_command_operation_event(
        self,
        workspace_id: str,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
    ) -> OperationEvent | None: ...


class OperationEventStreamOverflow(RuntimeError):
    """A live fan-out queue could not preserve ordering; reconnect from cursor."""


_SubscriptionItem = OperationEvent | OperationEventStreamOverflow


class OperationEventSubscription:
    """One bounded browser subscription; overflow closes rather than drops order."""

    def __init__(
        self,
        command_id: str,
        queue: asyncio.Queue[_SubscriptionItem],
        close: Callable[[], Awaitable[None]],
    ) -> None:
        self.command_id = command_id
        self._queue = queue
        self._close = close
        self._closed = False

    async def next(self) -> OperationEvent:
        item = await self._queue.get()
        if isinstance(item, OperationEventStreamOverflow):
            raise item
        return item

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

    async def subscribe(
        self,
        command_id: str,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEventSubscription: ...

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEvent | None: ...


class InMemoryOperationEventBroker:
    """Deterministic test broker preserving ordering without a persistence fake."""

    def __init__(self) -> None:
        self._sequences: dict[tuple[str, str], int] = defaultdict(int)
        self._terminal: set[tuple[str, str]] = set()
        self._subscriptions: dict[tuple[str, str], set[asyncio.Queue[_SubscriptionItem]]] = (
            defaultdict(set)
        )

    async def start(self) -> None:
        return None

    async def close(self) -> None:
        self._subscriptions.clear()

    async def subscribe(
        self,
        command_id: str,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEventSubscription:
        key = _subscription_key(workspace_id, command_id)
        queue: asyncio.Queue[_SubscriptionItem] = asyncio.Queue(maxsize=OPERATION_EVENT_QUEUE_MAX)
        self._subscriptions[key].add(queue)

        async def close() -> None:
            subscribers = self._subscriptions.get(key)
            if subscribers is None:
                return
            subscribers.discard(queue)
            if not subscribers:
                self._subscriptions.pop(key, None)

        return OperationEventSubscription(command_id, queue, close)

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEvent | None:
        key = _subscription_key(workspace_id, command_id)
        if key in self._terminal:
            return None
        self._sequences[key] += 1
        event = OperationEvent(
            command_id=command_id,
            sequence=self._sequences[key],
            kind=kind,
            payload=payload,
        )
        if kind in {"completed", "failed"}:
            self._terminal.add(key)
        await self.deliver(event, workspace_id=workspace_id)
        return event

    async def deliver(
        self,
        event: OperationEvent,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> None:
        for queue in tuple(
            self._subscriptions.get(_subscription_key(workspace_id, event.command_id), ())
        ):
            _offer(queue, event)


class DurableOperationEventBroker:
    """Persist-before-fanout broker used for deterministic storage contract tests."""

    def __init__(self, store: OperationEventStore) -> None:
        self._store = store
        self._local = InMemoryOperationEventBroker()

    async def start(self) -> None:
        await self._local.start()

    async def close(self) -> None:
        await self._local.close()

    async def subscribe(
        self,
        command_id: str,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEventSubscription:
        return await self._local.subscribe(command_id, workspace_id=workspace_id)

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEvent | None:
        event = await self._store.append_command_operation_event(
            workspace_id,
            command_id,
            kind,
            payload,
        )
        if event is not None:
            await self._local.deliver(event, workspace_id=workspace_id)
        return event

    async def deliver(
        self,
        event: OperationEvent,
        *,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> None:
        await self._local.deliver(event, workspace_id=workspace_id)


class RedisOperationEventBroker(DurableOperationEventBroker):
    """Cross-replica durable event broker; Pub/Sub carries committed rows only."""

    def __init__(
        self,
        redis_url: str,
        store: OperationEventStore,
        *,
        redis_factory: RedisFactory | None = None,
    ) -> None:
        super().__init__(store)
        self._redis_url = redis_url
        self._redis_factory = redis_factory or _redis_client
        self._client: AsyncRedis | None = None
        self._pubsub: Any | None = None
        self._listener: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._client is not None:
            return
        client = self._redis_factory(self._redis_url)
        await client.ping()
        pubsub = client.pubsub(ignore_subscribe_messages=True)
        await pubsub.psubscribe(f"{OPERATION_EVENT_CHANNEL_PREFIX}*")
        self._client = client
        self._pubsub = pubsub
        await super().start()
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
        await super().close()

    async def publish(
        self,
        *,
        command_id: str,
        kind: OperationEventKind,
        payload: dict[str, object],
        workspace_id: str = DEFAULT_WORKSPACE_ID,
    ) -> OperationEvent | None:
        event = await self._store.append_command_operation_event(
            workspace_id,
            command_id,
            kind,
            payload,
        )
        if event is None:
            return None
        # Local browser clients observe the committed event even while Redis is
        # unavailable. Cross-replica delivery is only an acceleration; SSE
        # replay remains authoritative and heals the missed wake-up.
        await self.deliver(event, workspace_id=workspace_id)
        client = self._client
        if client is None:
            LOGGER.warning("operation_event_redis_unavailable", extra={"command_id": command_id})
            return event
        envelope = {
            "workspace_id": workspace_id,
            "event": event.model_dump(mode="json"),
        }
        try:
            await client.publish(_channel(workspace_id, command_id), _json(envelope))
        except (ConnectionError, OSError):
            LOGGER.warning("operation_event_redis_publish_failed", exc_info=True)
        return event

    async def _listen(self) -> None:
        assert self._pubsub is not None
        async for raw in self._pubsub.listen():
            if not isinstance(raw, dict) or raw.get("type") not in {"message", "pmessage"}:
                continue
            parsed = _parse_envelope(raw.get("data"))
            if parsed is None:
                continue
            workspace_id, event = parsed
            await self.deliver(event, workspace_id=workspace_id)

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


def _subscription_key(workspace_id: str, command_id: str) -> tuple[str, str]:
    return workspace_id.strip(), command_id.strip()


def _channel(workspace_id: str, command_id: str) -> str:
    return f"{OPERATION_EVENT_CHANNEL_PREFIX}{workspace_id}:{command_id}"


def _json(value: dict[str, object]) -> str:
    from json import dumps

    return dumps(value, separators=(",", ":"), ensure_ascii=False)


def _parse_envelope(raw: object) -> tuple[str, OperationEvent] | None:
    from json import loads

    if not isinstance(raw, (bytes, str)):
        return None
    try:
        decoded = loads(raw)
        if not isinstance(decoded, dict):
            return None
        workspace_id = decoded.get("workspace_id")
        event = decoded.get("event")
        if (
            not isinstance(workspace_id, str)
            or not workspace_id.strip()
            or not isinstance(event, dict)
        ):
            return None
        return workspace_id, OperationEvent.model_validate(event)
    except (TypeError, ValueError):
        return None


def _offer(queue: asyncio.Queue[_SubscriptionItem], event: OperationEvent) -> None:
    try:
        queue.put_nowait(event)
    except asyncio.QueueFull:
        # Dropping a middle event would violate replay ordering. Closing this
        # live subscription makes the browser reconnect with Last-Event-ID.
        while not queue.empty():
            queue.get_nowait()
        queue.put_nowait(OperationEventStreamOverflow("operation event stream overflow"))
