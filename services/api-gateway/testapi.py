"""testapi — 데모용 HTTP 입출구(프레임워크 한 바퀴를 눈으로 관찰).

POST /demo/ping     : ping 수신 → demo.ping.requested 발행(API → event).
POST /demo/callback : outbound 게이트웨이가 외부로 되돌아오는 착지점 → inbox.
GET  /demo/inbox    : 되돌아온 pong 확인.

한 바퀴:
    POST /demo/ping → demo.ping.requested → ping-worker
      → demo.pong.requested → ping-gateway → POST /demo/callback (여기로 복귀)
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

from packages.contracts.event_bus.bodies import DemoPingRequested
from packages.runtime.gateway import ApiEventGateway


class DemoPingRequest(BaseModel):
    message: str = "hello"


class DemoCallbackRequest(BaseModel):
    message: str


def register_demo_routes(
    app: FastAPI, events: ApiEventGateway, inbox: list[dict[str, Any]]
) -> None:
    @app.post("/demo/ping")
    async def demo_ping(payload: DemoPingRequest) -> dict[str, Any]:
        # API → event: 타입 body 하나로 발행(subject 자동 유도).
        accepted = await events.accept_body(DemoPingRequested(message=payload.message))
        return accepted.response(include_event=True)

    @app.post("/demo/callback")
    async def demo_callback(payload: DemoCallbackRequest) -> dict[str, Any]:
        inbox.append(payload.model_dump())
        return {"received": True}

    @app.get("/demo/inbox")
    async def demo_inbox() -> dict[str, Any]:
        return {"inbox": inbox}
