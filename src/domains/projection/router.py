"""projection 도메인 HTTP 라우터 — 대시보드 조회·스트림(SSE). 세션 가드(라우터 단위)."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from domains.identity.dependencies import require_session
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import DashboardResponse
from packages.runtime.dependencies import get_db

STREAM_INTERVAL_SECONDS = 2
EVENT_STREAM_MEDIA_TYPE = "text/event-stream"

router = APIRouter(dependencies=[Depends(require_session)])


def read_dashboard_cards(db: Any) -> list[dict[str, Any]]:
    # TODO(projection): dashboard card를 organization/project 범위로 제한, pagination 추가
    return db.list_dashboard()


def encode_dashboard_event(cards: list[dict[str, Any]]) -> str:
    # TODO(projection): client SSE 재개용 event id/correlation id 포함
    encoded = json.dumps(cards, default=str)
    return f"event: {EventSubject.DASHBOARD_UPDATED}\ndata: {encoded}\n\n"


@router.get(gateway_routes.DASHBOARD_QUERY_PATH, response_model=DashboardResponse)
async def dashboard_query(db: Any = Depends(get_db)) -> DashboardResponse:
    return DashboardResponse(cards=read_dashboard_cards(db))


@router.get(gateway_routes.DASHBOARD_STREAM_PATH)
async def dashboard_stream(db: Any = Depends(get_db)) -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        last = ""
        while True:
            cards = read_dashboard_cards(db)
            encoded = json.dumps(cards, default=str)
            if encoded != last:
                last = encoded
                yield encode_dashboard_event(cards)
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)

    return StreamingResponse(stream(), media_type=EVENT_STREAM_MEDIA_TYPE)
