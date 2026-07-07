"""rca 범용 조회 라우터 — 세션 워크스페이스 범위의 evidence/RCA report 읽기 API.

agent 수신 라우터(router.py, 토큰 가드)와 달리 이 라우터는 사용자 세션 가드만 쓰고,
모든 질의를 세션 workspace 로 강제 범위 지정한다(다른 워크스페이스 row 노출 불가).
RCA report 는 payload 원문 대신 화이트리스트 요약만 내려 secret 원문 유출을 차단한다.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from domains.identity.dependencies import require_session
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    EvidenceQueryResponse,
    EvidenceRecordItem,
    RcaReportListResponse,
    RcaReportSummaryItem,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.runtime.dependencies import get_db

DEFAULT_QUERY_LIMIT = 50
MAX_QUERY_LIMIT = 200
HTTP_UNPROCESSABLE = 422
INVALID_TIMESTAMP_DETAIL = "must be an ISO-8601 timestamp"

router = APIRouter()


@router.get(gateway_routes.EVIDENCE_QUERY_PATH, response_model=EvidenceQueryResponse)
async def list_evidence(
    correlation_id: str | None = None,
    kind: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = Query(default=DEFAULT_QUERY_LIMIT, ge=1, le=MAX_QUERY_LIMIT),
    offset: int = Query(default=0, ge=0),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> EvidenceQueryResponse:
    rows = await asyncio.to_thread(
        db.list_evidence_records,
        _workspace_id(current),
        correlation_id=correlation_id,
        kind=kind,
        since=parse_query_timestamp(since, "since"),
        until=parse_query_timestamp(until, "until"),
        # has_more 판정용으로 1건 더 조회하고 응답은 limit 개로 자름(offset 페이지네이션).
        limit=limit + 1,
        offset=offset,
    )
    return EvidenceQueryResponse(
        items=[EvidenceRecordItem(**evidence_record(row)) for row in rows[:limit]],
        limit=limit,
        offset=offset,
        has_more=len(rows) > limit,
    )


@router.get(gateway_routes.RCA_REPORTS_PATH, response_model=RcaReportListResponse)
async def list_rca_reports(
    correlation_id: str | None = None,
    since: str | None = None,
    until: str | None = None,
    limit: int = Query(default=DEFAULT_QUERY_LIMIT, ge=1, le=MAX_QUERY_LIMIT),
    offset: int = Query(default=0, ge=0),
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RcaReportListResponse:
    rows = await asyncio.to_thread(
        db.list_rca_report_records,
        _workspace_id(current),
        correlation_id=correlation_id,
        since=parse_query_timestamp(since, "since"),
        until=parse_query_timestamp(until, "until"),
        limit=limit + 1,
        offset=offset,
    )
    return RcaReportListResponse(
        items=[RcaReportSummaryItem(**rca_report_summary(row)) for row in rows[:limit]],
        limit=limit,
        offset=offset,
        has_more=len(rows) > limit,
    )


def parse_query_timestamp(value: str | None, name: str) -> datetime | None:
    if value is None:
        return None
    try:
        # ISO-8601(예: 2026-07-07T10:00:00+00:00, Z suffix 포함) 만 허용.
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(
            status_code=HTTP_UNPROCESSABLE,
            detail=f"{name} {INVALID_TIMESTAMP_DETAIL}",
        ) from exc


def evidence_record(row: JsonObject) -> JsonObject:
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "correlation_id": row["correlation_id"],
        "kind": row["kind"],
        "payload": row.get("payload") or {},
        "created_at": row.get("created_at"),
    }


def rca_report_summary(row: JsonObject) -> JsonObject:
    """RcaReport row → 화이트리스트 요약. payload 원문은 절대 그대로 내리지 않는다."""
    payload = row.get("payload") or {}
    incident = payload.get("incident") or {}
    detail = payload.get("rca_detail") or {}
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "correlation_id": row["correlation_id"],
        "root_cause": row["root_cause"],
        "action": row["action"],
        "incident_id": incident.get("incident_id"),
        "cluster_id": incident.get("cluster_id"),
        "symptom": incident.get("symptom"),
        "severity": incident.get("severity"),
        "confidence": detail.get("confidence"),
        "reason": detail.get("reason"),
        "evidence_ref": payload.get("evidence_ref"),
        "supporting_evidence": detail.get("supporting_evidence") or [],
        "missing_evidence": detail.get("missing_evidence") or [],
        "created_at": row.get("created_at"),
    }


def _workspace_id(current: Any) -> str:
    return getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
