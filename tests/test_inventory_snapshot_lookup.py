"""Query-shape regression tests for latest agent inventory observations."""

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
from domains.inventory.repository import _latest_inventory_snapshots_statement

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260718_0100"
DOWN_REVISION = "20260718_0010"
HEAD_REVISION = "20260718_0200"
INDEX_NAME = "ix_inventory_snapshots_live_scope_latest"


def _sql(workspace_id: str, cluster_ids: set[str]) -> str:
    statement = _latest_inventory_snapshots_statement(workspace_id, cluster_ids)
    compiled = statement.compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return " ".join(str(compiled).casefold().split())


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


def test_latest_snapshot_lookup_is_one_bounded_index_probe_per_cluster() -> None:
    sql = _sql("workspace-a", {"cluster-b", "cluster-a"})

    assert "values ('cluster-a'), ('cluster-b')" in sql
    assert "join lateral" in sql
    assert "cluster_inventory_snapshots.workspace_id = 'workspace-a'" in sql
    assert (
        "cluster_inventory_snapshots.cluster_id = requested_inventory_clusters.cluster_id"
    ) in sql
    assert "order by cluster_inventory_snapshots.created_at desc" in sql
    assert "cluster_inventory_snapshots.snapshot_id desc" in sql
    assert "limit 1" in sql
    assert "row_number" not in sql


def test_latest_snapshot_lookup_retains_live_inventory_boundary() -> None:
    sql = _sql("workspace-private", {"cluster-private"})

    assert "live_inventory" in sql
    assert "workspace-private" in sql
    assert "cluster-private" in sql


def test_live_snapshot_index_metadata_matches_lookup_order_and_predicate() -> None:
    indexes = {index.name: index for index in ClusterInventorySnapshotRecord.__table__.indexes}
    index_sql = " ".join(
        str(CreateIndex(indexes[INDEX_NAME]).compile(dialect=postgresql.dialect()))
        .casefold()
        .split()
    )

    assert (
        f"create index {INDEX_NAME} on cluster_inventory_snapshots "
        "(workspace_id, cluster_id, created_at desc, snapshot_id desc) where"
    ) in index_sql
    query_sql = _sql("workspace-a", {"cluster-a"}).replace("cluster_inventory_snapshots.", "")
    assert index_sql.partition(" where ")[2] in query_sql


def test_live_snapshot_index_migration_is_online_safe(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (HEAD_REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on cluster_inventory_snapshots "
        "(workspace_id, cluster_id, created_at desc, snapshot_id desc) where"
    ) in upgrade
    assert "live_inventory" in upgrade
    assert "invalid concurrent index remnant" in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert "set lock_timeout = '5s'" in downgrade
    assert "reset lock_timeout" in downgrade
