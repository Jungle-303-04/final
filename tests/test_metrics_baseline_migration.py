"""Alembic coverage for create-all metric tables missing from the lineage."""

from __future__ import annotations

import importlib.util
import io
from pathlib import Path

from alembic.migration import MigrationContext
from alembic.operations import Operations

ROOT = Path(__file__).resolve().parents[1]
MIGRATION_PATH = ROOT / "alembic/versions/20260714_0200_metrics_tables.py"


def load_migration():
    spec = importlib.util.spec_from_file_location("metrics_tables_migration", MIGRATION_PATH)
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


def test_metrics_migration_is_the_single_additive_successor() -> None:
    module = load_migration()

    assert module.revision == "20260714_0200"
    assert module.down_revision == "20260713_2350"


def test_metrics_migration_upgrade_and_downgrade_cover_both_tables_and_index() -> None:
    upgrade = render("upgrade")
    downgrade = render("downgrade")

    assert "create table event_consumer_metrics" in upgrade
    assert "add column processing_duration_ms" in upgrade
    assert "primary key (consumer, subject)" in upgrade
    assert "create table ai_llm_invocation_metrics" in upgrade
    assert "ix_ai_llm_invocation_correlation_created" in upgrade
    assert "drop index ix_ai_llm_invocation_correlation_created" in downgrade
    assert "drop table ai_llm_invocation_metrics" in downgrade
    assert "drop table event_consumer_metrics" in downgrade
    assert "drop column processing_duration_ms" in downgrade
