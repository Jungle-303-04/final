from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.dialects import postgresql

from domains.cost.repository import cost_evidence_statement


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
