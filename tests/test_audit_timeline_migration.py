"""audit correlation cluster resolver 인덱스 migration 계약."""

from __future__ import annotations

from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

from alembic import command
from domains.target.models import EvidenceWindow

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260713_0750"
DOWN_REVISION = "20260713_0655"
INDEX_NAME = "ix_evidence_windows_workspace_correlation_cluster"


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


def test_evidence_correlation_cluster_index_shape() -> None:
    indexes = {index.name: index for index in EvidenceWindow.__table__.indexes}

    assert tuple(column.name for column in indexes[INDEX_NAME].columns) == (
        "workspace_id",
        "correlation_id",
        "cluster_id",
    )


def test_evidence_correlation_cluster_index_upgrade_and_downgrade(monkeypatch) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == [REVISION]
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    drop_index = f"drop index concurrently if exists {INDEX_NAME};"
    create_index = (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on evidence_windows (workspace_id, correlation_id, cluster_id);"
    )
    assert "commit;" in upgrade
    assert drop_index in upgrade
    assert create_index in upgrade
    assert upgrade.index("commit;") < upgrade.index(drop_index) < upgrade.index(create_index)

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert "commit;" in downgrade
    assert drop_index in downgrade
    assert downgrade.index("commit;") < downgrade.index(drop_index)
