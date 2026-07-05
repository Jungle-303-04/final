"""dashboard-worker — 이벤트 흐름을 프론트 조회용 RCA timeline으로 투영."""

from __future__ import annotations

from domains.dashboard.repository import timeline_update_from_event
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.stores import DashboardStore
from packages.runtime.app import App, EventContext

app = App("dashboard-worker")


@app.on_any
async def on_event(evt: EventEnvelope, ctx: EventContext[DashboardStore]) -> None:
    row = timeline_update_from_event(evt)
    if row is not None:
        await ctx.db.upsert_rca_timeline(row)


if __name__ == "__main__":
    app.run()
