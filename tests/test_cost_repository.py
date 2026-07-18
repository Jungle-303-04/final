from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.dialects import postgresql

from domains.cost.observation_projection import cost_overview
from domains.cost.repository import (
    CostObservationRepository,
    cost_evidence_statement,
    cost_overview_evidence_statement,
)


def test_cost_evidence_batch_is_workspace_cluster_time_and_rank_bounded() -> None:
    statement = cost_evidence_statement(
        workspace_id="workspace-a",
        cluster_ids=("cluster-a", "cluster-b"),
        since=datetime(2026, 7, 10, tzinfo=UTC),
        limit_per_cluster=480,
    )
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    sql = " ".join(str(compiled).lower().split())

    assert "evidence_windows.workspace_id = 'workspace-a'" in sql
    assert "evidence_windows.cluster_id = 'cluster-a'" in sql
    assert "evidence_windows.cluster_id = 'cluster-b'" in sql
    assert "evidence_windows.updated_at >= '2026-07-10 00:00:00+00:00'" in sql
    assert "union all" in sql
    assert sql.count("limit 480") == 2
    assert "opencost_namespace_hourly_rate" in sql
    assert "opencost_namespace_storage_rate" in sql
    assert "opencost_pod_cpu_hourly_rate" in sql
    assert "opencost_pod_memory_hourly_rate" in sql
    assert "opencost_pod_cpu_allocation_use" in sql
    assert "opencost_pod_memory_allocation_use" in sql


def test_cost_overview_batch_selects_only_namespace_fragments_with_per_cluster_bound() -> None:
    statement = cost_overview_evidence_statement(
        workspace_id="workspace-a",
        cluster_ids=("cluster-a", "cluster-b"),
        since=datetime(2026, 7, 10, tzinfo=UTC),
        limit_per_cluster=480,
    )
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    sql = " ".join(str(compiled).lower().split())

    assert tuple(statement.selected_columns.keys()) == (
        "cluster_id",
        "updated_at",
        "payload_cluster_id",
        "namespace_hourly",
        "namespace_storage",
    )
    assert "evidence_windows.workspace_id = 'workspace-a'" in sql
    assert "evidence_windows.cluster_id = 'cluster-a'" in sql
    assert "evidence_windows.cluster_id = 'cluster-b'" in sql
    assert sql.count("limit 480") == 2
    assert "opencost_namespace_hourly_rate" in sql
    assert "opencost_namespace_storage_rate" in sql
    assert "opencost_pod_" not in sql
    assert "evidence_windows.payload as payload" not in sql


class _Result:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows


class _Connection:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows
        self.statement: Any = None

    def execute(self, statement: Any) -> _Result:
        self.statement = statement
        return _Result(self.rows)


def test_cost_overview_repository_rebuilds_only_the_projector_envelope() -> None:
    hourly = {"samples": [{"metric": {"namespace": "shop"}, "value": "1.25"}]}
    malformed_storage = {"samples": "invalid"}
    connection = _Connection(
        [
            {
                "cluster_id": "cluster-a",
                "updated_at": datetime(2026, 7, 17, 9, tzinfo=UTC),
                "payload_cluster_id": "cluster-a",
                "namespace_hourly": hourly,
                "namespace_storage": malformed_storage,
            }
        ]
    )

    @contextmanager
    def connect() -> Iterator[_Connection]:
        yield connection

    repository = object.__new__(CostObservationRepository)
    repository.connection = connect  # type: ignore[method-assign]

    rows = repository.list_cost_overview_evidence_windows(
        "workspace-a",
        ("cluster-a",),
        since=datetime(2026, 7, 10, tzinfo=UTC),
    )

    assert rows == [
        {
            "cluster_id": "cluster-a",
            "updated_at": datetime(2026, 7, 17, 9, tzinfo=UTC),
            "payload": {
                "cluster_id": "cluster-a",
                "metrics": {
                    "results": {
                        "opencost_namespace_hourly_rate": hourly,
                        "opencost_namespace_storage_rate": malformed_storage,
                    }
                },
            },
        }
    ]
    contexts = {
        "cluster-a": {
            "snapshot_revision": 8,
            "observed_at": "2026-07-17T09:00:00Z",
            "resources_complete": True,
            "labels_complete": True,
            "partial_reason_codes": [],
        }
    }
    broad_row = {
        "cluster_id": "cluster-a",
        "updated_at": datetime(2026, 7, 17, 9, tzinfo=UTC),
        "payload": {
            "cluster_id": "cluster-a",
            "unrelated": {"large": ["unused"]},
            "metrics": {
                "results": {
                    "opencost_namespace_hourly_rate": hourly,
                    "opencost_namespace_storage_rate": malformed_storage,
                    "opencost_pod_cpu_hourly_rate": {
                        "samples": [{"metric": {"pod": "shop-1"}, "value": "99"}]
                    },
                }
            },
        },
    }
    compact_projection = cost_overview(
        workspace_id="workspace-a",
        contexts=contexts,
        selected_cluster_ids=("cluster-a",),
        evidence_windows=rows,
    )
    broad_projection = cost_overview(
        workspace_id="workspace-a",
        contexts=contexts,
        selected_cluster_ids=("cluster-a",),
        evidence_windows=(broad_row,),
    )
    assert compact_projection.model_dump() == broad_projection.model_dump()
    assert compact_projection.summary.availability == "partial"


def test_cost_overview_repository_normalizes_scope_and_caps_each_cluster() -> None:
    connection = _Connection([])

    @contextmanager
    def connect() -> Iterator[_Connection]:
        yield connection

    repository = object.__new__(CostObservationRepository)
    repository.connection = connect  # type: ignore[method-assign]

    assert (
        repository.list_cost_overview_evidence_windows(
            "workspace-a",
            (" cluster-b ", "cluster-a", "cluster-a"),
            since=datetime(2026, 7, 10, tzinfo=UTC),
            limit_per_cluster=9999,
        )
        == []
    )
    sql = " ".join(
        str(
            connection.statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .lower()
        .split()
    )
    assert sql.index("cluster-a") < sql.index("cluster-b")
    assert sql.count("limit 480") == 2
