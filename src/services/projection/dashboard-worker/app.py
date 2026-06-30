"""dashboard-worker — 모든 이벤트를 대시보드 카드로 투영.

@app.on_any 로 전체(>) 구독. 이벤트마다 상태(진행/완료/주의)를 판정해
읽기 모델에 upsert 하고 dashboard.updated 흘림.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import DashboardUpdatedBody, EventBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.stores import DashboardStore
from packages.runtime.app import App, EventContext

app = App("dashboard-worker")

TERMINAL_SUCCESS = {EventSubject.SAFE_PR_CREATED, EventSubject.COMMAND_COMPLETED}
ATTENTION_SUFFIXES = ("rejected", "failed")
DASHBOARD_STATUS_RUNNING = "running"
DASHBOARD_STATUS_DONE = "done"
DASHBOARD_STATUS_ATTENTION = "attention"


def _status(subject: str) -> str:
    if subject in TERMINAL_SUCCESS:
        return DASHBOARD_STATUS_DONE
    attention = subject.endswith(ATTENTION_SUFFIXES) or subject == EventSubject.DEAD_LETTER_CREATED
    return DASHBOARD_STATUS_ATTENTION if attention else DASHBOARD_STATUS_RUNNING


@app.on_any
async def on_event(
    evt: EventEnvelope, ctx: EventContext[DashboardStore]
) -> AsyncIterator[EventBody]:
    if evt.subject == EventSubject.DASHBOARD_UPDATED:
        return  # 자기 이벤트는 무시(무한 루프 방지)
    status = _status(evt.subject)
    summary = f"{evt.subject} from {evt.source}"
    await ctx.db.upsert_dashboard(evt, status, summary)
    yield DashboardUpdatedBody(summary=summary, status=status)


if __name__ == "__main__":
    app.run()
