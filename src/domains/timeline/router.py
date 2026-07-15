"""Retained Timeline HTTP adapter.

The snapshot is deliberately an NDJSON sequence, not a UI-shaped JSON list:
the same strict frame contract will be reused by the resumable SSE endpoint.
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
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
from domains.timeline.repository import (
    TimelineOverviewAggregate,
    TimelinePinRevisionConflict,
    TimelineSnapshotLimitExceeded,
)
from domains.timeline.service import (
    TimelineReadResolution,
    delete_timeline_pin,
    put_timeline_pin,
    read_timeline_pins,
    resolve_timeline_capabilities,
    resolve_timeline_read,
)
from domains.timeline.settings import (
    timeline_coverage_source_availability,
    timeline_overview_bucket_width_ms,
    timeline_replay_poll_seconds,
)
from domains.timeline.streams import encode_ndjson, encode_sse_frame
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.timeline import (
    TimelineCapabilityDescriptor,
    TimelineCoverage,
    TimelineCursor,
    TimelineOverview,
    TimelineOverviewActivityFacet,
    TimelineOverviewBucket,
    TimelineOverviewFacets,
    TimelineOverviewKindFacet,
    TimelineOverviewRequest,
    TimelinePinMutation,
    TimelinePinSet,
    TimelinePinUpsertRequest,
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
OVERVIEW_UNAVAILABLE_DETAIL = "timeline overview is unavailable"
PIN_REVISION_CONFLICT_DETAIL = "timeline pins revision conflicts with the current set"

router = APIRouter()


@router.get(
    gateway_routes.TIMELINE_CAPABILITIES_PATH,
    response_model=TimelineCapabilityDescriptor,
)
async def read_timeline_capabilities(
    response: Response,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TimelineCapabilityDescriptor:
    """Return server-owned Timeline limits before a browser constructs a query."""
    response.headers["Cache-Control"] = "no-store"
    return await resolve_timeline_capabilities(db, current)


@router.get(
    gateway_routes.TIMELINE_PINS_PATH,
    response_model=TimelinePinSet,
)
async def read_persistent_timeline_pins(
    response: Response,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TimelinePinSet:
    """Return only the authenticated user's currently readable pins in this workspace."""
    response.headers["Cache-Control"] = "no-store"
    return await read_timeline_pins(db, current)


@router.put(
    gateway_routes.TIMELINE_PINS_PATH,
    response_model=TimelinePinMutation,
)
async def upsert_persistent_timeline_pin(
    body: TimelinePinUpsertRequest,
    response: Response,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TimelinePinMutation:
    """Idempotently add one server-materialized, currently readable pin subject."""
    response.headers["Cache-Control"] = "no-store"
    try:
        return await put_timeline_pin(db, current, body)
    except TimelinePinRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=PIN_REVISION_CONFLICT_DETAIL) from exc


@router.delete(
    gateway_routes.TIMELINE_PIN_PATH,
    response_model=TimelinePinMutation,
)
async def remove_persistent_timeline_pin(
    pin_id: str,
    response: Response,
    expected_revision: int = Query(ge=0),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TimelinePinMutation:
    """Idempotently remove an owner row, including a pin currently hidden by revoked access."""
    response.headers["Cache-Control"] = "no-store"
    try:
        return await delete_timeline_pin(
            db,
            current,
            pin_id=pin_id,
            expected_revision=expected_revision,
        )
    except TimelinePinRevisionConflict as exc:
        raise HTTPException(status_code=409, detail=PIN_REVISION_CONFLICT_DETAIL) from exc


@router.post(
    gateway_routes.TIMELINE_OVERVIEW_PATH,
    response_model=TimelineOverview,
)
async def read_timeline_overview(
    body: TimelineOverviewRequest,
    response: Response,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TimelineOverview:
    """Return a bounded retained-strip aggregate without opening a replay cursor."""
    resolution = await resolve_timeline_read(db, current, body.query)
    overview_reader = getattr(db, "timeline_overview", None)
    coverage_reader = getattr(db, "snapshot_timeline_coverage", None)
    if not callable(overview_reader):
        raise HTTPException(status_code=503, detail=OVERVIEW_UNAVAILABLE_DETAIL)
    if not callable(coverage_reader):
        raise HTTPException(status_code=503, detail=COVERAGE_UNAVAILABLE_DETAIL)
    bucket_width_ms = timeline_overview_bucket_width_ms(
        resolution.query.window.to_ms - resolution.query.window.from_ms
    )
    try:
        aggregate = await asyncio.to_thread(
            overview_reader,
            resolution.read_scope,
            predicate=resolution.evidence_predicate,
            bucket_width_ms=bucket_width_ms,
        )
        if not isinstance(aggregate, TimelineOverviewAggregate):
            raise TypeError("timeline overview reader returned an invalid result")
    except Exception as exc:
        raise HTTPException(status_code=503, detail=OVERVIEW_UNAVAILABLE_DETAIL) from exc
    try:
        coverage = await _read_timeline_coverage(coverage_reader, resolution)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=COVERAGE_UNAVAILABLE_DETAIL) from exc
    try:
        overview = _timeline_overview_response(
            resolution,
            aggregate=aggregate,
            bucket_width_ms=bucket_width_ms,
            coverage=coverage,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=OVERVIEW_UNAVAILABLE_DETAIL) from exc
    response.headers["Cache-Control"] = "no-store"
    return overview


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
            pin_set_revision=None if resolution.pin_set is None else resolution.pin_set.revision,
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


def _timeline_overview_response(
    resolution: TimelineReadResolution,
    *,
    aggregate: TimelineOverviewAggregate,
    bucket_width_ms: int,
    coverage: tuple[TimelineCoverage, ...],
) -> TimelineOverview:
    """Turn repository aggregates into a contiguous, strict transport contract."""
    window = resolution.query.window
    bucket_count = (window.to_ms - window.from_ms + bucket_width_ms - 1) // bucket_width_ms
    if bucket_count < 1 or bucket_count > 256:
        raise ValueError("timeline overview bucket count is invalid")
    counts_by_index: dict[int, tuple[int, int]] = {}
    for item in aggregate.buckets:
        if item.bucket_index < 0 or item.bucket_index >= bucket_count:
            raise ValueError("timeline overview bucket is outside the requested window")
        if item.bucket_index in counts_by_index:
            raise ValueError("timeline overview bucket is duplicated")
        counts_by_index[item.bucket_index] = (item.event_count, item.problem_count)
    buckets = tuple(
        TimelineOverviewBucket(
            from_ms=window.from_ms + index * bucket_width_ms,
            to_ms=min(window.from_ms + (index + 1) * bucket_width_ms, window.to_ms),
            event_count=counts_by_index.get(index, (0, 0))[0],
            problem_count=counts_by_index.get(index, (0, 0))[1],
        )
        for index in range(bucket_count)
    )
    activity_values = tuple(
        sorted(
            {
                *(
                    activity
                    for option in resolution.capabilities.control_surface.activity
                    for activity in option.activity
                ),
                *(
                    activity
                    for option in resolution.capabilities.control_surface.activity
                    for activity in option.problems_activity
                ),
            }
        )
    )
    if resolution.query.mode == "live" and aggregate.new_evidence_count is not None:
        raise ValueError("live overview cannot report frozen-window evidence")
    if resolution.query.mode == "frozen" and aggregate.new_evidence_count is None:
        raise ValueError("frozen overview requires later evidence count")
    return TimelineOverview(
        window=window,
        bucket_width_ms=bucket_width_ms,
        buckets=buckets,
        coverage=coverage,
        coverage_sources=timeline_coverage_source_availability(),
        facets=TimelineOverviewFacets(
            activity=tuple(
                TimelineOverviewActivityFacet(
                    activity=activity,
                    count=aggregate.activity_counts.get(activity, 0),
                )
                for activity in activity_values
            ),
            kinds=tuple(
                TimelineOverviewKindFacet(kind=kind, count=count)
                for kind, count in sorted(
                    aggregate.kind_counts.items(),
                    key=lambda item: (-item[1], item[0].casefold(), item[0]),
                )
            ),
        ),
        new_evidence_count=aggregate.new_evidence_count,
        pin_set_revision=None if resolution.pin_set is None else resolution.pin_set.revision,
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
