"""Inventory retention remains bounded, FK-safe, and online-safe."""

from __future__ import annotations

from contextlib import redirect_stdout
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql

from alembic import command
from domains.retention.repository import DemoRetentionRepository
from tests.test_demo_retention_repository import (
    retention_repository,
    statement_table_names,
)

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260722_0610"
DOWN_REVISION = "20260722_0600"


def _config(monkeypatch: Any) -> Config:
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


def test_revision_retention_uses_two_indexable_anti_joins_and_keeps_fk_order() -> None:
    recorded: list[Any] = []
    transactions: list[str] = []
    repository: DemoRetentionRepository = retention_repository(
        recorded,
        transactions,
        return_rows=True,
    )
    cutoff = datetime(2026, 7, 21, tzinfo=UTC)

    repository.delete_demo_data_older_than(
        cutoff,
        scopes=("projections",),
        limit=37,
    )

    names = statement_table_names(recorded)
    assert transactions == ["begin", "commit"]
    assert names.index("inventory_resource_label_versions") < names.index(
        "inventory_resource_versions"
    )
    assert names.index("inventory_resource_application_versions") < names.index(
        "inventory_resource_versions"
    )
    assert names.index("inventory_resource_versions") < names.index("inventory_filter_revisions")

    revision_delete = next(
        statement
        for statement in recorded
        if getattr(getattr(statement, "table", None), "name", None) == "inventory_filter_revisions"
    )
    compiled = revision_delete.compile(dialect=postgresql.dialect())
    sql = " ".join(str(compiled).casefold().split())

    assert sql.count("not (exists") == 2
    assert (
        "inventory_resource_versions.valid_from_revision = inventory_filter_revisions.revision_id"
    ) in sql
    assert (
        "inventory_resource_versions.valid_to_revision = inventory_filter_revisions.revision_id"
    ) in sql
    assert "valid_from_revision = inventory_filter_revisions.revision_id or" not in sql
    assert "inventory_filter_revisions.observed_at <" in sql
    assert "limit" in sql
    assert cutoff in compiled.params.values()
    assert 37 in compiled.params.values()


def test_inventory_retention_indexes_are_concurrent_partial_and_reversible(
    monkeypatch: Any,
) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade
    assert (
        "create index concurrently if not exists "
        "ix_inventory_versions_retention_valid_from "
        "on inventory_resource_versions (valid_from_revision)"
    ) in upgrade
    assert (
        "create index concurrently if not exists "
        "ix_inventory_versions_retention_valid_to "
        "on inventory_resource_versions (valid_to_revision) "
        "where valid_to_revision is not null"
    ) in upgrade
    assert (
        "create index concurrently if not exists "
        "ix_inventory_filter_revisions_retention "
        "on inventory_filter_revisions (observed_at, revision_id)"
    ) in upgrade
    assert upgrade.index("commit") < upgrade.index("create index concurrently")
    assert upgrade.index("create index concurrently") < upgrade.rindex("begin")

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    for index_name in (
        "ix_inventory_versions_retention_valid_from",
        "ix_inventory_versions_retention_valid_to",
        "ix_inventory_filter_revisions_retention",
    ):
        assert f"drop index concurrently if exists {index_name}" in downgrade
