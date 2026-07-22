from __future__ import annotations

import asyncio

from conftest import load_service


class StubDb:
    def __init__(self) -> None:
        self.calls: list[dict[str, int]] = []

    async def expire_stale_open_rca_incidents(
        self,
        max_age_days: int,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append({"max_age_days": max_age_days, "limit": limit})
        return [{"incident_id": "incident-1"}, {"incident_id": "incident-2"}]

    async def delete_stale_pre_incident_timeline(
        self,
        retention_hours: int,
        limit: int,
    ) -> int:
        self.calls.append({"retention_hours": retention_hours, "limit": limit})
        return 3

    async def resolve_recovered_ephemeral_incidents(
        self,
        grace_minutes: int,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append({"grace_minutes": grace_minutes, "limit": limit})
        return [{"incident_id": "incident-3"}]


def test_rca_timeline_janitor_expires_stale_open_incidents(monkeypatch) -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    db = StubDb()
    monkeypatch.setenv("RCA_OPEN_INCIDENT_EXPIRE_DAYS", "5")
    monkeypatch.setenv("RCA_OPEN_INCIDENT_EXPIRE_LIMIT", "50")

    count = asyncio.run(janitor.expire_stale_open_incidents(db))

    assert count == 2
    assert db.calls == [{"max_age_days": 5, "limit": 50}]


def test_rca_timeline_janitor_deletes_only_old_pre_incident_projection(monkeypatch) -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    db = StubDb()
    monkeypatch.setenv("RCA_PRE_INCIDENT_RETENTION_HOURS", "12")
    monkeypatch.setenv("RCA_PRE_INCIDENT_RETENTION_LIMIT", "250")

    count = asyncio.run(janitor.delete_stale_pre_incident_timeline(db))

    assert count == 3
    assert db.calls == [{"retention_hours": 12, "limit": 250}]


def test_rca_timeline_janitor_resolves_recovered_ephemeral_incidents(monkeypatch) -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    db = StubDb()
    monkeypatch.setenv("RCA_EPHEMERAL_INCIDENT_RESOLVE_MINUTES", "7")
    monkeypatch.setenv("RCA_EPHEMERAL_INCIDENT_RESOLVE_LIMIT", "75")

    count = asyncio.run(janitor.resolve_recovered_ephemeral_incidents(db))

    assert count == 1
    assert db.calls == [{"grace_minutes": 7, "limit": 75}]


def test_rca_timeline_janitor_refreshes_heartbeat_during_long_wait() -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    touches: list[object] = []

    async def scenario() -> None:
        await janitor.wait_for_next_sweep(
            asyncio.Event(),
            0.12,
            heartbeat_interval=0.02,
            touch=lambda: touches.append(object()),
        )

    asyncio.run(scenario())

    assert len(touches) >= 3


def test_incident_latest_snapshot_probe_is_index_order_aligned() -> None:
    """correlated 최신-스냅샷 probe 는 partial 인덱스 정렬(created_at, snapshot_id)을 쓴다.

    collected_at 정렬은 후보 행마다 클러스터 스냅샷 전체 top-N 정렬을 유발해
    (live EXPLAIN 3,507 buffers/probe) sweep 이 statement timeout 으로 CrashLoop 했다.
    """
    from sqlalchemy import select
    from sqlalchemy.dialects import postgresql

    from domains.dashboard.models import RcaTimeline
    from domains.dashboard.repository import latest_inventory_snapshot_id_for_incident

    probe = latest_inventory_snapshot_id_for_incident(RcaTimeline.__table__)
    sql = " ".join(str(select(probe).compile(dialect=postgresql.dialect())).casefold().split())

    assert "order by cluster_inventory_snapshots.created_at desc, " in sql
    assert "cluster_inventory_snapshots.snapshot_id desc" in sql
    assert "collected_at desc" not in sql
