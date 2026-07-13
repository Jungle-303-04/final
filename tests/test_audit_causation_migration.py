"""audit_log causation timeline migration의 양방향 SQL 계약."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_0140"
DOWN_REVISION = "20260710_0900"


def _config(monkeypatch) -> Config:
    database_url = "postgresql://user:pass@localhost/test"
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config()
    config.set_main_option("script_location", str(ROOT / "alembic"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def _render_offline_sql(config: Config, action: str, revision_range: str) -> str:
    output = StringIO()
    with redirect_stdout(output):
        getattr(command, action)(config, revision_range, sql=True)
    return " ".join(output.getvalue().lower().split())


def test_audit_causation_upgrade_offline_sql(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_revision(REVISION).down_revision == DOWN_REVISION
    assert script.get_revision("20260713_0655").down_revision == REVISION

    sql = _render_offline_sql(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    add_column = "alter table audit_log add column causation_id text;"
    create_index = (
        "create index concurrently if not exists "
        "ix_audit_log_correlation_id_created_at "
        "on audit_log (correlation_id, created_at);"
    )

    assert add_column in sql
    assert create_index in sql
    assert sql.index(add_column) < sql.index(create_index)


def test_audit_causation_downgrade_offline_sql(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render_offline_sql(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    drop_index = "drop index concurrently if exists ix_audit_log_correlation_id_created_at;"
    drop_column = "alter table audit_log drop column causation_id;"

    assert drop_index in sql
    assert drop_column in sql
    assert sql.index(drop_index) < sql.index(drop_column)
