"""Active label facet lookup stays bounded and online-safe."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from alembic import command
from domains.inventory_filter.models import (
    InventoryResourceLabelVersion,
    InventoryResourceVersion,
)

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260722_0600"
DOWN_REVISION = "20260719_0500"
HEAD_REVISION = "20260722_0610"
INDEX_NAME = "ix_inventory_label_versions_active_lookup"
ACTIVE_VERSION_INDEX_NAME = "ix_inventory_versions_active_facets"


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


def test_active_label_lookup_model_is_covering() -> None:
    indexes = {index.name: index for index in InventoryResourceLabelVersion.__table__.indexes}
    sql = " ".join(
        str(CreateIndex(indexes[INDEX_NAME]).compile(dialect=postgresql.dialect()))
        .casefold()
        .split()
    )

    assert (
        f"create index {INDEX_NAME} on inventory_resource_label_versions "
        "(version_id, workspace_id) include (selector, key, value)"
    ) == sql

    version_indexes = {index.name: index for index in InventoryResourceVersion.__table__.indexes}
    version_sql = " ".join(
        str(
            CreateIndex(version_indexes[ACTIVE_VERSION_INDEX_NAME]).compile(
                dialect=postgresql.dialect()
            )
        )
        .casefold()
        .split()
    )
    assert (
        f"create index {ACTIVE_VERSION_INDEX_NAME} on inventory_resource_versions "
        "(workspace_id, cluster_id) include (version_id, inventory_key, resource_type, "
        "kind, namespace, name, health, search_text) where valid_to_revision is null"
    ) == version_sql


def test_active_label_lookup_migration_is_online_safe(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (HEAD_REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on inventory_resource_label_versions (version_id, workspace_id) "
        "include (selector, key, value)"
    ) in upgrade
    assert (
        f"create index concurrently if not exists {ACTIVE_VERSION_INDEX_NAME} "
        "on inventory_resource_versions (workspace_id, cluster_id) include "
        "(version_id, inventory_key, resource_type, kind, namespace, name, health, "
        "search_text) where valid_to_revision is null"
    ) in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert f"drop index concurrently if exists {ACTIVE_VERSION_INDEX_NAME}" in downgrade
