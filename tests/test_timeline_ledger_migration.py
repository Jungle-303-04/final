"""Timeline ledger schema migration must stay in the single production chain."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260715_0300"
DOWN_REVISION = "20260715_0270"


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


def test_timeline_ledger_migration_creates_replay_and_dedupe_storage(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_current_head() == REVISION
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create table timeline_event_cursors" in sql
    assert "create table timeline_events" in sql
    assert "unique (workspace_id, source_key)" in sql
    assert "create index ix_timeline_events_replay" in sql
    assert "create index ix_timeline_events_scope_time" in sql


def test_timeline_ledger_migration_downgrade_removes_indexes_before_tables(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    replay_index = "drop index ix_timeline_events_replay"
    scope_index = "drop index ix_timeline_events_scope_time"
    drop_events = "drop table timeline_events"
    drop_cursor = "drop table timeline_event_cursors"
    assert replay_index in sql
    assert scope_index in sql
    assert drop_events in sql
    assert drop_cursor in sql
    assert sql.index(replay_index) < sql.index(drop_events) < sql.index(drop_cursor)
