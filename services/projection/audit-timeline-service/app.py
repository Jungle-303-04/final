"""audit-timeline-service — 모든 이벤트를 감사 로그로 적재.

@app.on_event 로 전체(>) 구독. 봉투 그대로 audit 로그에 append.
체이닝 없음(말단 소비자).
"""

from __future__ import annotations

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.stores import AuditStore
from packages.runtime.app import App, EventContext

app = App("audit-timeline-service")


@app.on_event
async def on_event(evt: EventEnvelope, ctx: EventContext[AuditStore]) -> None:
    await ctx.db.append_audit_log(evt)


if __name__ == "__main__":
    app.run()
