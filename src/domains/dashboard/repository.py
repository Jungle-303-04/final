"""dashboard read model repository.

이 도메인은 이벤트를 새로 발행하지 않는다. 이미 흐른 RCA/command/safe_pr 이벤트를
화면에서 바로 읽기 좋은 timeline row로 투영한다.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.dashboard.models import RcaTimeline
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.storage.engine import DatabaseConnection

Path = tuple[str, ...]

RCA_TIMELINE_STATUS_BY_SUBJECT: dict[str, str] = {
    EventSubject.CLUSTER_EVIDENCE_RECEIVED.value: "evidence_received",
    EventSubject.EVIDENCE_BUILT.value: "evidence_built",
    EventSubject.INCIDENT_DETECTED.value: "incident_detected",
    EventSubject.EVIDENCE_BUNDLE_BUILT.value: "evidence_bundled",
    EventSubject.RCA_RULE_MISSING.value: "rule_missing",
    EventSubject.RCA_BACKLOG_ITEM_CREATED.value: "backlog_created",
    EventSubject.RCA_AI_FALLBACK_REQUESTED.value: "ai_fallback_requested",
    EventSubject.RCA_CANDIDATES_PLANNED.value: "rca_planned",
    EventSubject.RCA_CANDIDATES_EVALUATED.value: "rca_evaluated",
    EventSubject.RCA_COMPLETED.value: "rca_completed",
    EventSubject.RCA_ACTION_REQUIRED.value: "action_required",
    EventSubject.RECOVERY_PLANNED.value: "recovery_planned",
    EventSubject.RECOVERY_SELECTION_REQUESTED.value: "selection_required",
    EventSubject.RECOVERY_ACTION_SELECTED.value: "recovery_selected",
    EventSubject.COMMAND_REQUESTED.value: "command_requested",
    EventSubject.COMMAND_DISPATCH_READY.value: "command_dispatch_ready",
    EventSubject.COMMAND_DISPATCHED.value: "command_dispatched",
    EventSubject.COMMAND_QUEUED_FOR_AGENT.value: "command_queued",
    EventSubject.COMMAND_COMPLETED.value: "command_completed",
    EventSubject.COMMAND_REJECTED.value: "command_rejected",
    EventSubject.SAFE_PR_REQUESTED.value: "pr_requested",
    EventSubject.SAFE_PR_PATCH_PREPARED.value: "pr_patch_prepared",
    EventSubject.DIFF_EXPLAINED.value: "pr_diff_explained",
    EventSubject.SAFE_PR_CREATED.value: "pr_created",
    EventSubject.SAFE_PR_FAILED.value: "pr_failed",
}


class DashboardRepository(DatabaseConnection):
    table = RcaTimeline.__table__

    def upsert_rca_timeline(self, row: JsonObject) -> None:
        """correlation_id 단위로 최신 RCA 흐름 상태를 갱신한다."""
        table = RcaTimeline.__table__
        insert = pg_insert(table).values(**row, updated_at=func.now())
        preserve_when_missing = (
            "cluster_id",
            "incident_id",
            "evidence_ref",
            "root_cause",
            "confidence",
            "supporting_evidence",
            "missing_evidence",
            "action_route",
            "command_id",
            "pr_url",
        )
        updates = {
            key: func.coalesce(getattr(insert.excluded, key), getattr(table.c, key))
            for key in preserve_when_missing
        }
        updates.update(
            current_subject=insert.excluded.current_subject,
            status=insert.excluded.status,
            error_reason=insert.excluded.error_reason,
            last_event_id=insert.excluded.last_event_id,
            last_event_at=insert.excluded.last_event_at,
            payload=insert.excluded.payload,
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.correlation_id],
            set_=updates,
        )
        with self.connection() as conn:
            conn.execute(statement)

    def list_rca_timeline(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
        limit: int = 50,
    ) -> list[JsonObject]:
        if allowed_cluster_ids == set():
            return []
        statement: Select[Any] = (
            select(RcaTimeline.__table__)
            .where(RcaTimeline.workspace_id == workspace_id)
            .order_by(RcaTimeline.updated_at.desc())
            .limit(limit)
        )
        statement = _apply_cluster_filter(statement, allowed_cluster_ids)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_timeline_row(row) for row in rows]

    def get_rca_timeline_item(
        self,
        workspace_id: str,
        incident_id: str,
        allowed_cluster_ids: set[str] | None,
    ) -> JsonObject | None:
        if allowed_cluster_ids == set():
            return None
        statement: Select[Any] = (
            select(RcaTimeline.__table__)
            .where(
                RcaTimeline.workspace_id == workspace_id,
                RcaTimeline.incident_id == incident_id,
            )
            .order_by(RcaTimeline.updated_at.desc())
            .limit(1)
        )
        statement = _apply_cluster_filter(statement, allowed_cluster_ids)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_timeline_row(row) if row is not None else None


def timeline_update_from_event(evt: EventEnvelope) -> JsonObject | None:
    status = RCA_TIMELINE_STATUS_BY_SUBJECT.get(str(evt.subject))
    if status is None:
        return None

    payload = evt.payload if isinstance(evt.payload, dict) else {}
    row: JsonObject = {
        "workspace_id": _workspace_id(payload),
        "correlation_id": evt.correlation_id or evt.event_id,
        "cluster_id": _cluster_id(payload),
        "incident_id": _incident_id(payload),
        "evidence_ref": _evidence_ref(payload),
        "current_subject": str(evt.subject),
        "status": status,
        "root_cause": _root_cause(payload),
        "confidence": _confidence(payload),
        "supporting_evidence": _supporting_evidence(payload),
        "missing_evidence": _missing_evidence(payload),
        "action_route": _action_route(str(evt.subject), payload),
        "command_id": _command_id(payload),
        "pr_url": _pr_url(payload),
        "error_reason": _error_reason(payload),
        "last_event_id": evt.event_id,
        "last_event_at": str(evt.created_at),
        "payload": payload,
    }
    return row


def serialize_timeline_row(row: Any) -> JsonObject:
    item = dict(row)
    for key in ("created_at", "updated_at"):
        item[key] = _iso_or_none(item.get(key))
    item["supporting_evidence"] = item.get("supporting_evidence") or []
    item["missing_evidence"] = item.get("missing_evidence") or []
    return item


def _apply_cluster_filter(
    statement: Select[Any], allowed_cluster_ids: set[str] | None
) -> Select[Any]:
    if allowed_cluster_ids is None:
        return statement
    return statement.where(RcaTimeline.cluster_id.in_(allowed_cluster_ids))


def _workspace_id(payload: JsonObject) -> str:
    return (
        _first_string(
            payload,
            ("workspace_id",),
            ("evidence", "workspace_id"),
            ("incident", "workspace_id"),
            ("rule_missing", "workspace_id"),
            ("plan", "target", "workspace_id"),
            ("plan", "workspace_id"),
            ("selected", "draft", "params", "workspace_id"),
            ("diff", "workspace_id"),
            ("requested", "workspace_id"),
            ("requested", "diff", "workspace_id"),
            ("result", "workspace_id"),
        )
        or DEFAULT_WORKSPACE_ID
    )


def _cluster_id(payload: JsonObject) -> str | None:
    return _first_string(
        payload,
        ("cluster_id",),
        ("evidence", "cluster_id"),
        ("incident", "cluster_id"),
        ("plan", "target", "cluster_id"),
        ("plan", "cluster_id"),
        ("selected", "draft", "params", "cluster_id"),
        ("diff", "cluster_id"),
        ("requested", "cluster_id"),
        ("requested", "diff", "cluster_id"),
        ("result", "cluster_id"),
    )


def _incident_id(payload: JsonObject) -> str | None:
    return _first_string(
        payload,
        ("incident_id",),
        ("incident", "incident_id"),
        ("evidence_bundle", "incident_id"),
        ("plan", "incident_id"),
        ("rule_missing", "incident_id"),
        ("requested", "incident_id"),
    )


def _evidence_ref(payload: JsonObject) -> str | None:
    return _first_string(
        payload,
        ("evidence_ref",),
        ("evidence", "object_ref"),
        ("plan", "evidence_ref"),
        ("rule_missing", "evidence_ref"),
        ("requested", "evidence_ref"),
    )


def _root_cause(payload: JsonObject) -> str | None:
    return _first_string(payload, ("root_cause",), ("rca_detail", "root_cause"))


def _confidence(payload: JsonObject) -> float | None:
    value = _first_value(payload, ("rca_detail", "confidence"), ("confidence",))
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _supporting_evidence(payload: JsonObject) -> list[str] | None:
    return _first_list(payload, ("rca_detail", "supporting_evidence")) or _evaluation_list(
        payload, "supporting_evidence"
    )


def _missing_evidence(payload: JsonObject) -> list[str] | None:
    return (
        _first_list(
            payload,
            ("rca_detail", "missing_evidence"),
            ("evidence_bundle", "missing_evidence"),
            ("rule_missing", "missing_evidence"),
            ("missing_evidence",),
        )
        or _evaluation_list(payload, "missing_evidence")
        or None
    )


def _action_route(subject: str, payload: JsonObject) -> str | None:
    route = _first_string(payload, ("plan", "execution_route"), ("selected", "route"))
    if route:
        return route
    if subject.startswith("command."):
        return "command"
    if subject.startswith("safe_pr.") or subject == EventSubject.DIFF_EXPLAINED.value:
        return "safe_pr"
    return None


def _command_id(payload: JsonObject) -> str | None:
    return _first_string(
        payload, ("command_id",), ("plan", "command_id"), ("requested", "command_id")
    )


def _pr_url(payload: JsonObject) -> str | None:
    return _first_string(payload, ("pr_url",), ("pull_request", "url"))


def _error_reason(payload: JsonObject) -> str | None:
    return _first_string(
        payload,
        ("reason",),
        ("rule_missing", "message"),
        ("error",),
        ("result", "message"),
    )


def _first_string(payload: JsonObject, *paths: Path) -> str | None:
    value = _first_value(payload, *paths)
    if value is None or value == "":
        return None
    return str(value)


def _first_value(payload: JsonObject, *paths: Path) -> Any | None:
    for path in paths:
        value = _value_at(payload, path)
        if value is not None:
            return value
    return None


def _first_list(payload: JsonObject, *paths: Path) -> list[str] | None:
    for path in paths:
        value = _value_at(payload, path)
        if isinstance(value, list):
            items = [str(item) for item in value if item not in (None, "")]
            if items:
                return _dedupe(items)
    return None


def _evaluation_list(payload: JsonObject, field: str) -> list[str] | None:
    evaluations = payload.get("evaluations")
    if not isinstance(evaluations, list):
        return None
    values: list[str] = []
    for item in evaluations:
        if not isinstance(item, dict):
            continue
        raw = item.get(field)
        if isinstance(raw, list):
            values.extend(str(value) for value in raw if value not in (None, ""))
    return _dedupe(values) if values else None


def _value_at(payload: JsonObject, path: Path) -> Any | None:
    cursor: Any = payload
    for key in path:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
    return cursor


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return result


def _iso_or_none(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None
