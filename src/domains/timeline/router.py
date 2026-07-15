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
from domains.timeline.coverage import (
    authorized_kubernetes_event_coverage,
    coverage_additions,
    kubernetes_event_coverage_visible_for_query,
)
from domains.timeline.cursor import TimelineReplayCursorCodec
from domains.timeline.fanout import TimelineFanoutClosed, TimelineFanoutOverflow
from domains.timeline.repository import TimelineSnapshotLimitExceeded
from domains.timeline.service import TimelineReadResolution, resolve_timeline_read
from domains.timeline.settings import timeline_replay_poll_seconds
from domains.timeline.streams import encode_ndjson, encode_sse_frame
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.timeline import (
    TimelineCoverage,
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
COVERAGE_UNAVAILABLE_DETAIL = "timeline coverage is unavailable"

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
    coverage_reader = getattr(db, "snapshot_timeline_coverage", None)
    if not callable(snapshot_reader):
        raise HTTPException(status_code=503, detail=LEDGER_UNAVAILABLE_DETAIL)
    if not callable(coverage_reader):
        raise HTTPException(status_code=503, detail=COVERAGE_UNAVAILABLE_DETAIL)
    try:
        snapshot = await asyncio.to_thread(
            snapshot_reader,
            resolution.read_scope,
            predicate=resolution.evidence_predicate,
            limit=resolution.policy.max_batch_events,
        )
    except TimelineSnapshotLimitExceeded as exc:
        raise HTTPException(status_code=422, detail=SNAPSHOT_LIMIT_DETAIL) from exc
    try:
        coverage = await _read_timeline_coverage(coverage_reader, resolution)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=COVERAGE_UNAVAILABLE_DETAIL) from exc
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
            capabilities=resolution.capabilities,
            events=tuple(
                record.event
                for record in snapshot.records
                if resolution.evidence_predicate.matches_snapshot(record.event)
            ),
            coverage=coverage,
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
    coverage_reader = getattr(db, "snapshot_timeline_coverage", None)
    subscribe = getattr(timeline_fanout, "subscribe", None)
    if not callable(replay_reader) or not callable(coverage_reader) or not callable(subscribe):
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
            coverage_reader=coverage_reader,
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
    coverage_reader: Any,
    subscription: Any,
    resolution: TimelineReadResolution,
    cursor_codec: TimelineReplayCursorCodec,
    after_sequence: int,
) -> AsyncIterator[str]:
    """Emit only durable facts; local fan-out is a wake-up optimization."""
    delivered = after_sequence
    try:
        delivered_coverage = await _read_timeline_coverage(coverage_reader, resolution)
    except Exception:
        yield encode_sse_frame(
            TimelineStreamFrame(
                kind="error",
                cursor=_cursor_at(cursor_codec, resolution, delivered),
                reason=COVERAGE_UNAVAILABLE_DETAIL,
            )
        )
        await subscription.close()
        return
    try:
        if delivered_coverage:
            yield encode_sse_frame(
                TimelineStreamFrame(
                    kind="coverage",
                    cursor=_cursor_at(cursor_codec, resolution, delivered),
                    coverage=delivered_coverage,
                )
            )
        while True:
            replay = await asyncio.to_thread(
                replay_reader,
                resolution.read_scope,
                after_sequence=delivered,
                predicate=resolution.evidence_predicate,
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
                if not resolution.evidence_predicate.matches_stream(record.event):
                    continue
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="event",
                        cursor=_cursor_at(cursor_codec, resolution, record.sequence),
                        event=record.event,
                    )
                )
            try:
                observed_coverage = await _read_timeline_coverage(coverage_reader, resolution)
            except Exception:
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="error",
                        cursor=_cursor_at(cursor_codec, resolution, delivered),
                        reason=COVERAGE_UNAVAILABLE_DETAIL,
                    )
                )
                return
            coverage_delta = coverage_additions(delivered_coverage, observed_coverage)
            if coverage_delta:
                delivered_coverage = (*delivered_coverage, *coverage_delta)
                yield encode_sse_frame(
                    TimelineStreamFrame(
                        kind="coverage",
                        cursor=_cursor_at(
                            cursor_codec,
                            resolution,
                            max(delivered, replay.high_water_sequence),
                        ),
                        coverage=coverage_delta,
                    )
                )
            # A full replay batch may have more durable records immediately
            # behind it. Drain it before waiting for a wake-up signal.
            if len(replay.records) >= resolution.policy.max_batch_events:
                continue
            # The durable reader applied the same predicate, so a short page
            # proves no remaining matching record exists through this
            # high-water mark. Advance only the server-local scan boundary;
            # the browser keeps its last emitted opaque cursor.
            delivered = max(delivered, replay.high_water_sequence)
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


async def _read_timeline_coverage(
    coverage_reader: Any,
    resolution: TimelineReadResolution,
) -> tuple[TimelineCoverage, ...]:
    """Read only durable coverage and apply the same source/query boundary as events."""
    raw_coverage = await asyncio.to_thread(
        coverage_reader,
        resolution.read_scope,
        window=resolution.query.window,
    )
    if not isinstance(raw_coverage, (list, tuple)):
        raise TypeError("timeline coverage reader returned an invalid result")
    if not kubernetes_event_coverage_visible_for_query(resolution.query):
        return ()
    return authorized_kubernetes_event_coverage(
        resolution.read_scope,
        window=resolution.query.window,
        coverage=raw_coverage,
    )


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
