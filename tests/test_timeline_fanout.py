"""Process-local Timeline fan-out is only a committed-ledger wake-up path."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from domains.timeline.fanout import (
    InMemoryTimelineEventFanout,
    TimelineFanoutClosed,
    TimelineFanoutOverflow,
)
from domains.timeline.repository import TimelineLedgerAppend, fanout_committed_timeline_append
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import TimelineEvent, TimelineResourceSubject


def _append(
    *, workspace_id: str = "workspace-a", event_id: str = "event-1"
) -> TimelineLedgerAppend:
    resource = ResourceRef(kind="Deployment", namespace="payments", name="checkout", uid="uid-1")
    event = TimelineEvent(
        event_id=event_id,
        source="inventory",
        source_key=f"inventory:{event_id}",
        native_id=event_id,
        activity="change",
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
        scope=ClusterScope(workspace_id=workspace_id, cluster_id="cluster-a"),
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment checkout updated",
    )
    return TimelineLedgerAppend(event=event, sequence=7, inserted=True)


def test_committed_append_is_delivered_without_fanout_becoming_a_ledger() -> None:
    async def run() -> None:
        fanout = InMemoryTimelineEventFanout()
        subscription = await fanout.subscribe("workspace-a")
        append = _append()

        await fanout_committed_timeline_append(append, fanout)

        assert await subscription.next() is append
        assert subscription.empty()
        await subscription.close()
        await fanout.close()

    asyncio.run(run())


def test_workspace_subscriptions_are_isolated_and_duplicate_append_is_not_announced() -> None:
    async def run() -> None:
        fanout = InMemoryTimelineEventFanout()
        workspace_a = await fanout.subscribe("workspace-a")
        workspace_b = await fanout.subscribe("workspace-b")

        await fanout.publish_committed(_append(workspace_id="workspace-a"))
        await fanout.publish_committed(
            TimelineLedgerAppend(event=_append().event, sequence=7, inserted=False)
        )

        assert (await workspace_a.next()).event.scope.workspace_id == "workspace-a"
        assert workspace_b.empty()
        assert workspace_a.empty()
        await workspace_a.close()
        await workspace_b.close()
        await fanout.close()

    asyncio.run(run())


def test_queue_overflow_requires_durable_replay_instead_of_reordered_delivery() -> None:
    async def run() -> None:
        fanout = InMemoryTimelineEventFanout(queue_max=1)
        subscription = await fanout.subscribe("workspace-a")

        await fanout.publish_committed(_append(event_id="event-1"))
        await fanout.publish_committed(_append(event_id="event-2"))

        with pytest.raises(TimelineFanoutOverflow, match="replay"):
            await subscription.next()
        await subscription.close()
        await fanout.close()

    asyncio.run(run())


def test_subscription_and_fanout_close_dispose_waiters_and_membership() -> None:
    async def run() -> None:
        fanout = InMemoryTimelineEventFanout()
        subscription = await fanout.subscribe("workspace-a")

        await subscription.close()
        assert subscription.closed is True
        with pytest.raises(TimelineFanoutClosed):
            await subscription.next()

        active = await fanout.subscribe("workspace-a")
        await fanout.close()
        assert active.closed is True
        with pytest.raises(TimelineFanoutClosed):
            await active.next()

    asyncio.run(run())
