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
    payload = row.get("payload") or {}
    sources = _evidence_source_summaries(payload)
    return {
        "id": row["id"],
        "workspace_id": row["workspace_id"],
        "correlation_id": row["correlation_id"],
        "kind": row["kind"],
        "cluster_id": payload.get("cluster_id") or None,
        "evidence_ref": payload.get("object_ref") or payload.get("evidence_ref") or None,
        "summary": _evidence_summary(payload, sources),
        "sources": sources,
        "created_at": row.get("created_at"),
    }


def _evidence_summary(payload: JsonObject, sources: list[JsonObject]) -> str:
    cluster_id = payload.get("cluster_id")
    labels = [str(item["source"]) for item in sources if item.get("source")]
    if cluster_id and labels:
        return f"{cluster_id}: {', '.join(labels)}"
    if cluster_id:
        return str(cluster_id)
    if labels:
        return ", ".join(labels)
    return "evidence"


def _evidence_source_summaries(payload: JsonObject) -> list[JsonObject]:
    items: list[JsonObject] = []
    for source in ("kubernetes", "metrics", "logs", "traces"):
        value = payload.get(source)
        if value in (None, {}, []):
            continue
        items.append(
            {
                "source": source,
                "summary": _source_summary(source, value),
                **_lineage_from_source_value(value),
            }
        )
    return items


def _source_summary(source: str, value: Any) -> str:
    if source == "kubernetes" and isinstance(value, dict):
        pods = _len(value.get("pods"))
        nodes = _len(value.get("nodes"))
        events = _len(value.get("events"))
        parts = []
        if pods is not None:
            parts.append(f"pods={pods}")
        if nodes is not None:
            parts.append(f"nodes={nodes}")
        if events is not None:
            parts.append(f"events={events}")
        return ", ".join(parts) if parts else "kubernetes snapshot"
    if source in {"metrics", "traces"} and isinstance(value, dict):
        results = value.get("results")
        if isinstance(results, dict):
            return f"results={len(results)}"
        return f"{source} snapshot"
    if source == "logs" and isinstance(value, list):
        query_names = sorted(
            {
                str(entry["query_name"])
                for entry in value
                if isinstance(entry, dict) and entry.get("query_name")
            }
        )
        if query_names:
            return f"entries={len(value)}, queries={','.join(query_names[:3])}"
        return f"entries={len(value)}"
    return f"{source} evidence"


def _len(value: Any) -> int | None:
    return len(value) if isinstance(value, list) else None


def _lineage_from_source_value(value: Any) -> JsonObject:
    if isinstance(value, dict):
        return _lineage_from_value(value)
    if isinstance(value, list):
        for entry in value:
            if isinstance(entry, dict):
                lineage = _lineage_from_value(entry)
                if lineage:
                    return lineage
    return {}


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
        # 분석 심화 — 대상 리소스·부증상·후보 점수·근거 쿼리 트레일(전부 파생 메타, 원문 값 없음)
        "resource_kind": incident.get("resource_kind"),
        "resource_name": incident.get("resource_name"),
        "namespace": incident.get("namespace"),
        "secondary_symptoms": _str_list(incident.get("secondary_symptoms")),
        "selected_candidate_id": detail.get("selected_candidate_id"),
        "candidates": _candidate_scores(payload),
        "supporting_evidence_refs": _evidence_refs(detail.get("supporting_evidence_refs"), payload),
        "missing_evidence_checks": _missing_checks(detail.get("missing_evidence_checks")),
    }


def _str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str) and item]


def _candidate_scores(payload: JsonObject) -> list[JsonObject]:
    """candidates(카탈로그 메타) + evaluations(점수) 를 candidate_id 로 병합."""
    candidates = payload.get("candidates")
    evaluations = payload.get("evaluations")
    meta: dict[str, JsonObject] = {}
    for cand in candidates if isinstance(candidates, list) else []:
        if isinstance(cand, dict) and cand.get("candidate_id"):
            meta[str(cand["candidate_id"])] = cand
    items: list[JsonObject] = []
    for ev in evaluations if isinstance(evaluations, list) else []:
        if not (isinstance(ev, dict) and ev.get("candidate_id")):
            continue
        candidate_id = str(ev["candidate_id"])
        cand = meta.get(candidate_id, {})
        items.append(
            {
                "candidate_id": candidate_id,
                "title": cand.get("title"),
                "source": cand.get("source"),
                "score": ev.get("score"),
                "reason": ev.get("reason"),
                "supporting_evidence": _str_list(ev.get("supporting_evidence")),
                "missing_evidence": _str_list(ev.get("missing_evidence")),
            }
        )
    # 점수 내림차순 — 선정 후보가 항상 위로 온다.
    items.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    return items


LINEAGE_KEY = "_lineage"
LINEAGE_STRING_FIELDS = (
    "source_version",
    "collector",
    "collector_version",
    "query_version",
    "collected_at",
    "evidence_key",
    "source_id",
    "agent_id",
    "window_start",
)


def _evidence_refs(value: Any, payload: JsonObject | None = None) -> list[JsonObject]:
    lineage_by_key = _lineage_by_reference(payload or {})
    refs: list[JsonObject] = []
    for ref in value if isinstance(value, list) else []:
        if not (isinstance(ref, dict) and ref.get("source") and ref.get("name")):
            continue
        item = {
            "source": str(ref["source"]),
            "name": str(ref["name"]),
            "check_id": ref.get("check_id") or None,
            "summary": ref.get("summary") or None,
            "query": ref.get("query") or None,
            "evidence_ref": ref.get("evidence_ref") or None,
        }
        lineage = {
            **_lineage_fields(ref),
            **_lineage_for_reference(item, lineage_by_key),
        }
        item.update(lineage)
        refs.append(item)
    return refs


def _lineage_by_reference(payload: JsonObject) -> dict[str, JsonObject]:
    bundle = payload.get("evidence_bundle")
    items = bundle.get("items") if isinstance(bundle, dict) else None
    out: dict[str, JsonObject] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        lineage = _lineage_from_value(item.get("value"))
        if not lineage:
            continue
        keys = [
            item.get("evidence_ref"),
            item.get("check_id"),
        ]
        if item.get("source") and item.get("name"):
            keys.append(f"{item['source']}/{item['name']}")
        for key in keys:
            if key:
                out[str(key)] = lineage
    return out


def _lineage_from_value(value: Any) -> JsonObject:
    if not isinstance(value, dict):
        return {}
    lineage = value.get(LINEAGE_KEY)
    return _lineage_fields(lineage) if isinstance(lineage, dict) else {}


def _lineage_for_reference(ref: JsonObject, lineage_by_key: dict[str, JsonObject]) -> JsonObject:
    keys = [
        ref.get("evidence_ref"),
        ref.get("check_id"),
        f"{ref['source']}/{ref['name']}" if ref.get("source") and ref.get("name") else None,
    ]
    for key in keys:
        if key and str(key) in lineage_by_key:
            return lineage_by_key[str(key)]
    return {}


def _lineage_fields(raw: Any) -> JsonObject:
    if not isinstance(raw, dict):
        return {}
    out: JsonObject = {}
    schema_version = raw.get("schema_version")
    if schema_version is not None:
        try:
            out["schema_version"] = int(schema_version)
        except (TypeError, ValueError):
            pass
    for field in LINEAGE_STRING_FIELDS:
        value = raw.get(field)
        if value not in (None, ""):
            out[field] = str(value)
    return out


def _missing_checks(value: Any) -> list[JsonObject]:
    checks: list[JsonObject] = []
    for check in value if isinstance(value, list) else []:
        if not (isinstance(check, dict) and check.get("check_id")):
            continue
        checks.append(
            {
                "check_id": str(check["check_id"]),
                "source": check.get("source"),
                "status": check.get("status"),
                "reason": check.get("reason"),
            }
        )
    return checks


def _workspace_id(current: Any) -> str:
    return getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
