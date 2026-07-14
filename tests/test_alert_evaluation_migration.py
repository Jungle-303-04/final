"""Alert evaluation ledger migration and deployment-head contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260715_0215"
DOWN_REVISION = "20260715_0145"


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


def test_alert_evaluation_upgrade_is_the_single_head(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert len(script.get_heads()) == 1
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create table alert_events" in sql
    assert "create table alert_rule_target_states" in sql
    assert "foreign key(rule_id) references alert_rules (rule_id) on delete cascade" in sql
    assert "create unique index uq_alert_events_active_subject" in sql
    assert "where status in ('firing', 'acked')" in sql


def test_alert_evaluation_downgrade_removes_state_before_event_ledger(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert sql.index("drop table alert_rule_target_states") < sql.index("drop table alert_events")
