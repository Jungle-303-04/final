"""Timeline pins must remain on the single production Alembic chain."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260716_0400"
DOWN_REVISION = "20260715_0300"
COMMAND_CONTROL_REVISION = "20260716_0500"


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


def test_timeline_pins_migration_creates_owner_revision_and_immutable_subject_storage(
    monkeypatch,
) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    current_head = script.get_current_head()
    assert tuple(script.get_heads()) == (current_head,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION
    assert script.get_revision(COMMAND_CONTROL_REVISION).down_revision == REVISION
    lineage = tuple(script.iterate_revisions(current_head, DOWN_REVISION))
    lineage_ids = tuple(revision.revision for revision in lineage)
    assert REVISION in lineage_ids
    assert lineage_ids[
        lineage_ids.index(COMMAND_CONTROL_REVISION) : lineage_ids.index(REVISION) + 1
    ] == (
        COMMAND_CONTROL_REVISION,
        REVISION,
    )
    assert all(
        revision.down_revision == next_revision.revision
        for revision, next_revision in zip(lineage, lineage[1:], strict=False)
    )
    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create table timeline_pin_sets" in sql
    assert "create table timeline_pins" in sql
    assert "primary key (workspace_id, user_id)" in sql
    assert "unique (workspace_id, user_id, subject_key)" in sql
    assert "create index ix_timeline_pins_owner" in sql


def test_timeline_pins_migration_downgrade_removes_owner_index_before_tables(monkeypatch) -> None:
    config = _config(monkeypatch)
    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")

    index = "drop index ix_timeline_pins_owner"
    pins = "drop table timeline_pins"
    pin_sets = "drop table timeline_pin_sets"
    assert index in sql and pins in sql and pin_sets in sql
    assert sql.index(index) < sql.index(pins) < sql.index(pin_sets)
