from __future__ import annotations

import importlib
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from domains.timeline.repository import TimelineOverviewAggregate, TimelineOverviewBucketAggregate
from packages.contracts.identity import Permission
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import TimelineCoverage, TimelineQuery, TimelineWindow
from packages.runtime.dependencies import get_db


class TimelineOverviewDb:
    def __init__(
        self,
        *,
        aggregate: TimelineOverviewAggregate | None = None,
        coverage: tuple[TimelineCoverage, ...] = (),
        coverage_unavailable: bool = False,
    ) -> None:
        self.aggregate = aggregate or TimelineOverviewAggregate(
            buckets=(TimelineOverviewBucketAggregate(0, 4, 2),),
            activity_counts={"change": 4, "warning": 2},
            kind_counts={"Deployment": 4},
            new_evidence_count=None,
        )
        self.coverage = coverage
        self.coverage_unavailable = coverage_unavailable
        self.overview_calls: list[dict[str, Any]] = []
        self.coverage_calls: list[dict[str, Any]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        if resource_type == "cluster" and permission in {
            Permission.INVENTORY_READ.value,
            Permission.RCA_READ.value,
        }:
            return {"cluster-a"}
        return set()

    def latest_cluster_agent_statuses(
        self, _workspace_id: str, cluster_ids: set[str]
    ) -> dict[str, dict[str, str]]:
        return {
            cluster_id: {"last_seen_at": datetime.now(UTC).isoformat()}
            for cluster_id in cluster_ids
        }

    def timeline_overview(self, read_scope: object, **kwargs: object) -> TimelineOverviewAggregate:
        self.overview_calls.append({"read_scope": read_scope, **kwargs})
        return self.aggregate

    def snapshot_timeline_coverage(
        self, read_scope: object, **kwargs: object
    ) -> tuple[TimelineCoverage, ...]:
        self.coverage_calls.append({"read_scope": read_scope, **kwargs})
        if self.coverage_unavailable:
            raise RuntimeError("coverage store unavailable")
        return self.coverage


def _client(db: TimelineOverviewDb) -> TestClient:
    module = importlib.import_module("domains.timeline.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("operator",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def _query(*, mode: str = "live", cluster_id: str = "cluster-a") -> TimelineQuery:
    return TimelineQuery(
        scopes=(ClusterScope(workspace_id="workspace-a", cluster_id=cluster_id),),
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
        mode=mode,  # type: ignore[arg-type]
    )


def test_timeline_overview_uses_the_snapshot_scope_predicate_and_safe_aggregate_shape() -> None:
    db = TimelineOverviewDb()
    response = _client(db).post(
        "/timeline/overview", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["window"] == {"from_ms": 1_000, "to_ms": 2_000}
    assert payload["bucket_width_ms"] == 3_600_000
    assert payload["buckets"] == [
        {"from_ms": 1_000, "to_ms": 2_000, "event_count": 4, "problem_count": 2}
    ]
    assert payload["facets"] == {
        "activity": [
            {"activity": "change", "count": 4},
            {"activity": "k8s_event", "count": 0},
            {"activity": "unhealthy", "count": 0},
            {"activity": "warning", "count": 2},
        ],
        "kinds": [{"kind": "Deployment", "count": 4}],
    }
    assert payload["new_evidence_count"] is None
    assert "events" not in payload
    assert "metadata" not in response.text
    assert db.overview_calls[0]["read_scope"].inventory_cluster_ids == {"cluster-a"}
    assert db.overview_calls[0]["predicate"].replay_identity.window == _query().window
    assert db.coverage_calls[0]["window"] == _query().window


def test_timeline_overview_reports_known_gaps_without_claiming_unavailable_source_coverage() -> (
    None
):
    gap = TimelineCoverage(
        scope=ClusterScope(workspace_id="workspace-a", cluster_id="cluster-a"),
        source="kubernetes_event",
        from_ms=1_100,
        to_ms=1_200,
        reason="collection_gap",
    )
    response = _client(TimelineOverviewDb(coverage=(gap,))).post(
        "/timeline/overview", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["coverage"] == [gap.model_dump(mode="json")]
    availability = {item["source"]: item["availability"] for item in payload["coverage_sources"]}
    assert availability["kubernetes_event"] == "observed"
    assert availability["inventory"] == "unavailable"
    assert "coverage_count" not in payload


def test_timeline_overview_keeps_empty_buckets_and_independent_zero_facets() -> None:
    db = TimelineOverviewDb(
        aggregate=TimelineOverviewAggregate(
            buckets=(), activity_counts={}, kind_counts={}, new_evidence_count=None
        )
    )
    response = _client(db).post(
        "/timeline/overview", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["buckets"] == [
        {"from_ms": 1_000, "to_ms": 2_000, "event_count": 0, "problem_count": 0}
    ]
    assert all(item["count"] == 0 for item in payload["facets"]["activity"])
    assert payload["facets"]["kinds"] == []


def test_timeline_overview_counts_later_evidence_only_for_frozen_windows() -> None:
    aggregate = TimelineOverviewAggregate(
        buckets=(), activity_counts={}, kind_counts={}, new_evidence_count=7
    )
    frozen = _query(mode="frozen")
    response = _client(TimelineOverviewDb(aggregate=aggregate)).post(
        "/timeline/overview", json={"query": frozen.model_dump(mode="json")}
    )

    assert response.status_code == 200
    assert response.json()["new_evidence_count"] == 7


def test_timeline_overview_fails_closed_for_scope_and_unavailable_controls() -> None:
    db = TimelineOverviewDb()
    client = _client(db)
    forbidden = client.post(
        "/timeline/overview",
        json={"query": _query(cluster_id="cluster-hidden").model_dump(mode="json")},
    )
    pinned = _query().model_copy(
        update={"filters": _query().filters.model_copy(update={"pinned_only": True})}
    )
    unsupported_activity = _query().model_copy(
        update={"filters": _query().filters.model_copy(update={"activity": ("change", "warning")})}
    )
    invalid_preset = _query().model_copy(update={"range_id": "1h"})
    invalid_pin = client.post("/timeline/overview", json={"query": pinned.model_dump(mode="json")})
    invalid_activity = client.post(
        "/timeline/overview", json={"query": unsupported_activity.model_dump(mode="json")}
    )
    invalid_range = client.post(
        "/timeline/overview", json={"query": invalid_preset.model_dump(mode="json")}
    )

    assert forbidden.status_code == 404
    assert invalid_pin.status_code == 422
    assert invalid_pin.json()["detail"] == "timeline control selection is unavailable"
    assert invalid_activity.status_code == 422
    assert invalid_range.status_code == 422
    assert db.overview_calls == []


def test_timeline_overview_reports_coverage_unavailability_without_downgrading_to_zero_gaps() -> (
    None
):
    db = TimelineOverviewDb(coverage_unavailable=True)
    response = _client(db).post(
        "/timeline/overview", json={"query": _query().model_dump(mode="json")}
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "timeline coverage is unavailable"}
    assert len(db.overview_calls) == 1
