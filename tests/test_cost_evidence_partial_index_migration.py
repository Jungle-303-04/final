from __future__ import annotations

from contextlib import redirect_stdout
from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from alembic import command
from domains.cost.repository import cost_evidence_statement
from domains.target.models import EvidenceWindow
from packages.contracts.cost.observations import COST_EVIDENCE_METRICS

ROOT = Path(__file__).resolve().parents[1]
HEAD_REVISION = "20260719_0500"
REVISION = "20260718_0010"
DOWN_REVISION = "20260717_2000"
INDEX_NAME = "ix_evidence_windows_cost_workspace_cluster_updated"
COST_EVIDENCE_KEYS = (
    "opencost_namespace_hourly_rate",
    "opencost_namespace_storage_rate",
    "opencost_pod_cpu_hourly_rate",
    "opencost_pod_memory_hourly_rate",
    "opencost_pod_cpu_allocation_use",
    "opencost_pod_memory_allocation_use",
)


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


def test_cost_evidence_partial_index_metadata_matches_the_bounded_query() -> None:
    indexes = {index.name: index for index in EvidenceWindow.__table__.indexes}
    index_sql = " ".join(
        str(CreateIndex(indexes[INDEX_NAME]).compile(dialect=postgresql.dialect()))
        .casefold()
        .split()
    )

    assert (
        f"create index {INDEX_NAME} on evidence_windows "
        "(workspace_id, cluster_id, updated_at desc, evidence_key desc) where"
    ) in index_sql
    assert index_sql.count("payload['metrics']['results'] ?") == len(COST_EVIDENCE_KEYS)
    for key in COST_EVIDENCE_KEYS:
        assert key in index_sql

    query_sql = " ".join(
        str(
            cost_evidence_statement(
                workspace_id="workspace-a",
                cluster_ids=("cluster-a",),
                since=datetime(2026, 7, 10, tzinfo=UTC),
                limit_per_cluster=480,
            ).compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        .casefold()
        .replace("evidence_windows.", "")
        .split()
    )
    index_predicate = index_sql.partition(" where ")[2]
    assert index_predicate in query_sql


def test_cost_evidence_partial_index_upgrade_and_downgrade_are_online_safe(
    monkeypatch,
) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)
    assert tuple(script.get_heads()) == (HEAD_REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION
    assert COST_EVIDENCE_KEYS == COST_EVIDENCE_METRICS

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        f"create index concurrently if not exists {INDEX_NAME} on evidence_windows "
        "(workspace_id, cluster_id, updated_at desc, evidence_key desc) where"
    ) in upgrade
    assert upgrade.count("payload['metrics']['results'] ?") == len(COST_EVIDENCE_KEYS)
    for key in COST_EVIDENCE_KEYS:
        assert key in upgrade
    assert "invalid concurrent index remnant" in upgrade
    assert "set lock_timeout = '5s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert "set lock_timeout = '5s'" in downgrade
    assert "reset lock_timeout" in downgrade
