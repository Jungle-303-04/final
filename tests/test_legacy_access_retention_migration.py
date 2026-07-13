"""Migration coverage for retired live access-row retention."""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260714_0345_legacy_access_retention.py"


def load_migration():
    spec = importlib.util.spec_from_file_location("legacy_access_retention", MIGRATION_PATH)
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
    return buffer.getvalue().lower()


def test_legacy_access_retention_follows_the_metrics_revision() -> None:
    module = load_migration()

    assert module.revision == "20260714_0345"
    assert module.down_revision == "20260714_0200"


def test_legacy_access_retention_matches_historical_live_table_shapes() -> None:
    upgrade = render("upgrade")
    downgrade = render("downgrade")

    assert "create table workspace_members" in upgrade
    assert "unique (workspace_id, user_id)" in upgrade
    assert "foreign key(user_id) references user_accounts (user_id)" in upgrade
    assert "create table resource_access_grants" in upgrade
    assert "unique (workspace_id, subject_type, subject_id, resource_type, resource_id)" in upgrade
    assert "permissions jsonb not null" in upgrade
    assert downgrade.index("drop table resource_access_grants") < downgrade.index(
        "drop table workspace_members"
    )


def test_legacy_access_tables_remain_outside_active_orm_metadata() -> None:
    source = (ROOT / "src/domains/identity/models.py").read_text(encoding="utf-8")

    assert "class WorkspaceMember(" not in source
    assert "class ResourceAccessGrant(" not in source
    assert '__tablename__ = "workspace_members"' not in source
    assert '__tablename__ = "resource_access_grants"' not in source
