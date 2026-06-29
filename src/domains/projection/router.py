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
from packages.contracts.gateway.fields import Gateway
from packages.runtime.dependencies import get_db

STREAM_INTERVAL_SECONDS = 2
EVENT_STREAM_MEDIA_TYPE = "text/event-stream"

router = APIRouter(dependencies=[Depends(require_session)])


@router.get(gateway_routes.DASHBOARD_QUERY_PATH)
async def dashboard_query(db: Any = Depends(get_db)) -> dict[str, Any]:
    return {Gateway.CARDS: db.list_dashboard()}


@router.get(gateway_routes.DASHBOARD_STREAM_PATH)
async def dashboard_stream(db: Any = Depends(get_db)) -> StreamingResponse:
    async def stream() -> AsyncIterator[str]:
        last = ""
        while True:
            encoded = json.dumps(db.list_dashboard(), default=str)
            if encoded != last:
                last = encoded
                yield f"event: {EventSubject.DASHBOARD_UPDATED}\ndata: {encoded}\n\n"
            await asyncio.sleep(STREAM_INTERVAL_SECONDS)

    return StreamingResponse(stream(), media_type=EVENT_STREAM_MEDIA_TYPE)
