from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.target.models import EvidenceWindow

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260717_2000"
DOWN_REVISION = "20260717_1915"
INDEX_NAME = "ix_evidence_windows_workspace_cluster_updated"


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
    return " ".join(output.getvalue().casefold().split())


def test_cost_evidence_index_matches_the_bounded_repository_order() -> None:
    indexes = {index.name: index for index in EvidenceWindow.__table__.indexes}
    assert tuple(column.name for column in indexes[INDEX_NAME].columns) == (
        "workspace_id",
        "cluster_id",
        "updated_at",
    )


def test_cost_evidence_index_upgrade_and_downgrade_are_online_safe(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert "create index concurrently if not exists" in upgrade
    assert f"{INDEX_NAME} on evidence_windows (workspace_id, cluster_id, updated_at)" in upgrade
    assert "invalid concurrent index remnant" in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert "set lock_timeout = '5s'" in downgrade
    assert "reset lock_timeout" in downgrade
