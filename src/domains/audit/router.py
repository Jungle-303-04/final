"""workspace 범위의 불변 감사 타임라인 조회 API."""

from __future__ import annotations

import asyncio
import base64
import json
from binascii import Error as BinasciiError
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.audit.repository import AUDIT_TIMELINE_SUMMARY_FIELDS
from domains.identity.dependencies import require_cluster_access, require_session
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    AuditTimelineItem,
    AuditTimelineResponse,
)
from packages.contracts.identity import Permission
from packages.runtime.dependencies import get_db

DEFAULT_TIMELINE_LIMIT = 50
MAX_TIMELINE_LIMIT = 200
CURSOR_VERSION = 1
HTTP_UNPROCESSABLE = 422
INVALID_CURSOR_DETAIL = "cursor is invalid"
AUDIT_TIMELINE_NOT_FOUND = "audit timeline not found"

TIMELINE_SUBJECTS = frozenset(subject.value for subject in EventSubject)

router = APIRouter()


@router.get(gateway_routes.AUDIT_TIMELINE_PATH, response_model=AuditTimelineResponse)
async def audit_timeline(
    correlation_id: str = Query(min_length=1, max_length=2048),
    cursor: str | None = Query(default=None, min_length=1, max_length=2048),
    limit: int = Query(default=DEFAULT_TIMELINE_LIMIT, ge=1, le=MAX_TIMELINE_LIMIT),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> AuditTimelineResponse:
    workspace_id = str(getattr(current, "workspace_id", "") or "").strip()
    if not workspace_id:
        _raise_not_found()
    authorized_cluster_id = await authorize_audit_timeline(
        db,
        current,
        workspace_id,
        correlation_id,
    )
    page_cursor = parse_audit_cursor(cursor)
    rows = await asyncio.to_thread(
        db.list_audit_timeline,
        workspace_id,
        correlation_id,
        authorized_cluster_id,
        cursor=page_cursor,
        limit=limit + 1,
    )
    has_more = len(rows) > limit
    page = rows[:limit]
    return AuditTimelineResponse(
        items=[audit_timeline_item(row) for row in page],
        limit=limit,
        has_more=has_more,
        next_cursor=encode_audit_cursor(page[-1]) if has_more and page else None,
    )


def parse_audit_cursor(value: str | None) -> tuple[datetime, int] | None:
    if value is None:
        return None
    try:
        padding = "=" * (-len(value) % 4)
        decoded = base64.urlsafe_b64decode(f"{value}{padding}").decode("utf-8")
        payload = json.loads(decoded)
        if not isinstance(payload, dict) or payload.get("v") != CURSOR_VERSION:
            raise ValueError(INVALID_CURSOR_DETAIL)
        created_at = datetime.fromisoformat(str(payload["created_at"]).replace("Z", "+00:00"))
        row_id = int(payload["id"])
        if row_id < 1:
            raise ValueError(INVALID_CURSOR_DETAIL)
    except (
        BinasciiError,
        KeyError,
        TypeError,
        ValueError,
        UnicodeDecodeError,
        json.JSONDecodeError,
    ) as exc:
        raise HTTPException(status_code=HTTP_UNPROCESSABLE, detail=INVALID_CURSOR_DETAIL) from exc
    return created_at, row_id


def encode_audit_cursor(row: JsonObject) -> str:
    created_at = row["created_at"]
    payload = {
        "v": CURSOR_VERSION,
        "created_at": created_at.isoformat()
        if hasattr(created_at, "isoformat")
        else str(created_at),
        "id": int(row["id"]),
    }
    raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def audit_timeline_item(row: JsonObject) -> AuditTimelineItem:
    created_at = row["created_at"]
    return AuditTimelineItem(
        subject=str(row["subject"]),
        source=str(row["source"]),
        created_at=created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
        causation_id=str(row["causation_id"]) if row.get("causation_id") is not None else None,
        payload_summary=summarize_payload(str(row["subject"]), row),
    )


async def authorize_audit_timeline(
    db: Any,
    current: Any,
    workspace_id: str,
    correlation_id: str,
) -> str:
    cluster_ids = await asyncio.to_thread(
        db.list_audit_correlation_cluster_ids,
        workspace_id,
        correlation_id,
    )
    if len(cluster_ids) != 1:
        _raise_not_found()
    cluster_id = cluster_ids[0]
    if not isinstance(cluster_id, str) or not cluster_id:
        _raise_not_found()
    try:
        require_cluster_access(
            db,
            current,
            workspace_id,
            cluster_id,
            Permission.RCA_READ.value,
            detail=AUDIT_TIMELINE_NOT_FOUND,
        )
    except HTTPException as exc:
        if exc.status_code == 403:
            _raise_not_found(exc)
        raise
    return cluster_id


def summarize_payload(subject: str, row: JsonObject) -> JsonObject:
    if subject not in TIMELINE_SUBJECTS:
        return {}
    summary: JsonObject = {}
    for field in AUDIT_TIMELINE_SUMMARY_FIELDS:
        value = row.get(field)
        if not isinstance(value, str):
            continue
        if field == "confidence":
            try:
                summary[field] = float(value)
            except ValueError:
                continue
        else:
            summary[field] = value
    return summary


def _raise_not_found(exc: Exception | None = None) -> None:
    error = HTTPException(status_code=404, detail=AUDIT_TIMELINE_NOT_FOUND)
    if exc is not None:
        raise error from exc
    raise error
