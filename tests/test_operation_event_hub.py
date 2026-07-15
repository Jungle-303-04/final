from __future__ import annotations

import asyncio

from packages.runtime.operation_events import InMemoryOperationEventBroker


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
