from __future__ import annotations

import asyncio

from packages.runtime.operation_events import (
    DurableOperationEventBroker,
    InMemoryOperationEventBroker,
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
