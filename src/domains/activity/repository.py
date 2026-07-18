"""Bounded W4 activity aggregates over persisted product facts."""

from __future__ import annotations

from collections.abc import Collection
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import BigInteger, cast, func, select

from domains.alert.models import AlertEvent
from domains.dashboard.models import RcaTimeline
from domains.gitops.models import WorkflowRun
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import WorkflowRunStatus
from packages.storage.engine import DatabaseConnection


class ActivityOverviewRepository(DatabaseConnection):
    """Aggregate deployments, alerts, and critical incidents without raw-event fan-out."""

    def activity_overview(
        self,
        *,
        workspace_id: str,
        deployment_application_ids: Collection[str],
        alert_cluster_ids: Collection[str],
        incident_cluster_ids: Collection[str],
        from_ms: int,
        to_ms: int,
        bucket_ms: int,
    ) -> list[JsonObject]:
        deployment_ids = tuple(sorted(set(deployment_application_ids)))
        alert_ids = tuple(sorted(set(alert_cluster_ids)))
        incident_ids = tuple(sorted(set(incident_cluster_ids)))
        start = datetime.fromtimestamp(from_ms / 1_000, tz=UTC)
        end = datetime.fromtimestamp(to_ms / 1_000, tz=UTC)
        series: dict[str, dict[int, int]] = {
            "deployments": {},
            "alerts": {},
            "critical": {},
        }
        with self.connection() as conn:
            if deployment_ids:
                run = WorkflowRun.__table__
                series["deployments"] = _series_counts(
                    conn,
                    _bucketed_count_statement(
                        timestamp=run.c.updated_at,
                        from_ms=from_ms,
                        bucket_ms=bucket_ms,
                        predicates=(
                            run.c.workspace_id == workspace_id,
                            run.c.application_id.in_(deployment_ids),
                            run.c.status.in_(
                                (
                                    WorkflowRunStatus.FAILED.value,
                                    WorkflowRunStatus.SUCCEEDED.value,
                                )
                            ),
                            run.c.updated_at >= start,
                            run.c.updated_at < end,
                        ),
                    ),
                )

            if alert_ids:
                alert = AlertEvent.__table__
                series["alerts"] = _series_counts(
                    conn,
                    _bucketed_count_statement(
                        timestamp=alert.c.fired_at,
                        from_ms=from_ms,
                        bucket_ms=bucket_ms,
                        predicates=(
                            alert.c.workspace_id == workspace_id,
                            alert.c.subject["cluster"].astext.in_(alert_ids),
                            alert.c.fired_at >= start,
                            alert.c.fired_at < end,
                        ),
                    ),
                )

            if incident_ids:
                incident = RcaTimeline.__table__
                series["critical"] = _series_counts(
                    conn,
                    _bucketed_count_statement(
                        timestamp=incident.c.created_at,
                        from_ms=from_ms,
                        bucket_ms=bucket_ms,
                        predicates=(
                            incident.c.workspace_id == workspace_id,
                            incident.c.cluster_id.in_(incident_ids),
                            incident.c.incident_id.is_not(None),
                            func.lower(incident.c.severity) == "critical",
                            incident.c.created_at >= start,
                            incident.c.created_at < end,
                        ),
                    ),
                )

        buckets = []
        bucket_count = (to_ms - from_ms + bucket_ms - 1) // bucket_ms
        for index in range(bucket_count):
            bucket_from = from_ms + index * bucket_ms
            buckets.append(
                {
                    "from_ms": bucket_from,
                    "to_ms": min(bucket_from + bucket_ms, to_ms),
                    "deployments": series["deployments"].get(index, 0),
                    "alerts": series["alerts"].get(index, 0),
                    "critical": series["critical"].get(index, 0),
                }
            )
        return buckets


def _bucketed_count_statement(
    *,
    timestamp: Any,
    from_ms: int,
    bucket_ms: int,
    predicates: tuple[Any, ...],
) -> Any:
    occurred_ms = func.extract("epoch", timestamp) * 1_000
    bucket_index = cast(
        func.floor((occurred_ms - from_ms) / bucket_ms),
        BigInteger,
    ).label("bucket_index")
    return (
        select(bucket_index, func.count().label("count"))
        .where(*predicates)
        .group_by(bucket_index)
        .order_by(bucket_index)
    )


def _series_counts(conn: Any, statement: Any) -> dict[int, int]:
    return {
        int(row["bucket_index"]): int(row["count"])
        for row in conn.execute(statement).mappings().all()
    }
