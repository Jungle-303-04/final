"""Ordered Timeline coverage proof query and its online partial index stay aligned."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from alembic import command
from domains.inventory.models import ClusterInventorySnapshotRecord
from domains.inventory.repository import _timeline_coverage_statement
from packages.contracts.timeline import TimelineWindow

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260718_0400"
DOWN_REVISION = "20260718_0300"
INDEX_NAME = "ix_inventory_snapshots_timeline_capture_observed"
OLD_INDEX_NAME = "ix_inventory_snapshots_timeline_coverage"


def _config(monkeypatch) -> Config:
    database_url = "postgresql://user:pass@localhost/test"
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _render(config: Config, action: str, revision_range: str) -> str:
    output = StringIO()
    with redirect_stdout(output):
        getattr(command, action)(config, revision_range, sql=True)
    return " ".join(output.getvalue().casefold().split())


def _coverage_query_sql() -> str:
    statement = _timeline_coverage_statement(
        workspace_id="workspace-a",
        cluster_ids={"cluster-b", "cluster-a"},
        window=TimelineWindow(from_ms=1_000, to_ms=2_000),
    )
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


def test_timeline_coverage_partial_index_matches_predicate_and_order() -> None:
    indexes = {index.name: index for index in ClusterInventorySnapshotRecord.__table__.indexes}
    index_sql = " ".join(
        str(CreateIndex(indexes[INDEX_NAME]).compile(dialect=postgresql.dialect()))
        .casefold()
        .split()
    )
    query_sql = _coverage_query_sql()

    assert (
        f"create index {INDEX_NAME} on cluster_inventory_snapshots "
        "(workspace_id, cluster_id, event_capture_observed_at, collected_at, "
        "created_at, snapshot_id) where"
    ) in index_sql
    index_predicate = index_sql.partition(" where ")[2]
    scan_predicate = index_predicate.removesuffix(" and event_capture_observed_at is not null")
    unqualified_query_sql = query_sql.replace("cluster_inventory_snapshots.", "")
    assert unqualified_query_sql.count(scan_predicate) == 3
    assert index_predicate.endswith("event_capture_observed_at is not null")
    assert "cluster_id in ('cluster-a', 'cluster-b')" in query_sql
    assert "values ('cluster-a'), ('cluster-b')" in query_sql
    assert "left outer join lateral" in query_sql
    assert "join lateral" in query_sql
    assert query_sql.count("limit 1") == 2
    assert "union all" in query_sql
    assert "cluster_inventory_snapshots.event_capture_observed_at >=" in query_sql
    assert "cluster_inventory_snapshots.event_capture_observed_at <" in query_sql
    assert query_sql.count("['truncated']) = 'boolean'") == 2
    assert query_sql.count("->> 'truncated') = 'false'") == 1
    assert "cluster_inventory_snapshots.collected_at >=" not in query_sql
    assert "latest_timeline_coverage_recovery.snapshot_id is null" in query_sql
    assert "opening_timeline_coverage_gap" in query_sql
    assert (
        "order by bounded_timeline_coverage_rows.cluster_id asc, "
        "bounded_timeline_coverage_rows.event_capture_observed_at asc, "
        "bounded_timeline_coverage_rows.collected_at asc, "
        "bounded_timeline_coverage_rows.created_at asc, "
        "bounded_timeline_coverage_rows.snapshot_id asc"
    ) in query_sql


def test_timeline_coverage_partial_index_migration_is_online_safe(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        "alter table cluster_inventory_snapshots add column if not exists "
        "event_capture_observed_at timestamptz"
    ) in upgrade
    assert "pg_input_is_valid" in upgrade
    assert "set local time zone 'utc'" in upgrade
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on cluster_inventory_snapshots "
        "(workspace_id, cluster_id, event_capture_observed_at, collected_at, "
        "created_at, snapshot_id) where "
        "status != 'ignored_stale' "
        "and summary['summary']['kubernetes_event_capture'] is not null "
        "and event_capture_observed_at is not null"
    ) in upgrade
    assert f"drop index concurrently if exists {OLD_INDEX_NAME}" in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert f"create index concurrently if not exists {OLD_INDEX_NAME}" in downgrade
    assert (
        "alter table cluster_inventory_snapshots drop column if exists event_capture_observed_at"
    ) in downgrade
    assert "set lock_timeout = '5s'" in downgrade
    assert "reset lock_timeout" in downgrade
