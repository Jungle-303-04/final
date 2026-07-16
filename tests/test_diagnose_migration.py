"""Diagnose persistence must remain on the single production Alembic chain."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260716_0600"
DOWN_REVISION = "20260716_0500"


def _config(monkeypatch) -> Config:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/test")
    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", "postgresql://user:pass@localhost/test")
    return config


def _render(config: Config, action: str, revision_range: str) -> str:
    output = StringIO()
    with redirect_stdout(output):
        getattr(command, action)(config, revision_range, sql=True)
    return " ".join(output.getvalue().lower().split())


def test_diagnose_migration_creates_durable_run_event_and_consent_storage(
    monkeypatch,
) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION
    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create table diagnose_runs" in sql
    assert "create table diagnose_event_cursors" in sql
    assert "create table diagnose_events" in sql
    assert "create table diagnose_consents" in sql
    assert "create unique index ux_diagnose_runs_active_deduplication" in sql
    assert "where active is true" in sql
    assert "create index ix_diagnose_events_replay" in sql
    assert "foreign key(run_id) references diagnose_runs (run_id) on delete cascade" in sql


def test_diagnose_migration_downgrade_removes_indexes_before_tables(monkeypatch) -> None:
    config = _config(monkeypatch)
    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")

    replay_index = "drop index ix_diagnose_events_replay"
    events = "drop table diagnose_events"
    cursors = "drop table diagnose_event_cursors"
    runs = "drop table diagnose_runs"
    assert replay_index in sql and events in sql and cursors in sql and runs in sql
    assert sql.index(replay_index) < sql.index(events) < sql.index(cursors) < sql.index(runs)
