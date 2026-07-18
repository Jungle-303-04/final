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
REVISION = "20260718_0300"
DOWN_REVISION = "20260718_0200"
INDEX_NAME = "ix_inventory_snapshots_timeline_coverage"


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
        "(workspace_id, cluster_id, collected_at, created_at, snapshot_id) where"
    ) in index_sql
    index_predicate = index_sql.partition(" where ")[2]
    assert index_predicate in query_sql.replace("cluster_inventory_snapshots.", "")
    assert "cluster_id in ('cluster-a', 'cluster-b')" in query_sql
    assert (
        "order by cluster_inventory_snapshots.cluster_id asc, "
        "cluster_inventory_snapshots.collected_at asc, "
        "cluster_inventory_snapshots.created_at asc, "
        "cluster_inventory_snapshots.snapshot_id asc"
    ) in query_sql


def test_timeline_coverage_partial_index_migration_is_online_safe(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on cluster_inventory_snapshots "
        "(workspace_id, cluster_id, collected_at, created_at, snapshot_id) where "
        "status != 'ignored_stale' "
        "and summary['summary']['kubernetes_event_capture'] is not null"
    ) in upgrade
    assert "invalid concurrent index remnant" in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert "set lock_timeout = '5s'" in downgrade
    assert "reset lock_timeout" in downgrade
