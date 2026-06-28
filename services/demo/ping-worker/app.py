"""demo-ping-worker — 데모 워커(@app.sub 패턴 예시).

demo.ping.requested 를 받아 "비즈니스 로직"(여기선 ping→pong 변환)을 하고,
외부로 다시 나가달라는 demo.pong.requested 를 흘린다. 외부 호출 자체는 워커가
하지 않고 outbound 게이트웨이에 위임 — 워커는 순수 로직만.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.payloads import (
    DemoPingRequested,
    DemoPongRequestedPayload,
    EventPayload,
)
from packages.runtime.app import App, EventContext

app = App("demo-ping-worker")

CALLBACK_PATH = "/demo/callback"  # 외부(api-gateway)로 되돌아갈 경로


@app.sub(DemoPingRequested)
async def on_ping(
    evt: DemoPingRequested, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    yield DemoPongRequestedPayload(
        message=f"pong: {evt.message}",
        reply_to=CALLBACK_PATH,
    )


if __name__ == "__main__":
    app.run()
