from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime

import pytest

from domains.dashboard.fleet_router import _home_dashboard_sse_body
from domains.dashboard.ready_stream import (
    DashboardReadyCursorBinding,
    DashboardReadyCursorCodec,
    DashboardReadyFanoutClosed,
    DashboardReadySnapshot,
    InMemoryDashboardReadyFanout,
)
from domains.inventory_filter.cursor import FilterCursorCodec
from packages.contracts.freshness import HomeDashboardEventFrame


class ReplayReader:
    def __init__(self, batches: list[tuple[DashboardReadySnapshot, ...]]) -> None:
        self.batches = batches
        self.calls: list[dict[str, object]] = []

    def __call__(self, **kwargs: object) -> tuple[DashboardReadySnapshot, ...]:
        self.calls.append(dict(kwargs))
        return self.batches.pop(0)


class ClosedSubscription:
    closed = False

    async def next(self) -> None:
        raise DashboardReadyFanoutClosed("closed")

    async def close(self) -> None:
        self.closed = True


def test_dashboard_stream_replays_durable_completion_with_scope_bound_opaque_cursor() -> None:
    observed_at = datetime(2026, 7, 17, 1, 2, 3, tzinfo=UTC)
    snapshot = DashboardReadySnapshot(
        snapshot_id="snapshot-2",
        created_at=observed_at,
    )
    reader = ReplayReader([(snapshot,), ()])
    subscription = ClosedSubscription()
    binding = DashboardReadyCursorBinding(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        user_id="user-a",
        authorization_revision="authorization-a",
    )
    codec = DashboardReadyCursorCodec(FilterCursorCodec("dashboard-ready-test-secret-32-bytes"))

    chunks = asyncio.run(
        _collect(
            _home_dashboard_sse_body(
                replay_reader=reader,
                subscription=subscription,
                binding=binding,
                cursor_codec=codec,
                after=None,
                reconnect_after_ms=1_500,
                heartbeat_seconds=15,
            )
        )
    )

    frames = _frames(chunks)
    assert [frame.kind for frame in frames] == ["connected", "deferred_ready"]
    assert frames[1].snapshot_id == "snapshot-2"
    assert frames[1].scope.workspace_id == "workspace-a"
    assert frames[1].scope.cluster_id == "cluster-a"
    assert codec.decode(frames[1].cursor, binding=binding) == snapshot
    assert all('"created_at"' not in chunk for chunk in chunks)
    assert reader.calls[0]["workspace_id"] == "workspace-a"
    assert reader.calls[0]["cluster_id"] == "cluster-a"
    assert subscription.closed is True


def test_dashboard_stream_invalidates_once_from_the_initial_latest_snapshot() -> None:
    snapshot = DashboardReadySnapshot(
        snapshot_id="snapshot-latest",
        created_at=datetime(2026, 7, 17, 1, 2, 3, tzinfo=UTC),
    )
    chunks = asyncio.run(
        _collect(
            _home_dashboard_sse_body(
                replay_reader=ReplayReader([()]),
                subscription=ClosedSubscription(),
                binding=(
                    binding := DashboardReadyCursorBinding(
                        workspace_id="workspace-a",
                        cluster_id="cluster-a",
                        user_id="user-a",
                        authorization_revision="authorization-a",
                    )
                ),
                cursor_codec=DashboardReadyCursorCodec(
                    FilterCursorCodec("dashboard-ready-test-secret-32-bytes")
                ),
                after=snapshot,
                reconnect_after_ms=1_500,
                heartbeat_seconds=15,
                emit_initial=True,
            )
        )
    )

    frames = _frames(chunks)
    assert [frame.kind for frame in frames] == ["connected", "deferred_ready"]
    assert frames[1].scope.workspace_id == binding.workspace_id
    assert frames[1].snapshot_id == "snapshot-latest"


def test_dashboard_ready_wakeup_and_cursor_cannot_cross_cluster_scope() -> None:
    async def run() -> None:
        fanout = InMemoryDashboardReadyFanout()
        cluster_a = await fanout.subscribe("workspace-a", "cluster-a")
        cluster_b = await fanout.subscribe("workspace-a", "cluster-b")
        await fanout.publish_committed(
            workspace_id="workspace-a",
            cluster_id="cluster-a",
            snapshot_id="snapshot-a",
        )
        assert (await cluster_a.next()).snapshot_id == "snapshot-a"
        with pytest.raises(TimeoutError):
            await asyncio.wait_for(cluster_b.next(), timeout=0.01)

    asyncio.run(run())

    codec = DashboardReadyCursorCodec(FilterCursorCodec("dashboard-ready-test-secret-32-bytes"))
    cluster_a_binding = DashboardReadyCursorBinding(
        workspace_id="workspace-a",
        cluster_id="cluster-a",
        user_id="user-a",
        authorization_revision="authorization-a",
    )
    token = codec.encode(
        DashboardReadySnapshot(
            snapshot_id="snapshot-a",
            created_at=datetime(2026, 7, 17, tzinfo=UTC),
        ),
        binding=cluster_a_binding,
    )
    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            token,
            binding=DashboardReadyCursorBinding(
                workspace_id="workspace-a",
                cluster_id="cluster-b",
                user_id="user-a",
                authorization_revision="authorization-a",
            ),
        )


async def _collect(stream: object) -> list[str]:
    return [item async for item in stream]


def _frames(chunks: list[str]) -> list[HomeDashboardEventFrame]:
    frames: list[HomeDashboardEventFrame] = []
    for chunk in chunks:
        for line in chunk.splitlines():
            if line.startswith("data: "):
                frames.append(
                    HomeDashboardEventFrame.model_validate(json.loads(line.removeprefix("data: ")))
                )
    return frames
