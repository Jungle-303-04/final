"""PostgreSQL rendering coverage for the workspace Helm chart source registry."""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path
from types import ModuleType

from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260716_0900_helm_chart_sources.py"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("helm_chart_sources", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _render(function_name: str) -> str:
    migration = _migration()
    output = io.StringIO()
    context = MigrationContext.configure(
        url="postgresql://user:pass@localhost/test",
        opts={"as_sql": True, "output_buffer": output},
    )
    original = migration.op
    migration.op = Operations(context)
    try:
        getattr(migration, function_name)()
    finally:
        migration.op = original
    return output.getvalue().lower()


def test_chart_source_upgrade_is_workspace_scoped_and_secret_reference_only() -> None:
    migration = _migration()

    assert migration.revision == "20260716_0900"
    assert migration.down_revision == "20260716_0800"

    sql = _render("upgrade")

    assert "create table helm_chart_sources" in sql
    assert "foreign key(workspace_id) references workspaces (workspace_id)" in sql
    assert "uq_helm_chart_sources_workspace_provider_ref" in sql
    assert "uq_helm_chart_sources_workspace_name" in sql
    assert "ix_helm_chart_sources_workspace_updated" in sql
    assert "credential_ref text" in sql
    assert "credential_value" not in sql
    assert "encrypted_value" not in sql


def test_chart_source_downgrade_removes_index_before_table() -> None:
    sql = _render("downgrade")

    index = "drop index ix_helm_chart_sources_workspace_updated"
    table = "drop table helm_chart_sources"
    assert index in sql
    assert table in sql
    assert sql.index(index) < sql.index(table)
