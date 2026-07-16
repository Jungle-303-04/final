"""PostgreSQL rendering coverage for command execution control migration."""

from __future__ import annotations

import importlib.util
import io
import re
from pathlib import Path
from types import ModuleType

from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260716_0500_command_execution_control.py"
REVISION = "20260716_0500"
DOWN_REVISION = "20260716_0400"
LEGACY_ATTEMPT_EXPRESSION = "'legacy:' || command_id || ':' || '1'"


def _migration() -> ModuleType:
    spec = importlib.util.spec_from_file_location("command_execution_control", MIGRATION_PATH)
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


def test_upgrade_renders_legacy_attempt_ids_without_sqlalchemy_binds() -> None:
    migration = _migration()

    assert migration.revision == REVISION
    assert migration.down_revision == DOWN_REVISION

    sql = _render("upgrade")

    assert "insert into agent_command_attempts" in sql
    assert sql.count(LEGACY_ATTEMPT_EXPRESSION) == 2
    assert "%(1)s" not in sql
    assert re.findall(r"%\([^)]+\)s", sql) == []


def test_downgrade_removes_control_and_attempt_storage_before_command_columns() -> None:
    sql = _render("downgrade")

    control_index = "drop index ix_command_control_actions_command"
    control_table = "drop table command_control_actions"
    attempt_index = "drop index ix_agent_command_attempts_command"
    attempt_table = "drop table agent_command_attempts"
    first_command_column = "alter table agent_commands drop column terminal_event_id"

    assert all(
        boundary in sql
        for boundary in (
            control_index,
            control_table,
            attempt_index,
            attempt_table,
            first_command_column,
        )
    )
    assert (
        sql.index(control_index)
        < sql.index(control_table)
        < sql.index(attempt_index)
        < sql.index(attempt_table)
        < sql.index(first_command_column)
    )
