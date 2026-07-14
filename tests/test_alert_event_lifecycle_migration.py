"""Alert event external-source and operator lifecycle migration contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260715_0230"
DOWN_REVISION = "20260715_0215"


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


def test_alert_event_lifecycle_upgrade_extends_the_single_chain(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert len(script.get_heads()) == 1
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    for column in ("rule_id", "rule_name", "observed_value", "threshold"):
        assert f"alter table alert_events alter column {column} drop not null" in sql
    for column in ("acknowledged_at", "acknowledged_by", "promoted_at", "promoted_by"):
        assert f"alter table alert_events add column {column}" in sql


def test_alert_event_lifecycle_downgrade_removes_operator_fields(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    for column in ("promoted_by", "promoted_at", "acknowledged_by", "acknowledged_at"):
        assert f"alter table alert_events drop column {column}" in sql
    for column in ("threshold", "observed_value", "rule_name", "rule_id"):
        assert f"alter table alert_events alter column {column} set not null" in sql
