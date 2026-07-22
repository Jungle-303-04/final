"""Workspace-wide inventory filter projection migration contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.inventory_filter.models import (
    InventoryFilterRevision,
    InventoryResourceApplicationVersion,
    InventoryResourceLabelVersion,
    InventoryResourceVersion,
)

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_2215"
DOWN_REVISION = "20260713_0820"
TABLES = (
    "inventory_filter_revisions",
    "inventory_resource_versions",
    "inventory_resource_label_versions",
    "inventory_resource_application_versions",
)
BASELINE_INDEXES = {
    "ix_inventory_filter_revisions_scope",
    "ix_inventory_filter_revisions_cluster",
    "ux_inventory_versions_active_key",
    "ix_inventory_versions_history",
    "ix_inventory_versions_scope_sort",
    "ix_inventory_versions_page_sort",
    "ix_inventory_versions_validity",
    "ix_inventory_versions_search",
    "ix_inventory_label_versions_facet",
    "ix_inventory_label_versions_selector",
    "ix_inventory_application_versions_lookup",
}
MODEL_INDEXES = BASELINE_INDEXES | {
    "ix_inventory_filter_revisions_change_coverage",
    "ix_inventory_versions_active_facets",
    "ix_inventory_label_versions_active_lookup",
}


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
    return " ".join(output.getvalue().lower().split())


def test_inventory_filter_model_shape_matches_projection_contract() -> None:
    revision = InventoryFilterRevision.__table__
    version = InventoryResourceVersion.__table__
    label = InventoryResourceLabelVersion.__table__
    application = InventoryResourceApplicationVersion.__table__

    assert tuple(revision.columns.keys()) == (
        "revision_id",
        "snapshot_id",
        "workspace_id",
        "cluster_id",
        "observed_at",
        "labels_complete",
        "resources_complete",
        "application_bindings_complete",
        "change_ledger_epoch",
        "partial_reason_codes",
        "created_at",
    )
    assert tuple(version.columns.keys()) == (
        "version_id",
        "inventory_key",
        "source_snapshot_id",
        "workspace_id",
        "cluster_id",
        "valid_from_revision",
        "valid_to_revision",
        "valid_to_observed_at",
        "content_hash",
        "resource_type",
        "api_version",
        "kind",
        "namespace",
        "name",
        "uid",
        "resource_version",
        "status",
        "health",
        "labels",
        "summary",
        "application_binding_complete",
        "search_text",
        "observed_at",
        "first_seen_at",
        "created_at",
    )
    assert tuple(label.primary_key.columns.keys()) == ("version_id", "key")
    assert tuple(application.primary_key.columns.keys()) == (
        "version_id",
        "application_id",
    )
    assert {
        index.name for table in (revision, version, label, application) for index in table.indexes
    } == MODEL_INDEXES


def test_inventory_filter_upgrade_backfills_honest_baseline(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_revision(REVISION) is not None
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    for table in TABLES:
        assert f"create table {table}" in sql

    assert "distinct on (workspace_id, cluster_id)" in sql
    assert "from cluster_inventory_snapshots" in sql
    assert "insert into inventory_filter_revisions" in sql
    assert "coalesce( summary -> 'summary' -> 'labels_complete' = 'true'::jsonb, false )" in sql
    assert "resources_completeness_unknown" in sql
    assert "insert into inventory_resource_versions" in sql
    assert "from cluster_inventory_resources" in sql
    assert "deleted_at is null" in sql
    assert "jsonb_each_text" in sql
    assert "insert into inventory_resource_label_versions" in sql
    assert "insert into inventory_resource_application_versions" in sql
    assert "from workflow_runs as run" in sql
    assert "join manifest_artifacts as artifact" in sql
    assert "application_binding_complete" in sql
    assert "search_text" in sql
    assert "lower(label.label_key || '=' || label.label_value)" in sql

    for name in BASELINE_INDEXES:
        assert f"index {name}" in sql
    assert "index concurrently" not in sql


def test_inventory_filter_downgrade_drops_indexes_and_tables(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert "drop index concurrently" not in sql

    expected_drop_order = tuple(reversed(TABLES))
    positions = [sql.index(f"drop table {table};") for table in expected_drop_order]
    assert positions == sorted(positions)
