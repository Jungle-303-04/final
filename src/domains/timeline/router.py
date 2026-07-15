"""Retained Timeline HTTP adapter.

The snapshot is deliberately an NDJSON sequence, not a UI-shaped JSON list:
the same strict frame contract will be reused by the resumable SSE endpoint.
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.cursor import TimelineReplayCursorCodec
from domains.timeline.repository import TimelineSnapshotLimitExceeded
from domains.timeline.service import resolve_timeline_read
from domains.timeline.streams import encode_ndjson
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.timeline import (
    TimelineSnapshotRequest,
    TimelineStreamFrame,
)
from packages.runtime.dependencies import get_db

TIMELINE_CURSOR_SIGNING_KEY_ENV = "FILTER_CURSOR_SIGNING_KEY"
CURSOR_UNAVAILABLE_DETAIL = "timeline cursor is unavailable"
LEDGER_UNAVAILABLE_DETAIL = "timeline ledger is unavailable"
SNAPSHOT_LIMIT_DETAIL = "timeline snapshot exceeds the server event limit"

router = APIRouter()


@router.post(gateway_routes.TIMELINE_SNAPSHOTS_PATH)
async def read_timeline_snapshot(
    body: TimelineSnapshotRequest,
    request: Request,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> Response:
    """Return a bounded retained snapshot and its opaque replay high-water mark."""
    resolution = await resolve_timeline_read(db, current, body.query)
    snapshot_reader = getattr(db, "snapshot_timeline_events", None)
    if not callable(snapshot_reader):
        raise HTTPException(status_code=503, detail=LEDGER_UNAVAILABLE_DETAIL)
    try:
        snapshot = await asyncio.to_thread(
            snapshot_reader,
            resolution.read_scope,
            window=resolution.query.window,
            limit=resolution.policy.max_batch_events,
        )
    except TimelineSnapshotLimitExceeded as exc:
        raise HTTPException(status_code=422, detail=SNAPSHOT_LIMIT_DETAIL) from exc
    cursor = TimelineReplayCursorCodec(_cursor_codec(request)).encode(
        resolution.cursor_binding,
        sequence=snapshot.high_water_sequence,
    )
    frames = (
        TimelineStreamFrame(
            kind="snapshot",
            cursor=cursor,
            scopes=resolution.scopes,
            policy=resolution.policy,
            events=snapshot.events,
        ),
        TimelineStreamFrame(kind="end", cursor=cursor),
    )
    return Response(
        content=encode_ndjson(frames),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-store"},
    )


def _cursor_codec(request: Request) -> FilterCursorCodec:
    configured = getattr(request.app.state, "timeline_cursor_codec", None)
    if isinstance(configured, FilterCursorCodec):
        return configured
    try:
        return FilterCursorCodec(env(TIMELINE_CURSOR_SIGNING_KEY_ENV, "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=CURSOR_UNAVAILABLE_DETAIL) from exc
