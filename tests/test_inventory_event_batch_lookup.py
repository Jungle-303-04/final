"""Bounded lookup for the previous authoritative Kubernetes Event fact cut."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.inventory.repository import (
    KUBERNETES_EVENT_CAPTURE_CANDIDATE_LIMIT,
    latest_complete_kubernetes_event_batch,
)


def _capture(*, complete: bool, reason: str) -> dict[str, object]:
    return {
        "complete": complete,
        "truncated": False,
        "reason": reason,
        "freshness": {
            "observed_at": "2026-07-21T00:00:00Z",
            "max_age_seconds": 120,
        },
        "coverage": {
            "scope": "all_namespaces",
            "pagination": "continue",
            "event_count": 1,
        },
    }


def _snapshot_summary(capture: Mapping[str, object]) -> dict[str, object]:
    return {
        "summary": {
            "kubernetes_event_capture": dict(capture),
            "kubernetes_event_facts": [
                {
                    "uid": "event-1",
                    "api_version": "v1",
                    "namespace": "payments",
                    "name": "checkout-unhealthy",
                    "type": "Warning",
                    "count": 2,
                    "last_occurrence_at": "2026-07-21T00:00:00Z",
                }
            ],
        }
    }


class _Result:
    def __init__(
        self,
        *,
        rows: list[dict[str, object]] | None = None,
        scalar: object = None,
    ) -> None:
        self._rows = rows or []
        self._scalar = scalar

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, object]]:
        return self._rows

    def scalar_one_or_none(self) -> object:
        return self._scalar


class _Connection:
    def __init__(
        self,
        *,
        candidates: list[dict[str, object]],
        summaries: Mapping[str, object] | None = None,
    ) -> None:
        self.candidates = candidates
        self.summaries = summaries or {}
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        sql = str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        if "cluster_inventory_snapshots.summary" not in sql:
            return _Result(rows=self.candidates)
        snapshot_id = next(
            (
                str(candidate["snapshot_id"])
                for candidate in self.candidates
                if f"= '{candidate['snapshot_id']}'" in sql
            ),
            "",
        )
        return _Result(scalar=self.summaries.get(snapshot_id))


def _sql(statement: Any) -> str:
    return " ".join(
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .split()
    )


def test_latest_complete_event_batch_uses_bounded_projection_then_one_pk_body_read() -> None:
    incomplete = _capture(complete=False, reason="timeout")
    authoritative = _capture(complete=True, reason="complete")
    connection = _Connection(
        candidates=[
            {"snapshot_id": "snapshot-new-incomplete", "event_capture": incomplete},
            {"snapshot_id": "snapshot-good", "event_capture": authoritative},
        ],
        summaries={"snapshot-good": _snapshot_summary(authoritative)},
    )

    batch = latest_complete_kubernetes_event_batch(
        connection,
        workspace_id="workspace-a",
        cluster_id="cluster-a",
    )

    assert batch is not None
    assert batch.capture.authoritative is True
    assert [observation.uid for observation in batch.observations] == ["event-1"]
    assert len(connection.statements) == 2

    candidates_sql = _sql(connection.statements[0])
    assert "cluster_inventory_snapshots.summary" not in candidates_sql
    assert (
        "select cluster_inventory_snapshots.snapshot_id, cluster_inventory_snapshots.event_capture"
    ) in candidates_sql
    assert "cluster_inventory_snapshots.status != 'ignored_stale'" in candidates_sql
    assert "cluster_inventory_snapshots.event_capture is not null" in candidates_sql
    assert "cluster_inventory_snapshots.event_capture_observed_at is not null" in candidates_sql
    assert (
        "order by cluster_inventory_snapshots.event_capture_observed_at desc, "
        "cluster_inventory_snapshots.collected_at desc, "
        "cluster_inventory_snapshots.created_at desc, "
        "cluster_inventory_snapshots.snapshot_id desc"
    ) in candidates_sql
    assert f"limit {KUBERNETES_EVENT_CAPTURE_CANDIDATE_LIMIT}" in candidates_sql

    summary_sql = _sql(connection.statements[1])
    assert "select cluster_inventory_snapshots.summary" in summary_sql
    assert "cluster_inventory_snapshots.snapshot_id = 'snapshot-good'" in summary_sql
    assert "cluster_inventory_snapshots.workspace_id = 'workspace-a'" in summary_sql
    assert "cluster_inventory_snapshots.cluster_id = 'cluster-a'" in summary_sql
    assert "limit 1" in summary_sql


def test_latest_complete_event_batch_fails_closed_after_bounded_projection_window() -> None:
    connection = _Connection(
        candidates=[
            {
                "snapshot_id": f"snapshot-{index}",
                "event_capture": _capture(complete=False, reason="timeout"),
            }
            for index in range(KUBERNETES_EVENT_CAPTURE_CANDIDATE_LIMIT)
        ]
    )

    batch = latest_complete_kubernetes_event_batch(
        connection,
        workspace_id="workspace-a",
        cluster_id="cluster-a",
    )

    assert batch is None
    assert len(connection.statements) == 1
    assert "cluster_inventory_snapshots.summary" not in _sql(connection.statements[0])
