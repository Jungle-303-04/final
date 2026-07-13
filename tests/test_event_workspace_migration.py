"""event outbox와 audit workspace 귀속 migration 양방향 계약."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_0655"
DOWN_REVISION = "20260713_0140"


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


def test_event_workspace_upgrade_sql_and_autocommit_boundary(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    add_outbox = "alter table outbox add column if not exists workspace_id text;"
    add_audit = "alter table audit_log add column if not exists workspace_id text;"
    drop_stale_index = (
        "drop index concurrently if exists ix_audit_log_workspace_id_correlation_id_created_at;"
    )
    create_index = (
        "create index concurrently if not exists "
        "ix_audit_log_workspace_id_correlation_id_created_at "
        "on audit_log (workspace_id, correlation_id, created_at);"
    )

    assert add_outbox in sql
    assert add_audit in sql
    assert drop_stale_index in sql
    assert create_index in sql
    assert sql.index(add_outbox) < sql.index(add_audit)
    assert sql.index(add_audit) < sql.index("commit;")
    assert sql.index("commit;") < sql.index(drop_stale_index) < sql.index(create_index)


def test_event_workspace_downgrade_sql(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert (
        "drop index concurrently if exists ix_audit_log_workspace_id_correlation_id_created_at;"
    ) in sql
    drop_audit = "alter table audit_log drop column if exists workspace_id;"
    drop_outbox = "alter table outbox drop column if exists workspace_id;"
    assert drop_audit in sql
    assert drop_outbox in sql
    assert "commit;" in sql
    assert sql.index("drop index concurrently") < sql.index(drop_audit) < sql.index(drop_outbox)
