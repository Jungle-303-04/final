"""Large-history query and online-index regressions for bootstrap diagnostics."""

from __future__ import annotations

from contextlib import contextmanager, redirect_stdout
from datetime import UTC, datetime
from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from alembic import command
from domains.timeline.models import TimelineLedgerEvent
from domains.timeline.repository import (
    TimelineLedgerRepository,
    _timeline_diagnostics_statement,
)

ROOT = Path(__file__).resolve().parents[1]
REVISION = "20260718_0200"
DOWN_REVISION = "20260718_0100"
HEAD_REVISION = "20260722_0610"
INDEX_NAME = "ix_timeline_events_diagnostics"


def _sql(workspace_id: str) -> str:
    compiled = _timeline_diagnostics_statement(workspace_id).compile(
        dialect=postgresql.dialect(),
        compile_kwargs={"literal_binds": True},
    )
    return " ".join(str(compiled).casefold().split())


def _config(monkeypatch: Any) -> Config:
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


def test_timeline_diagnostics_large_history_uses_bounded_index_probes() -> None:
    sql = _sql("workspace-large")

    assert "coalesce(timeline_event_cursors.last_sequence, 0) as event_count" in sql
    assert "count(" not in sql
    assert "min(" not in sql
    assert "max(" not in sql
    assert sql.count("from timeline_events") == 2
    assert sql.count("limit 1") == 2
    assert sql.count("timeline_events.workspace_id = 'workspace-large'") == 2
    assert "order by timeline_events.occurred_at, timeline_events.sequence" in sql
    assert "order by timeline_events.occurred_at desc, timeline_events.sequence desc" in sql


def test_timeline_diagnostics_preserves_exact_append_only_contract_in_one_statement() -> None:
    observed_at = datetime(2026, 7, 18, 5, 0, tzinfo=UTC)
    statements: list[Any] = []

    class StubMappings:
        def one(self) -> dict[str, object]:
            return {
                "event_count": 5_000_000,
                "oldest_occurred_at": observed_at,
                "newest_occurred_at": observed_at,
                "high_water_sequence": 5_000_000,
                "retained_from_sequence": 17,
            }

    class StubResult:
        def mappings(self) -> StubMappings:
            return StubMappings()

    class StubConnection:
        def execute(self, statement: Any) -> StubResult:
            statements.append(statement)
            return StubResult()

    @contextmanager
    def connection():
        yield StubConnection()

    repository = object.__new__(TimelineLedgerRepository)
    repository.connection = connection  # type: ignore[method-assign]

    assert repository.timeline_diagnostics("workspace-large") == {
        "event_count": 5_000_000,
        "oldest_occurred_at": observed_at,
        "newest_occurred_at": observed_at,
        "high_water_sequence": 5_000_000,
        "retained_from_sequence": 17,
    }
    assert len(statements) == 1


def test_timeline_diagnostics_index_matches_both_time_bound_probes() -> None:
    indexes = {index.name: index for index in TimelineLedgerEvent.__table__.indexes}
    index_sql = " ".join(
        str(CreateIndex(indexes[INDEX_NAME]).compile(dialect=postgresql.dialect()))
        .casefold()
        .split()
    )

    assert (
        f"create index {INDEX_NAME} on timeline_events (workspace_id, occurred_at, sequence)"
    ) in index_sql


def test_timeline_diagnostics_index_migration_is_online_safe(monkeypatch: Any) -> None:
    config = _config(monkeypatch)
    script = ScriptDirectory.from_config(config)

    assert tuple(script.get_heads()) == (HEAD_REVISION,)
    assert script.get_revision(REVISION).down_revision == DOWN_REVISION

    upgrade = _render(config, "upgrade", f"{DOWN_REVISION}:{REVISION}")
    assert (
        f"create index concurrently if not exists {INDEX_NAME} "
        "on timeline_events (workspace_id, occurred_at, sequence)"
    ) in upgrade
    assert "invalid concurrent index remnant" in upgrade
    assert "set lock_timeout = '30s'" in upgrade
    assert "reset lock_timeout" in upgrade

    downgrade = _render(config, "downgrade", f"{REVISION}:{DOWN_REVISION}")
    assert f"drop index concurrently if exists {INDEX_NAME}" in downgrade
    assert "set lock_timeout = '30s'" in downgrade
    assert "reset lock_timeout" in downgrade


def test_timeline_diagnostics_index_retries_only_lock_timeouts() -> None:
    spec = spec_from_file_location(
        "timeline_diagnostics_index_migration",
        ROOT / "alembic" / "versions" / "20260718_0200_timeline_diagnostics_index.py",
    )
    assert spec is not None and spec.loader is not None
    migration = module_from_spec(spec)
    spec.loader.exec_module(migration)

    class LockTimeout:
        sqlstate = "55P03"

    class UniqueViolation:
        sqlstate = "23505"

    assert migration._is_lock_timeout(  # noqa: SLF001
        migration.sa.exc.OperationalError("create index", {}, LockTimeout())
    )
    assert not migration._is_lock_timeout(  # noqa: SLF001
        migration.sa.exc.OperationalError("create index", {}, UniqueViolation())
    )
    assert migration.CREATE_RETRY_DELAYS == (2.0, 4.0, 8.0)
