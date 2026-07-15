from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.fanout import TimelineFanoutClosed
from domains.timeline.repository import (
    TimelineLedgerRecord,
    TimelineLedgerSnapshot,
    TimelineReplayResult,
    TimelineSnapshotLimitExceeded,
)
from packages.contracts.identity import Permission
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    TimelineCoverage,
    TimelineEvent,
    TimelineFilters,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineStreamFrame,
    TimelineWindow,
)
from packages.runtime.dependencies import get_db, get_timeline_fanout


class TimelineSnapshotDb:
    def __init__(
        self,
        *,
        overflow: bool = False,
        coverage: tuple[TimelineCoverage, ...] = (),
    ) -> None:
        self.overflow = overflow
        self.coverage = coverage
        self.snapshot_calls: list[dict[str, Any]] = []
        self.replay_calls: list[dict[str, Any]] = []
        self.coverage_calls: list[dict[str, Any]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-a"}
        if resource_type == "cluster" and permission == Permission.RCA_READ.value:
            return {"cluster-a"}
        if resource_type == "application" and permission == Permission.APPLICATION_READ.value:
            return {"application-gitops"}
        if resource_type == "application" and permission == Permission.DEPLOYMENT_READ.value:
            return {"application-workflow"}
        return set()

    def latest_cluster_agent_statuses(
        self, _workspace_id: str, cluster_ids: set[str]
    ) -> dict[str, dict[str, str]]:
        return {
            cluster_id: {"last_seen_at": datetime.now(UTC).isoformat()}
            for cluster_id in cluster_ids
        }

    def snapshot_timeline_events(
        self, read_scope: object, **kwargs: object
    ) -> TimelineLedgerSnapshot:
        self.snapshot_calls.append({"read_scope": read_scope, **kwargs})
        if self.overflow:
            raise TimelineSnapshotLimitExceeded(int(kwargs["limit"]))
        return TimelineLedgerSnapshot(
            records=(TimelineLedgerRecord(sequence=7, event=_event()),),
            high_water_sequence=7,
            retained_from_sequence=1,
        )

    def replay_timeline_events(
        self, _read_scope: object, **_kwargs: object
    ) -> TimelineReplayResult:
        self.replay_calls.append(dict(_kwargs))
        return TimelineReplayResult(
            status="available",
            records=(TimelineLedgerRecord(sequence=8, event=_event()),),
            high_water_sequence=8,
            retained_from_sequence=1,
        )

    def snapshot_timeline_coverage(
        self, read_scope: object, **kwargs: object
    ) -> tuple[TimelineCoverage, ...]:
        self.coverage_calls.append({"read_scope": read_scope, **kwargs})
        return self.coverage


class ClosedTimelineFanout:
    async def subscribe(self, _workspace_id: str) -> ClosedTimelineSubscription:
        return ClosedTimelineSubscription()


class ClosedTimelineSubscription:
    async def next(self) -> None:
        raise TimelineFanoutClosed("closed")

    async def close(self) -> None:
        return None


def _event() -> TimelineEvent:
    scope = ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a")
    resource = ResourceRef(
        api_group="apps",
        version="v1",
        kind="Deployment",
        namespace="payments",
        name="checkout",
        uid="deployment-uid",
    )
    return TimelineEvent(
        event_id="inventory-event-7",
        source="inventory",
        source_key="inventory:deployment-uid:7",
        native_id="deployment-uid",
        activity="change",
        occurred_at=datetime.fromtimestamp(1_720_000_030, tz=UTC),
        scope=scope,
        subject=TimelineResourceSubject(resource=resource),
        resource=resource,
        event_type="update",
        severity="info",
        title="Deployment observed",
    )


def _query(cluster_id: str = "cluster-a") -> TimelineQuery:
    return TimelineQuery(
        scopes=(
            ClusterScope(
                workspace_id="workspace-a",
                cluster_id=cluster_id,
                namespaces=("payments",),
                freshness="disconnected",
            ),
        ),
        window=TimelineWindow(from_ms=1_720_000_000_000, to_ms=1_720_000_060_000),
        mode="live",
    )


def _client(
    db: TimelineSnapshotDb,
    *,
    cursor: bool = True,
    timeline_fanout: object | None = None,
) -> TestClient:
    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("operator",),
    )
    app.dependency_overrides[get_db] = lambda: db
    if timeline_fanout is not None:
        app.dependency_overrides[get_timeline_fanout] = lambda: timeline_fanout
    if cursor:
        app.state.timeline_cursor_codec = FilterCursorCodec(
            "timeline-snapshot-router-test-secret!!", now=lambda: 1_000
        )
    return TestClient(app)


def test_timeline_snapshot_is_bounded_ndjson_with_an_opaque_cursor() -> None:
    db = TimelineSnapshotDb()
    response = _client(db).post(
        "/timeline/snapshots", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    frames = [TimelineStreamFrame.model_validate_json(line) for line in response.text.splitlines()]
    assert [frame.kind for frame in frames] == ["snapshot", "end"]
    assert frames[0].scopes[0].freshness == "live"
    assert frames[0].events[0].event_id == "inventory-event-7"
    assert frames[0].cursor == frames[1].cursor
    assert "sequence" not in response.text
    call = db.snapshot_calls[0]
    assert call["limit"] == frames[0].policy.max_batch_events
    assert call["read_scope"].inventory_cluster_ids == {"cluster-a"}
    assert call["read_scope"].incident_cluster_ids == {"cluster-a"}


def test_timeline_snapshot_includes_only_durable_authorized_coverage() -> None:
    coverage = TimelineCoverage(
        scope=ClusterScope(
            workspace_id="workspace-a",
            cluster_id="cluster-a",
            namespaces=("payments",),
        ),
        source="kubernetes_event",
        from_ms=1_720_000_010_000,
        to_ms=1_720_000_020_000,
        reason="collection_gap",
    )
    hidden_coverage = coverage.model_copy(
        update={
            "scope": ClusterScope(
                workspace_id="workspace-a",
                cluster_id="cluster-hidden",
                namespaces=("payments",),
            )
        }
    )
    db = TimelineSnapshotDb(coverage=(coverage, hidden_coverage))
    response = _client(db).post(
        "/timeline/snapshots", json={"query": _query().model_dump(mode="json")}
    )

    frame = TimelineStreamFrame.model_validate_json(response.text.splitlines()[0])
    assert frame.coverage == (coverage,)
    assert db.coverage_calls[0]["window"] == _query().window
    assert db.coverage_calls[0]["read_scope"].kubernetes_event_cluster_ids == {"cluster-a"}

    event_hidden_query = _query().model_copy(
        update={"filters": TimelineFilters(activity=("change",))}
    )
    hidden_response = _client(db).post(
        "/timeline/snapshots", json={"query": event_hidden_query.model_dump(mode="json")}
    )
    hidden_frame = TimelineStreamFrame.model_validate_json(hidden_response.text.splitlines()[0])
    assert hidden_frame.coverage == ()


def test_timeline_snapshot_fails_closed_for_unknown_cluster_and_missing_cursor_config() -> None:
    forbidden_db = TimelineSnapshotDb()
    forbidden = _client(forbidden_db).post(
        "/timeline/snapshots", json={"query": _query("cluster-hidden").model_dump(mode="json")}
    )
    assert forbidden.status_code == 404
    assert forbidden_db.snapshot_calls == []

    unavailable = _client(TimelineSnapshotDb(), cursor=False).post(
        "/timeline/snapshots", json={"query": _query().model_dump(mode="json")}
    )
    assert unavailable.status_code == 503


def test_timeline_snapshot_reports_server_limit_without_a_partial_success() -> None:
    response = _client(TimelineSnapshotDb(overflow=True)).post(
        "/timeline/snapshots", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "timeline snapshot exceeds the server event limit"


def test_timeline_stream_reuses_snapshot_cursor_as_sse_resume_state() -> None:
    client = _client(TimelineSnapshotDb(), timeline_fanout=ClosedTimelineFanout())
    snapshot = client.post("/timeline/snapshots", json={"query": _query().model_dump(mode="json")})
    after = TimelineStreamFrame.model_validate_json(snapshot.text.splitlines()[0]).cursor

    response = client.post(
        "/timeline/stream",
        json={"query": _query().model_dump(mode="json"), "after": after.model_dump()},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = [
        TimelineStreamFrame.model_validate_json(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    assert [frame.kind for frame in frames] == ["event", "error"]
    assert all("sequence" not in line for line in response.text.splitlines())


def test_snapshot_and_sse_apply_the_same_server_evidence_predicate() -> None:
    db = TimelineSnapshotDb()
    query = _query().model_copy(
        update={"filters": TimelineFilters(activity=("warning",), query="checkout")}
    )
    client = _client(db, timeline_fanout=ClosedTimelineFanout())
    snapshot_response = client.post(
        "/timeline/snapshots", json={"query": query.model_dump(mode="json")}
    )
    snapshot = TimelineStreamFrame.model_validate_json(snapshot_response.text.splitlines()[0])

    assert snapshot.events == ()
    assert db.snapshot_calls[0]["predicate"].matches(_event()) is False

    response = client.post(
        "/timeline/stream",
        json={"query": query.model_dump(mode="json"), "after": snapshot.cursor.model_dump()},
    )
    frames = [
        TimelineStreamFrame.model_validate_json(line.removeprefix("data: "))
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]

    assert [frame.kind for frame in frames] == ["error"]
    assert db.replay_calls[0]["predicate"].matches(_event()) is False
