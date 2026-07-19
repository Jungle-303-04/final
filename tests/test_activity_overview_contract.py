"""G3 W4 server-owned activity aggregation contract."""

from __future__ import annotations

from contextlib import contextmanager
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.activity.repository import ActivityOverviewRepository
from domains.activity.router import router as activity_router
from domains.identity.dependencies import require_session
from domains.registry import Database
from packages.contracts.gateway.responses import ActivityOverviewResponse
from packages.runtime.dependencies import get_db

DAY_MS = 24 * 60 * 60 * 1_000


class _Rows:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self._rows = rows

    def mappings(self) -> _Rows:
        return self

    def all(self) -> list[dict[str, object]]:
        return self._rows


class _Connection:
    def __init__(self, results: list[list[dict[str, object]]]) -> None:
        self._results = iter(results)
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Rows:
        self.statements.append(statement)
        return _Rows(next(self._results))


def _repository(connection: _Connection) -> ActivityOverviewRepository:
    repository = object.__new__(ActivityOverviewRepository)

    @contextmanager
    def connect():
        yield connection

    repository.connection = connect  # type: ignore[method-assign]
    return repository


def _sql(statement: Any) -> str:
    return str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).casefold()


def test_activity_repository_zero_fills_30_day_server_buckets_and_fences_sources() -> None:
    connection = _Connection(
        [
            [{"bucket_index": 0, "count": 2}],
            [{"bucket_index": 1, "count": 3}],
            [{"bucket_index": 1, "count": 1}],
        ]
    )

    buckets = _repository(connection).activity_overview(
        workspace_id="workspace-a",
        deployment_application_ids={"app-a"},
        alert_cluster_ids={"cluster-a"},
        incident_cluster_ids={"cluster-a"},
        from_ms=0,
        to_ms=2 * DAY_MS,
        bucket_ms=DAY_MS,
    )

    assert buckets == [
        {
            "from_ms": 0,
            "to_ms": DAY_MS,
            "deployments": 2,
            "alerts": 0,
            "critical": 0,
        },
        {
            "from_ms": DAY_MS,
            "to_ms": 2 * DAY_MS,
            "deployments": 0,
            "alerts": 3,
            "critical": 1,
        },
    ]
    deployment_sql, alert_sql, critical_sql = map(_sql, connection.statements)
    assert "workflow_runs.workspace_id = 'workspace-a'" in deployment_sql
    assert "workflow_runs.application_id in ('app-a')" in deployment_sql
    assert "workflow_runs.status in ('failed', 'succeeded')" in deployment_sql
    assert "floor(" in deployment_sql
    assert "alert_events.workspace_id = 'workspace-a'" in alert_sql
    assert "(alert_events.subject ->> 'cluster') in ('cluster-a')" in alert_sql
    assert "alert_events.fired_at >=" in alert_sql
    assert "rca_timeline.workspace_id = 'workspace-a'" in critical_sql
    assert "rca_timeline.cluster_id in ('cluster-a')" in critical_sql
    assert "lower(rca_timeline.severity) = 'critical'" in critical_sql


def test_activity_response_is_strict_and_counted_per_series() -> None:
    assert callable(getattr(Database, "activity_overview", None))
    response = ActivityOverviewResponse.model_validate(
        {
            "from_ms": 0,
            "to_ms": DAY_MS,
            "bucket_ms": DAY_MS,
            "buckets": [
                {
                    "from_ms": 0,
                    "to_ms": DAY_MS,
                    "deployments": 1,
                    "alerts": 2,
                    "critical": 1,
                }
            ],
        }
    )

    assert response.buckets[0].alerts == 2
    with pytest.raises(ValidationError):
        ActivityOverviewResponse.model_validate(
            {
                **response.model_dump(),
                "buckets": [{**response.buckets[0].model_dump(), "events": []}],
            }
        )


class _ActivityDb:
    def activity_overview(self, **kwargs: Any) -> list[dict[str, int]]:
        assert kwargs["workspace_id"] == "workspace-a"
        assert kwargs["deployment_application_ids"] == {"app-a"}
        assert kwargs["alert_cluster_ids"] == {"cluster-inventory"}
        assert kwargs["incident_cluster_ids"] == {"cluster-rca"}
        return [
            {
                "from_ms": kwargs["from_ms"],
                "to_ms": kwargs["to_ms"],
                "deployments": 1,
                "alerts": 2,
                "critical": 1,
            }
        ]


def test_activity_route_exposes_bounded_30_day_aggregate(monkeypatch: pytest.MonkeyPatch) -> None:
    async def resolve_scope(_db: Any, _current: Any) -> Any:
        return SimpleNamespace(
            workspace_id="workspace-a",
            deployment_application_ids=frozenset({"app-a"}),
            cluster_ids=frozenset({"cluster-inventory"}),
            incident_cluster_ids=frozenset({"cluster-rca"}),
            readable_cluster_ids=frozenset({"cluster-inventory", "cluster-rca"}),
        )

    monkeypatch.setattr("domains.activity.router.resolve_authorized_timeline_scope", resolve_scope)
    app = FastAPI()
    app.include_router(activity_router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(user_id="user-a")
    app.dependency_overrides[get_db] = _ActivityDb
    client = TestClient(app)
    operation = app.openapi()["paths"]["/activity/overview"]["get"]
    assert operation["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/ActivityOverviewResponse"
    }

    response = client.get(
        "/activity/overview",
        params={"from": 0, "to": DAY_MS, "bucket": DAY_MS},
    )

    assert response.status_code == 200
    assert response.json()["buckets"][0] == {
        "from_ms": 0,
        "to_ms": DAY_MS,
        "deployments": 1,
        "alerts": 2,
        "critical": 1,
    }
    assert response.headers["cache-control"] == "no-store"
    assert (
        client.get(
            "/activity/overview",
            params={"from": 0, "to": 31 * DAY_MS, "bucket": DAY_MS},
        ).status_code
        == 422
    )
