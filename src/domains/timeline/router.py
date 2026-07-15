"""Retained Timeline HTTP adapter.

The snapshot is deliberately an NDJSON sequence, not a UI-shaped JSON list:
the same strict frame contract will be reused by the resumable SSE endpoint.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from pydantic import ValidationError

from domains.identity.dependencies import require_session
from domains.inventory_filter.cursor import FilterCursorCodec
from domains.timeline.cursor import TimelineReplayCursorCodec
from domains.timeline.fanout import TimelineFanoutClosed, TimelineFanoutOverflow
from domains.timeline.repository import TimelineSnapshotLimitExceeded
from domains.timeline.service import TimelineReadResolution, resolve_timeline_read
from domains.timeline.settings import timeline_replay_poll_seconds
from domains.timeline.streams import encode_ndjson, encode_sse_frame
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.timeline import (
    TimelineCursor,
    TimelineSnapshotRequest,
    TimelineStreamFrame,
    TimelineStreamRequest,
)
from packages.runtime.dependencies import get_db, get_timeline_fanout

TIMELINE_CURSOR_SIGNING_KEY_ENV = "FILTER_CURSOR_SIGNING_KEY"
CURSOR_UNAVAILABLE_DETAIL = "timeline cursor is unavailable"
LEDGER_UNAVAILABLE_DETAIL = "timeline ledger is unavailable"
SNAPSHOT_LIMIT_DETAIL = "timeline snapshot exceeds the server event limit"
REPLAY_CURSOR_INVALID_DETAIL = "timeline replay cursor is invalid"
REPLAY_CURSOR_REQUIRED_DETAIL = "timeline replay cursor is required"
REPLAY_CURSOR_CONFLICT_DETAIL = "timeline replay cursor conflicts with Last-Event-ID"
STREAM_UNAVAILABLE_DETAIL = "timeline stream is unavailable"

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


@router.post(gateway_routes.TIMELINE_STREAM_PATH)
async def stream_timeline_events(
    body: TimelineStreamRequest,
    request: Request,
    last_event_id: str | None = Header(default=None, alias="Last-Event-ID"),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    timeline_fanout: Any = Depends(get_timeline_fanout),
) -> StreamingResponse:
    """Replay an opaque cursor then keep an SSE response open without browser polling."""
    resolution = await resolve_timeline_read(db, current, body.query)
    cursor_codec = TimelineReplayCursorCodec(_cursor_codec(request))
    resume_cursor = _resume_cursor(body.after, last_event_id)
    try:
        after_sequence = cursor_codec.decode(resume_cursor, binding=resolution.cursor_binding)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=REPLAY_CURSOR_INVALID_DETAIL) from exc
    replay_reader = getattr(db, "replay_timeline_events", None)
    subscribe = getattr(timeline_fanout, "subscribe", None)
    if not callable(replay_reader) or not callable(subscribe):
        raise HTTPException(status_code=503, detail=STREAM_UNAVAILABLE_DETAIL)
    try:
        # Subscribe before the durable replay: a committed append between the
        # replay and subscription is either observed by the queue or recovered
        # by the next durable suffix read.
        subscription = await subscribe(resolution.authorized.workspace_id)
    except (TimelineFanoutClosed, ValueError) as exc:
        raise HTTPException(status_code=503, detail=STREAM_UNAVAILABLE_DETAIL) from exc
    return StreamingResponse(
        _timeline_sse_body(
            replay_reader=replay_reader,
            subscription=subscription,
            resolution=resolution,
            cursor_codec=cursor_codec,
            after_sequence=after_sequence,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def _timeline_sse_body(
    *,
    replay_reader: Any,
    subscription: Any,
    resolution: TimelineReadResolution,
    cursor_codec: TimelineReplayCursorCodec,
    after_sequence: int,
) -> AsyncIterator[str]:
    """Emit only durable facts; local fan-out is a wake-up optimization."""
    delivered = after_sequence
    try:
        while True:
            replay = await asyncio.to_thread(
                replay_reader,
                resolution.read_scope,
                after_sequence=delivered,
                limit=resolution.policy.max_batch_events,
            )
            if replay.status == "resync_required":
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="resync_required",
                        cursor=_cursor_at(cursor_codec, resolution, replay.high_water_sequence),
                        reason=replay.reason or "retention_boundary",
                    )
                )
                return
            for record in replay.records:
                if record.sequence <= delivered:
                    continue
                delivered = record.sequence
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="event",
                        cursor=_cursor_at(cursor_codec, resolution, record.sequence),
                        event=record.event,
                    )
                )
            # A full replay batch may have more durable records immediately
            # behind it. Drain it before waiting for a wake-up signal.
            if len(replay.records) >= resolution.policy.max_batch_events:
                continue
            try:
                await asyncio.wait_for(subscription.next(), timeout=timeline_replay_poll_seconds())
            except TimeoutError:
                # Cross-process fan-out is deliberately not a source of truth;
                # this bounded server-side replay repairs any missed wake-up.
                yield ": keep-alive\n\n"
            except TimelineFanoutOverflow:
                # The queue deliberately discarded its local acceleration path.
                # The next loop recovers the exact ordered suffix from PostgreSQL.
                continue
            except TimelineFanoutClosed:
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="error",
                        cursor=_cursor_at(cursor_codec, resolution, delivered),
                        reason="timeline fanout closed",
                    )
                )
                return
    finally:
        await subscription.close()


def _cursor_at(
    cursor_codec: TimelineReplayCursorCodec,
    resolution: TimelineReadResolution,
    sequence: int,
) -> TimelineCursor:
    return cursor_codec.encode(resolution.cursor_binding, sequence=sequence)


def _resume_cursor(
    body_cursor: TimelineCursor | None,
    last_event_id: str | None,
) -> TimelineCursor:
    try:
        header_cursor = TimelineCursor(token=last_event_id) if last_event_id else None
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=REPLAY_CURSOR_INVALID_DETAIL) from exc
    if body_cursor is not None and header_cursor is not None and body_cursor != header_cursor:
        raise HTTPException(status_code=422, detail=REPLAY_CURSOR_CONFLICT_DETAIL)
    if body_cursor is not None:
        return body_cursor
    if header_cursor is not None:
        return header_cursor
    raise HTTPException(status_code=422, detail=REPLAY_CURSOR_REQUIRED_DETAIL)


def _cursor_codec(request: Request) -> FilterCursorCodec:
    configured = getattr(request.app.state, "timeline_cursor_codec", None)
    if isinstance(configured, FilterCursorCodec):
        return configured
    try:
        return FilterCursorCodec(env(TIMELINE_CURSOR_SIGNING_KEY_ENV, "").strip())
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=CURSOR_UNAVAILABLE_DETAIL) from exc
