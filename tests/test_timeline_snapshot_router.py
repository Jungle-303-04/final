from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.repository import (
    TimelineLedgerRecord,
    TimelineLedgerSnapshot,
    TimelineSnapshotLimitExceeded,
)
from packages.contracts.identity import Permission
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.timeline import (
    TimelineEvent,
    TimelineQuery,
    TimelineResourceSubject,
    TimelineStreamFrame,
    TimelineWindow,
)
from packages.runtime.dependencies import get_db


class TimelineSnapshotDb:
    def __init__(self, *, overflow: bool = False) -> None:
        self.overflow = overflow
        self.snapshot_calls: list[dict[str, Any]] = []

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
        occurred_at=datetime(2026, 7, 15, tzinfo=UTC),
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
    )


def _client(db: TimelineSnapshotDb, *, cursor: bool = True) -> TestClient:
    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("operator",),
    )
    app.dependency_overrides[get_db] = lambda: db
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
