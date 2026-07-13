"""Issues filter projection schema and reversible migration contract."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.dashboard.models import RcaTimeline

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_2340"
DOWN_REVISION = "20260713_2215"
INDEXES = {
    "ix_rca_timeline_issue_page",
    "ix_rca_timeline_issue_severity",
    "ix_rca_timeline_issue_environment",
    "ix_rca_timeline_issue_applications",
}
LEGACY_INDEXES = {
    "ix_rca_timeline_scope_updated",
    "ix_rca_timeline_open_cluster",
    "ix_rca_timeline_workspace_incident",
}


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


def test_issue_filter_model_indexes_are_additive_and_query_shaped() -> None:
    table = RcaTimeline.__table__
    indexes = {index.name: index for index in table.indexes}

    assert set(indexes) >= INDEXES | LEGACY_INDEXES
    assert tuple(column.name for column in indexes["ix_rca_timeline_issue_page"].columns) == (
        "workspace_id",
        "updated_at",
        "id",
    )
    assert tuple(column.name for column in indexes["ix_rca_timeline_issue_severity"].columns) == (
        "workspace_id",
        "severity",
        "updated_at",
        "id",
    )
    assert tuple(
        column.name for column in indexes["ix_rca_timeline_issue_environment"].columns
    ) == ("workspace_id", "environment", "updated_at", "id")

    applications = indexes["ix_rca_timeline_issue_applications"]
    assert tuple(column.name for column in applications.columns) == ("application_ids",)
    assert applications.dialect_options["postgresql"]["using"] == "gin"


def test_issue_filter_upgrade_adds_columns_and_concurrent_indexes(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == [REVISION]
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    sql = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    for name, sql_type in (
        ("severity", "text"),
        ("environment", "text"),
        ("application_ids", "jsonb"),
        ("labels", "jsonb"),
    ):
        assert f"alter table rca_timeline add column {name} {sql_type};" in sql
    for name in (
        "severity_complete",
        "environment_complete",
        "application_ids_complete",
        "labels_complete",
    ):
        assert (
            f"alter table rca_timeline add column {name} boolean default false not null;"
        ) in sql

    expected_indexes = {
        "ix_rca_timeline_issue_page": ("on rca_timeline (workspace_id, updated_at desc, id desc)"),
        "ix_rca_timeline_issue_severity": (
            "on rca_timeline (workspace_id, severity, updated_at desc, id desc)"
        ),
        "ix_rca_timeline_issue_environment": (
            "on rca_timeline (workspace_id, environment, updated_at desc, id desc)"
        ),
        "ix_rca_timeline_issue_applications": ("on rca_timeline using gin (application_ids)"),
    }
    assert "commit;" in sql
    for name, definition in expected_indexes.items():
        drop = f"drop index concurrently if exists {name};"
        create = f"create index concurrently if not exists {name} {definition};"
        assert drop in sql
        assert create in sql
        assert sql.index("commit;") < sql.index(drop) < sql.index(create)

    for name in LEGACY_INDEXES:
        assert f"drop index concurrently if exists {name};" not in sql


def test_issue_filter_downgrade_drops_new_indexes_then_columns(monkeypatch) -> None:
    config = _config(monkeypatch)

    sql = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert "commit;" in sql
    for name in INDEXES:
        drop = f"drop index concurrently if exists {name};"
        assert drop in sql
        assert sql.index("commit;") < sql.index(drop)
    for name in LEGACY_INDEXES:
        assert f"drop index concurrently if exists {name};" not in sql

    first_column_drop = sql.index("alter table rca_timeline drop column")
    assert max(sql.index(f"drop index concurrently if exists {name};") for name in INDEXES) < (
        first_column_drop
    )
    for name in (
        "labels_complete",
        "application_ids_complete",
        "environment_complete",
        "severity_complete",
        "labels",
        "application_ids",
        "environment",
        "severity",
    ):
        assert f"alter table rca_timeline drop column {name};" in sql
