"""demo-ping-gateway — 데모 outbound 게이트웨이(정형 예시).

demo.pong.requested 를 받아 외부(api-gateway 의 /demo/callback)로 POST 하고,
결과를 demo.pong.delivered / demo.pong.failed 로 낸다. try/except 는
deliver() 가 처리 — 핸들러는 "무엇을 호출, 성공/실패 이벤트"만 선언.

outbound 어댑터는 모듈 변수라 테스트에서 가짜로 교체 가능.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.payloads import (
    DemoPongDeliveredPayload,
    DemoPongFailedPayload,
    DemoPongRequestedPayload,
    EventPayload,
)
from packages.runtime.app import App, EventContext
from packages.runtime.outbound import HttpOutbound, deliver

app = App("demo-ping-gateway")

outbound = HttpOutbound()  # 외부 호출 어댑터(테스트에서 교체)

DELIVERED_STATUS = "delivered"


@app.sub(DemoPongRequestedPayload)
async def on_pong_requested(
    evt: DemoPongRequestedPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    async for out in deliver(
        call=lambda: outbound.post(evt.reply_to, {"message": evt.message}),
        ok=lambda _status: DemoPongDeliveredPayload(
            reply_to=evt.reply_to, status=DELIVERED_STATUS
        ),
        fail=lambda exc: DemoPongFailedPayload(
            reply_to=evt.reply_to, error=str(exc)
        ),
    ):
        yield out


if __name__ == "__main__":
    app.run()
