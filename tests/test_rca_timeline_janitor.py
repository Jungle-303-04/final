from __future__ import annotations

import asyncio

from conftest import load_service


class FakeDb:
    def __init__(self) -> None:
        self.calls: list[dict[str, int]] = []

    async def expire_stale_open_rca_incidents(
        self,
        max_age_days: int,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append({"max_age_days": max_age_days, "limit": limit})
        return [{"incident_id": "incident-1"}, {"incident_id": "incident-2"}]


def test_rca_timeline_janitor_expires_stale_open_incidents(monkeypatch) -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    db = FakeDb()
    monkeypatch.setenv("RCA_OPEN_INCIDENT_EXPIRE_DAYS", "5")
    monkeypatch.setenv("RCA_OPEN_INCIDENT_EXPIRE_LIMIT", "50")

    count = asyncio.run(janitor.expire_stale_open_incidents(db))

    assert count == 2
    assert db.calls == [{"max_age_days": 5, "limit": 50}]


def test_rca_timeline_janitor_refreshes_heartbeat_during_long_wait() -> None:
    janitor = load_service("projection/rca-timeline-janitor")
    touches: list[object] = []

    async def scenario() -> None:
        await janitor.wait_for_next_sweep(
            asyncio.Event(),
            0.035,
            heartbeat_interval=0.01,
            touch=lambda: touches.append(object()),
        )

    asyncio.run(scenario())

    assert len(touches) >= 3
