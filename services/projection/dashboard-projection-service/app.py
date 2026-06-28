"""dashboard-projection-service — 모든 이벤트를 대시보드 카드로 투영.

@app.on_event 로 전체(>) 구독. 이벤트마다 상태(진행/완료/주의)를 판정해
읽기 모델에 upsert 하고 dashboard.updated 흘림.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.dashboard.status import DashboardStatus
from packages.contracts.event_bus.bodies import DashboardUpdatedBody, EventBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.subjects import EventSubject
from packages.runtime.app import App, EventContext

app = App("dashboard-projection-service")

TERMINAL_SUCCESS = {EventSubject.SAFE_PR_CREATED, EventSubject.COMMAND_COMPLETED}
ATTENTION_SUFFIXES = ("rejected", "failed")


def _status(subject: str) -> DashboardStatus:
    if subject in TERMINAL_SUCCESS:
        return DashboardStatus.DONE
    attention = subject.endswith(ATTENTION_SUFFIXES) or subject == EventSubject.DEAD_LETTER_CREATED
    return DashboardStatus.ATTENTION if attention else DashboardStatus.RUNNING


@app.on_event
async def on_event(evt: EventEnvelope, ctx: EventContext) -> AsyncIterator[EventBody]:
    if evt.subject == EventSubject.DASHBOARD_UPDATED:
        return  # 자기 이벤트는 무시(무한 루프 방지)
    status = _status(evt.subject)
    summary = f"{evt.subject} from {evt.source}"
    await ctx.db.upsert_dashboard(evt, status, summary)
    yield DashboardUpdatedBody(summary=summary, status=status)


if __name__ == "__main__":
    app.run()
