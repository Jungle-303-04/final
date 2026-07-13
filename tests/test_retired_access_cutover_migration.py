"""Fail-closed removal coverage for retired identity bridge tables."""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260714_0415_retired_access_cutover.py"


def load_migration():
    spec = importlib.util.spec_from_file_location("retired_access_cutover", MIGRATION_PATH)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def render(function_name: str) -> str:
    module = load_migration()
    buffer = io.StringIO()
    context = MigrationContext.configure(
        url="postgresql://user:pass@localhost/test",
        opts={"as_sql": True, "output_buffer": buffer},
    )
    operations = Operations(context)
    original = module.op
    module.op = operations
    try:
        getattr(module, function_name)()
    finally:
        module.op = original
    return " ".join(buffer.getvalue().lower().split())


def test_retired_access_cutover_is_the_single_head_successor() -> None:
    module = load_migration()

    assert module.revision == "20260714_0415"
    assert module.down_revision == "20260714_0345"


def test_upgrade_checks_both_tables_are_empty_before_dropping_them() -> None:
    upgrade = render("upgrade")

    workspace_check = "if exists (select 1 from workspace_members limit 1)"
    grants_check = "if exists (select 1 from resource_access_grants limit 1)"
    grants_drop = "drop table resource_access_grants"
    workspace_drop = "drop table workspace_members"
    assert workspace_check in upgrade
    assert grants_check in upgrade
    assert upgrade.index(workspace_check) < upgrade.index(grants_drop)
    assert upgrade.index(grants_check) < upgrade.index(grants_drop)
    assert upgrade.index(grants_drop) < upgrade.index(workspace_drop)
    assert "create table" not in upgrade


def test_downgrade_reconstructs_only_empty_bridge_table_shapes() -> None:
    downgrade = render("downgrade")

    assert "create table workspace_members" in downgrade
    assert "unique (workspace_id, user_id)" in downgrade
    assert "create table resource_access_grants" in downgrade
    assert (
        "unique (workspace_id, subject_type, subject_id, resource_type, resource_id)" in downgrade
    )
