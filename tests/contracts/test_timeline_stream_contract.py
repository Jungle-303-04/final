"""Timeline window/replay contract shared by HTTP, SSE, and browser adapters."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    RealtimePolicy,
    TimelineCoverage,
    TimelineEvent,
    TimelineQuery,
    TimelineStreamFrame,
    TimelineWindow,
)


def _scope(cluster_id: str = "cluster-a") -> ClusterScope:
    return ClusterScope(
        workspace_id="workspace-a",
        cluster_id=cluster_id,
        namespaces=("payments",),
        freshness="live",
    )


def _event(event_id: str = "event-1", cursor: int = 1) -> TimelineEvent:
    return TimelineEvent(
        event_id=event_id,
        cursor=cursor,
        occurred_at="2026-07-15T12:00:00Z",
        scope=_scope(),
        resource=ResourceRef(
            api_group="apps",
            version="v1",
            kind="Deployment",
            namespace="payments",
            name="checkout",
            uid="deployment-uid",
        ),
        event_type="update",
        severity="warning",
        title="Deployment checkout changed",
    )


def test_timeline_query_canonicalizes_scopes_and_carries_server_realtime_policy() -> None:
    query = TimelineQuery(
        scopes=[_scope("cluster-b"), _scope("cluster-a"), _scope("cluster-b")],
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        filters={"activity": ["warning", "change"], "kinds": ["Deployment", "Pod"]},
        grouping="app",
        sort="importance",
    )
    policy = RealtimePolicy(
        max_batch_events=200,
        max_frames_per_second=60,
        retention_seconds=86_400,
        resume="cursor",
        hidden_tab="coalesce",
    )

    assert [scope.cluster_id for scope in query.scopes] == ["cluster-a", "cluster-b"]
    assert query.filters.activity == ("change", "warning")
    assert policy.max_batch_events == 200
    assert policy.hidden_tab == "coalesce"


def test_timeline_stream_frames_are_strict_and_terminal_safe() -> None:
    event = _event()
    coverage = TimelineCoverage(from_ms=1_250, to_ms=1_500, reason="collection_gap")

    snapshot = TimelineStreamFrame(kind="snapshot", cursor=0, events=[event], coverage=[coverage])
    update = TimelineStreamFrame(kind="event", cursor=1, event=event)
    resync = TimelineStreamFrame(kind="resync_required", cursor=8, reason="cursor_expired")
    end = TimelineStreamFrame(kind="end", cursor=8)

    assert snapshot.events == (event,)
    assert update.event == event
    assert resync.reason == "cursor_expired"
    assert end.is_terminal is True

    with pytest.raises(ValidationError, match="event frame requires event"):
        TimelineStreamFrame(kind="event", cursor=2)
    with pytest.raises(ValidationError, match="terminal frame"):
        TimelineStreamFrame(kind="end", cursor=2, event=event)
    with pytest.raises(ValidationError, match="same workspace"):
        TimelineQuery(
            scopes=[
                _scope(),
                _scope("cluster-b").model_copy(update={"workspace_id": "workspace-b"}),
            ],
            window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        )
