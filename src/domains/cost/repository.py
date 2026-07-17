"""Bounded reads for Cost observations persisted by outbound cluster agents."""

from __future__ import annotations

from collections.abc import Collection
from datetime import datetime
from typing import Any

from sqlalchemy import Select, func, or_, select

from domains.target.models import EvidenceWindow
from packages.contracts.cost.observations import (
    COST_NAMESPACE_HOURLY_METRIC,
    COST_NAMESPACE_STORAGE_METRIC,
    COST_POD_CPU_HOURLY_METRIC,
    COST_POD_CPU_USE_METRIC,
    COST_POD_MEMORY_HOURLY_METRIC,
    COST_POD_MEMORY_USE_METRIC,
    MAX_COST_TREND_POINTS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection

COST_EVIDENCE_METRICS = (
    COST_NAMESPACE_HOURLY_METRIC,
    COST_NAMESPACE_STORAGE_METRIC,
    COST_POD_CPU_HOURLY_METRIC,
    COST_POD_MEMORY_HOURLY_METRIC,
    COST_POD_CPU_USE_METRIC,
    COST_POD_MEMORY_USE_METRIC,
)


def _normalized_cluster_ids(cluster_ids: Collection[str] | None) -> tuple[str, ...]:
    return tuple(
        sorted(
            {
                cluster_id.strip()
                for cluster_id in cluster_ids or ()
                if isinstance(cluster_id, str) and cluster_id.strip()
            }
        )
    )


def cost_evidence_statement(
    *,
    workspace_id: str,
    cluster_ids: tuple[str, ...],
    since: datetime,
    limit_per_cluster: int,
) -> Select[Any]:
    """Return a window-ranked query so one noisy cluster cannot consume the batch."""

    table = EvidenceWindow.__table__
    metric_results = table.c.payload["metrics"]["results"]
    ranked = (
        select(
            table.c.evidence_key,
            table.c.workspace_id,
            table.c.cluster_id,
            table.c.window_start,
            table.c.payload,
            table.c.updated_at,
            func.row_number()
            .over(
                partition_by=table.c.cluster_id,
                order_by=(table.c.updated_at.desc(), table.c.evidence_key.desc()),
            )
            .label("recency_rank"),
        )
        .where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id.in_(cluster_ids),
            table.c.updated_at >= since,
            or_(*(metric_results.has_key(metric) for metric in COST_EVIDENCE_METRICS)),  # noqa: W601
        )
        .subquery("ranked_cost_evidence")
    )
    return (
        select(
            ranked.c.evidence_key,
            ranked.c.workspace_id,
            ranked.c.cluster_id,
            ranked.c.window_start,
            ranked.c.payload,
            ranked.c.updated_at,
        )
        .where(ranked.c.recency_rank <= limit_per_cluster)
        .order_by(ranked.c.updated_at.asc(), ranked.c.evidence_key.asc())
    )


class CostObservationRepository(DatabaseConnection):
    """Cost-specific evidence query with workspace, cluster, time, and volume bounds."""

    def list_cost_evidence_windows(
        self,
        workspace_id: str,
        cluster_ids: Collection[str] | None,
        *,
        since: datetime,
        limit_per_cluster: int = MAX_COST_TREND_POINTS,
    ) -> list[JsonObject]:
        normalized = _normalized_cluster_ids(cluster_ids)
        if not workspace_id or not normalized:
            return []
        bounded_limit = min(max(int(limit_per_cluster), 1), MAX_COST_TREND_POINTS)
        statement = cost_evidence_statement(
            workspace_id=workspace_id,
            cluster_ids=normalized,
            since=since,
            limit_per_cluster=bounded_limit,
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [dict(row) for row in rows]
