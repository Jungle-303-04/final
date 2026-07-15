"""실시간 실측값을 canonical 알림 범위의 파드와 결합하는 계약."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from domains.alert.measurements import AlertRuleMeasurementLoader

BASE_TIME = datetime(2026, 7, 15, 4, 0, tzinfo=UTC)


def rule(metric: str = "cpu_pct") -> dict[str, Any]:
    return {
        "rule_id": "alr-1",
        "workspace_id": "workspace-1",
        "scope": {
            "clusters": ["cluster-1"],
            "namespaces": ["cluster-1/sandbox"],
            "applications": [],
            "labels": ["app=color-turf"],
        },
        "metric": metric,
    }


class StubMeasurementDb:
    def __init__(self, pod: dict[str, Any], *, sampled_at: datetime = BASE_TIME) -> None:
        self.pod = pod
        self.sampled_at = sampled_at
        self.filtered_calls: list[dict[str, Any]] = []

    async def list_workspace_cluster_ids(self, _workspace_id: str) -> set[str]:
        return {"cluster-1"}

    async def list_workspace_application_ids(self, _workspace_id: str) -> set[str]:
        return {"app-1"}

    async def filter_snapshot_context(
        self,
        _workspace_id: str,
        _cluster_ids: set[str],
    ) -> dict[str, Any]:
        return {"snapshot_revision": 42}

    async def list_filtered_resources(self, **kwargs: Any) -> dict[str, Any]:
        self.filtered_calls.append(kwargs)
        return {
            "items": [
                {
                    "resource": {
                        "cluster_id": "cluster-1",
                        "namespace": "sandbox",
                        "kind": "Pod",
                        "name": "game-0",
                    }
                }
            ],
            "has_more": False,
            "next_position": None,
        }

    async def list_cluster_usage_samples(
        self,
        _workspace_id: str,
        _cluster_id: str,
        *,
        limit: int,
    ) -> list[dict[str, Any]]:
        assert limit == 1
        return [
            {
                "sampled_at": self.sampled_at.isoformat(),
                "usage": {"pods": {"sandbox/game-0": dict(self.pod)}},
            }
        ]


def load(db: StubMeasurementDb, *, metric: str = "cpu_pct") -> list[Any]:
    loader = AlertRuleMeasurementLoader(
        db,
        now=lambda: BASE_TIME + timedelta(seconds=1),
    )
    return asyncio.run(loader(rule(metric)))


def test_cpu_measurement_uses_real_request_ratio_and_canonical_scope() -> None:
    db = StubMeasurementDb(
        {
            "cpu_mcores": 530,
            "cpu_request_mcores": 500,
            "cpu_request_pct": 106,
            "mem_mib": 32,
            "mem_request_mib": 64,
            "ready": "1/1",
            "restarts": 0,
        }
    )

    measurements = load(db)

    assert len(measurements) == 1
    measurement = measurements[0]
    assert measurement.subject == {
        "cluster": "cluster-1",
        "namespace": "sandbox",
        "kind": "Pod",
        "name": "game-0",
    }
    assert measurement.observed_value == 106
    assert measurement.evidence[0]["summary"] == (
        "CPU 요청량 대비 사용률 106.0 (530.00/500.00 mCPU)"
    )
    filters = db.filtered_calls[0]["filters"]
    assert filters.clusters == ("cluster-1",)
    assert filters.namespaces == (("cluster-1", "sandbox"),)
    assert filters.labels == (("app", "color-turf"),)
    assert filters.resource_types == ("pod",)
    assert filters.include_deleted is False


def test_missing_request_denominator_does_not_invent_percentage() -> None:
    db = StubMeasurementDb({"cpu_mcores": 400, "cpu_request_mcores": None})

    assert load(db) == []


def test_stale_live_sample_is_not_evaluated() -> None:
    db = StubMeasurementDb(
        {"cpu_request_pct": 90},
        sampled_at=BASE_TIME - timedelta(seconds=31),
    )

    assert load(db) == []


@pytest.mark.parametrize(
    ("metric", "pod", "expected"),
    (
        ("mem_pct", {"mem_mib": 96, "mem_request_mib": 64}, 150.0),
        ("restart_count", {"restarts": 3}, 3.0),
        ("pod_not_ready", {"ready": "0/1"}, 1.0),
        ("pod_not_ready", {"ready": "1/1"}, 0.0),
    ),
)
def test_supported_metrics_keep_observed_values(
    metric: str,
    pod: dict[str, Any],
    expected: float,
) -> None:
    db = StubMeasurementDb(pod)

    assert load(db, metric=metric)[0].observed_value == expected


def test_rule_without_cluster_scope_uses_workspace_clusters() -> None:
    db = StubMeasurementDb({"cpu_request_pct": 75})
    loader = AlertRuleMeasurementLoader(db, now=lambda: BASE_TIME + timedelta(seconds=1))
    workspace_rule = rule()
    workspace_rule["scope"] = {
        "clusters": [],
        "namespaces": [],
        "applications": [],
        "labels": [],
    }

    measurements = asyncio.run(loader(workspace_rule))

    assert len(measurements) == 1
    assert db.filtered_calls[0]["allowed_cluster_ids"] == {"cluster-1"}
