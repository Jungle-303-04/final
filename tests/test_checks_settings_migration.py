"""Checks settings remain on the single production Alembic lineage."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
HEAD_REVISION = "20260718_0200"
REVISION = "20260717_1915"
DOWN_REVISION = "20260717_1810"


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


def test_checks_settings_migration_creates_user_workspace_revision_authority(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (HEAD_REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION
    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create table user_checks_settings" in sql
    assert "primary key (workspace_id, user_id)" in sql
    assert "policy jsonb not null" in sql
    assert "invalidation_generation bigint not null" in sql


def test_checks_settings_migration_downgrade_removes_only_owned_table(monkeypatch) -> None:
    config = _config(monkeypatch)
    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")

    assert "drop table user_checks_settings" in sql
