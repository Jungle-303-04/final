from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260716_1100"
DOWN_REVISION = "20260716_1000"


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


def test_change_timeline_ledger_migration_adds_bounded_read_indexes(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "add column if not exists change_ledger_epoch text" in sql
    assert "set lock_timeout = '5s'" in sql
    assert "reset lock_timeout" in sql
    assert "drop index concurrently if exists ix_timeline_events_inventory_changes" not in sql
    assert "raise exception" in sql
    assert "invalid concurrent index remnant" in sql
    assert "create index concurrently if not exists ix_timeline_events_inventory_changes" in sql
    assert "on timeline_events (workspace_id, cluster_id, occurred_at, event_id)" in sql
    assert "source = 'inventory'" in sql
    assert "event_type in ('add', 'update', 'delete')" in sql
    assert "ix_inventory_versions_event_lookup" not in sql
    assert (
        "create index concurrently if not exists ix_inventory_filter_revisions_change_coverage"
    ) in sql
    assert (
        "on inventory_filter_revisions "
        "(workspace_id, cluster_id, change_ledger_epoch, resources_complete, "
        "observed_at, revision_id)"
    ) in sql
    assert sql.index("commit") < sql.index("create index concurrently") < sql.rindex("begin")
    assert sql.index("set lock_timeout") < sql.index("create index concurrently")
    assert sql.index("create index concurrently") < sql.index("reset lock_timeout")
    source = (ROOT / "alembic/versions/20260716_1100_change_timeline_ledger_indexes.py").read_text()
    assert "indisvalid" in source
    assert "current_schema()" in source
    assert "finally:" in source


def test_change_timeline_ledger_migration_drops_only_its_indexes(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert "drop index concurrently if exists ix_inventory_filter_revisions_change_coverage" in sql
    assert "ix_inventory_versions_event_lookup" not in sql
    assert "drop index concurrently if exists ix_timeline_events_inventory_changes" in sql
    assert "drop column if exists change_ledger_epoch" in sql
    assert sql.index("set lock_timeout") < sql.index("drop index concurrently")
    assert sql.index("drop index concurrently") < sql.index("reset lock_timeout")
