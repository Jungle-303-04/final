"""Production composition guards for retained Timeline reads."""

from __future__ import annotations

from domains.timeline.repository import TimelineLedgerRepository
from packages.storage.database import Database


def test_production_database_composition_exposes_retained_timeline_overview() -> None:
    """Auto-discovery must keep the overview method on the real gateway repository."""
    assert issubclass(Database, TimelineLedgerRepository)
    assert callable(getattr(Database, "timeline_overview", None))


def test_production_database_instance_exposes_snapshot_stream_and_overview_reads(
    monkeypatch,
) -> None:
    """Database construction creates no network connection but proves runtime MRO wiring."""
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    database = Database()
    try:
        assert isinstance(database, TimelineLedgerRepository)
        assert callable(database.snapshot_timeline_events)
        assert callable(database.replay_timeline_events)
        assert callable(database.timeline_overview)
    finally:
        database.dispose()
