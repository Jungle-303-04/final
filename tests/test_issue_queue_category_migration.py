"""Additive RCA issue category projection migration contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.dashboard.models import RcaTimeline

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260717_0715"
DOWN_REVISION = "20260716_1100"
INDEX_NAME = "ix_rca_timeline_issue_category"


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


def test_category_projection_model_and_revision_are_additive(monkeypatch) -> None:
    table = RcaTimeline.__table__
    index = next(item for item in table.indexes if item.name == INDEX_NAME)
    script = ScriptDirectory.from_config(_config(monkeypatch))

    assert table.c.category.nullable is True
    assert table.c.category_complete.nullable is False
    assert str(table.c.category_complete.server_default.arg).lower() == "false"
    assert tuple(column.name for column in index.columns) == (
        "workspace_id",
        "category",
        "updated_at",
        "id",
    )
    assert str(index.dialect_options["postgresql"]["where"]).lower() == (
        "category_complete is true"
    )
    assert script.get_heads() == [REVISION]
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION


def test_category_projection_upgrade_and_downgrade_are_reversible(monkeypatch) -> None:
    config = _config(monkeypatch)
    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")

    assert "alter table rca_timeline add column category text;" in upgrade
    assert (
        "alter table rca_timeline add column category_complete boolean default false not null;"
        in upgrade
    )
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on rca_timeline (workspace_id, category, updated_at desc, id desc) "
        "where category_complete is true"
    ) in upgrade
    assert f"drop index concurrently if exists {INDEX_NAME};" in downgrade
    assert "alter table rca_timeline drop column category_complete;" in downgrade
    assert "alter table rca_timeline drop column category;" in downgrade
