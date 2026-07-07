"""dashboard read model repository.

이 도메인은 이벤트를 새로 발행하지 않음. 이미 흐른 RCA/command/safe_pr 이벤트를
화면에서 바로 읽기 좋은 timeline row로 투영.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, case, delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.dashboard.models import MetricQueryPreset, MetricWidget, RcaTimeline
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
    EventSubject.RCA_FOLLOWUP_REQUIRED.value: "followup_required",
    EventSubject.RCA_ACTION_REQUIRED.value: "action_required",
    EventSubject.RECOVERY_PLANNED.value: "recovery_planned",
    EventSubject.RECOVERY_SELECTION_REQUESTED.value: "selection_required",
    EventSubject.RECOVERY_ACTION_SELECTED.value: "recovery_selected",
    EventSubject.APPROVAL_RECOMMENDED.value: "approval_recommended",
    EventSubject.COMMAND_REQUESTED.value: "command_requested",
    EventSubject.COMMAND_DISPATCHED.value: "command_dispatched",
    EventSubject.COMMAND_QUEUED_FOR_AGENT.value: "command_queued",
    EventSubject.COMMAND_COMPLETED.value: "command_completed",
    EventSubject.COMMAND_REJECTED.value: "command_rejected",
    EventSubject.SAFE_PR_REQUESTED.value: "pr_requested",
    EventSubject.SAFE_PR_PATCH_PREPARED.value: "pr_patch_prepared",
    EventSubject.DIFF_EXPLAINED.value: "pr_diff_explained",
    EventSubject.SAFE_PR_READY_FOR_CREATION.value: "pr_ready_for_creation",
    EventSubject.SAFE_PR_CREATED.value: "pr_created",
    EventSubject.SAFE_PR_FAILED.value: "pr_failed",
}

# 열린 인시던트 판정 — 아래 종결 status 에 도달하지 않았고 incident_id 가 있는 row 는 open.
# (command 완료/거부, PR 생성/실패가 복구 흐름의 종착점. 그 외 상태는 아직 조치 진행 중)
CLOSED_INCIDENT_STATUSES: tuple[str, ...] = (
    "command_completed",
    "command_rejected",
    "pr_created",
    "pr_failed",
)


class DashboardRepository(DatabaseConnection):
    table = RcaTimeline.__table__

    def list_metric_query_presets(self, workspace_id: str, cluster_id: str) -> list[JsonObject]:
        table = MetricQueryPreset.__table__
        statement: Select[Any] = (
            select(table)
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.updated_at.desc(), table.c.name.asc())
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_metric_query_preset(row) for row in rows]

    def get_metric_query_preset(
        self,
        workspace_id: str,
        cluster_id: str,
        preset_id: str,
    ) -> JsonObject | None:
        table = MetricQueryPreset.__table__
        statement: Select[Any] = select(table).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id == cluster_id,
            table.c.preset_id == preset_id,
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_metric_query_preset(row) if row is not None else None

    def upsert_metric_query_preset(
        self,
        row: JsonObject,
        *,
        conflict_by_name: bool = False,
    ) -> JsonObject:
        table = MetricQueryPreset.__table__
        insert = pg_insert(table).values(**row, updated_at=func.now())
        excluded = insert.excluded
        updates = {
            "description": excluded.description,
            "source": excluded.source,
            "query": excluded.query,
            "range_seconds": excluded.range_seconds,
            "step_seconds": excluded.step_seconds,
            "unit": excluded.unit,
            "created_by": excluded.created_by,
            "metadata": excluded["metadata"],
            "updated_at": func.now(),
        }
        if not conflict_by_name:
            updates["name"] = excluded.name
        statement = insert.on_conflict_do_update(
            index_elements=(
                [table.c.workspace_id, table.c.cluster_id, table.c.name]
                if conflict_by_name
                else [table.c.preset_id]
            ),
            set_=updates,
        ).returning(table)
        with self.connection() as conn:
            saved = conn.execute(statement).mappings().one()
        return serialize_metric_query_preset(saved)

    def delete_metric_query_preset(
        self,
        workspace_id: str,
        cluster_id: str,
        preset_id: str,
    ) -> bool:
        table = MetricQueryPreset.__table__
        statement = (
            delete(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.preset_id == preset_id,
            )
            .returning(table.c.preset_id)
        )
        with self.connection() as conn:
            return conn.execute(statement).first() is not None

    def list_metric_widgets(self, workspace_id: str, cluster_id: str) -> list[JsonObject]:
        table = MetricWidget.__table__
        statement: Select[Any] = (
            select(table)
            .where(table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id)
            .order_by(table.c.updated_at.desc(), table.c.title.asc())
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_metric_widget(row) for row in rows]

    def get_metric_widget(
        self,
        workspace_id: str,
        cluster_id: str,
        widget_id: str,
    ) -> JsonObject | None:
        table = MetricWidget.__table__
        statement: Select[Any] = select(table).where(
            table.c.workspace_id == workspace_id,
            table.c.cluster_id == cluster_id,
            table.c.widget_id == widget_id,
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_metric_widget(row) if row is not None else None

    def upsert_metric_widget(
        self,
        row: JsonObject,
        *,
        conflict_by_title: bool = False,
    ) -> JsonObject:
        table = MetricWidget.__table__
        insert = pg_insert(table).values(**row, updated_at=func.now())
        excluded = insert.excluded
        updates = {
            "query_preset_id": excluded.query_preset_id,
            "kind": excluded.kind,
            "position": excluded.position,
            "settings": excluded.settings,
            "created_by": excluded.created_by,
            "updated_at": func.now(),
        }
        if not conflict_by_title:
            updates["title"] = excluded.title
        statement = insert.on_conflict_do_update(
            index_elements=(
                [table.c.workspace_id, table.c.cluster_id, table.c.title]
                if conflict_by_title
                else [table.c.widget_id]
            ),
            set_=updates,
        ).returning(table)
        with self.connection() as conn:
            saved = conn.execute(statement).mappings().one()
        return serialize_metric_widget(saved)

    def delete_metric_widget(
        self,
        workspace_id: str,
        cluster_id: str,
        widget_id: str,
    ) -> bool:
        table = MetricWidget.__table__
        statement = (
            delete(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.widget_id == widget_id,
            )
            .returning(table.c.widget_id)
        )
        with self.connection() as conn:
            return conn.execute(statement).first() is not None

    def upsert_rca_timeline(self, row: JsonObject) -> None:
        """correlation_id 단위로 최신 RCA 흐름 상태 갱신."""
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
        newer_or_equal_event = insert.excluded.last_event_at >= table.c.last_event_at
        updates.update(
            current_subject=case(
                (newer_or_equal_event, insert.excluded.current_subject),
                else_=table.c.current_subject,
            ),
            status=case((newer_or_equal_event, insert.excluded.status), else_=table.c.status),
            error_reason=case(
                (newer_or_equal_event, insert.excluded.error_reason),
                else_=table.c.error_reason,
            ),
            last_event_id=case(
                (newer_or_equal_event, insert.excluded.last_event_id),
                else_=table.c.last_event_id,
            ),
            last_event_at=case(
                (newer_or_equal_event, insert.excluded.last_event_at),
                else_=table.c.last_event_at,
            ),
            payload=case((newer_or_equal_event, insert.excluded.payload), else_=table.c.payload),
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
        statement = _exclude_non_incident_detection(statement)
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
        statement = _exclude_non_incident_detection(statement)
        statement = _apply_cluster_filter(statement, allowed_cluster_ids)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_timeline_row(row) if row is not None else None

    def count_open_rca_incidents(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None = None,
    ) -> dict[str, int]:
        """fleet 롤업용 — 클러스터별 열린 logical incident 수. 빈 허용 집합이면 {}."""
        if allowed_cluster_ids is not None and not allowed_cluster_ids:
            return {}
        table = RcaTimeline.__table__
        statement: Select[Any] = select(
            table.c.id,
            table.c.cluster_id,
            table.c.incident_id,
            table.c.correlation_id,
            table.c.payload["incident"]["namespace"].astext.label("incident_namespace"),
            table.c.payload["incident"]["resource_kind"].astext.label("incident_resource_kind"),
            table.c.payload["incident"]["resource_name"].astext.label("incident_resource_name"),
            table.c.payload["incident"]["symptom"].astext.label("incident_symptom"),
        ).where(
            table.c.workspace_id == workspace_id,
            table.c.incident_id.is_not(None),
            table.c.cluster_id.is_not(None),
            table.c.status.not_in(CLOSED_INCIDENT_STATUSES),
        )
        statement = _exclude_non_incident_detection(statement)
        statement = _apply_cluster_filter(statement, allowed_cluster_ids)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        grouped: dict[str, set[str]] = {}
        for row in rows:
            cluster_id = str(row["cluster_id"])
            grouped.setdefault(cluster_id, set()).add(
                incident_logical_key_from_projection(dict(row))
            )
        return {cluster_id: len(keys) for cluster_id, keys in grouped.items()}

    def list_open_rca_incidents(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        limit: int = 20,
    ) -> list[JsonObject]:
        """드릴다운용 — 한 클러스터의 열린 logical incident 요약(최신 갱신순)."""
        bounded_limit = max(1, min(limit, 100))
        scan_limit = min(max(bounded_limit * 50, bounded_limit), 5000)
        statement: Select[Any] = (
            select(RcaTimeline.__table__)
            .where(
                RcaTimeline.workspace_id == workspace_id,
                RcaTimeline.cluster_id == cluster_id,
                RcaTimeline.incident_id.is_not(None),
                RcaTimeline.status.not_in(CLOSED_INCIDENT_STATUSES),
            )
            .order_by(RcaTimeline.updated_at.desc())
            .limit(scan_limit)
        )
        statement = _exclude_non_incident_detection(statement)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        seen: set[str] = set()
        items: list[JsonObject] = []
        for row in rows:
            item = serialize_timeline_row(row)
            key = incident_logical_key(item)
            if key in seen:
                continue
            seen.add(key)
            items.append(open_incident_summary(item))
            if len(items) >= bounded_limit:
                break
        return items


def open_incident_summary(row: JsonObject) -> JsonObject:
    """timeline row → 드릴다운 인시던트 요약. payload 원문은 그대로 내리지 않는다."""
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    return {
        "incident_id": row.get("incident_id"),
        "correlation_id": row.get("correlation_id"),
        "symptom": _first_string(payload, ("incident", "symptom"), ("symptom",)),
        "root_cause": row.get("root_cause"),
        "status": row.get("status"),
        "created_at": row.get("created_at"),
    }


def serialize_metric_query_preset(row: Any) -> JsonObject:
    item = dict(row)
    item["metadata"] = dict(item.get("metadata") or item.get("metadata_") or {})
    for key in ("created_at", "updated_at"):
        item[key] = _iso_or_none(item.get(key))
    return item


def serialize_metric_widget(row: Any) -> JsonObject:
    item = dict(row)
    item["position"] = dict(item.get("position") or {})
    item["settings"] = dict(item.get("settings") or {})
    for key in ("created_at", "updated_at"):
        item[key] = _iso_or_none(item.get(key))
    return item


def incident_logical_key(row: JsonObject) -> str:
    """같은 실제 장애를 묶는 key — evidence correlation 폭증을 fleet 수치에서 제거."""
    payload = row.get("payload") if isinstance(row.get("payload"), dict) else {}
    incident = payload.get("incident") if isinstance(payload, dict) else None
    if isinstance(incident, dict):
        parts = (
            row.get("cluster_id"),
            incident.get("namespace"),
            incident.get("resource_kind"),
            incident.get("resource_name"),
            incident.get("symptom"),
        )
        if any(part not in (None, "") for part in parts[1:]):
            return "|".join(str(part or "unknown") for part in parts)
    return str(row.get("incident_id") or row.get("correlation_id") or row.get("id"))


def incident_logical_key_from_projection(row: JsonObject) -> str:
    """count 쿼리용 logical key — payload 전체를 읽지 않고 같은 묶음 규칙을 적용."""
    parts = (
        row.get("cluster_id"),
        row.get("incident_namespace"),
        row.get("incident_resource_kind"),
        row.get("incident_resource_name"),
        row.get("incident_symptom"),
    )
    if any(part not in (None, "") for part in parts[1:]):
        return "|".join(str(part or "unknown") for part in parts)
    return str(row.get("incident_id") or row.get("correlation_id") or row.get("id"))


def timeline_update_from_event(evt: EventEnvelope) -> JsonObject | None:
    status = RCA_TIMELINE_STATUS_BY_SUBJECT.get(str(evt.subject))
    if status is None:
        return None

    payload = evt.payload if isinstance(evt.payload, dict) else {}
    if _is_non_incident_detection(str(evt.subject), payload):
        return None

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


def _exclude_non_incident_detection(statement: Select[Any]) -> Select[Any]:
    """정상 샘플(detected=false)은 RCA timeline/incident 조회에서 제외한다."""
    table = RcaTimeline.__table__
    return statement.where(
        or_(
            table.c.current_subject != EventSubject.INCIDENT_DETECTED.value,
            table.c.payload["detected"].as_boolean().is_(True),
        )
    )


def _is_non_incident_detection(subject: str, payload: JsonObject) -> bool:
    return subject == EventSubject.INCIDENT_DETECTED.value and payload.get("detected") is not True


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
    return (
        _evidence_reference_list(payload, ("rca_detail", "supporting_evidence_refs"))
        or _first_list(payload, ("rca_detail", "supporting_evidence"))
        or _evaluation_reference_list(payload, "supporting_evidence_refs")
        or _evaluation_list(payload, "supporting_evidence")
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


def _evidence_reference_list(payload: JsonObject, path: Path) -> list[str] | None:
    raw = _value_at(payload, path)
    if not isinstance(raw, list):
        return None
    values = [_format_evidence_reference(item) for item in raw if isinstance(item, dict)]
    values = [value for value in values if value]
    return _dedupe(values) if values else None


def _evaluation_reference_list(payload: JsonObject, field: str) -> list[str] | None:
    evaluations = payload.get("evaluations")
    if not isinstance(evaluations, list):
        return None
    values: list[str] = []
    for item in evaluations:
        if not isinstance(item, dict):
            continue
        raw = item.get(field)
        if isinstance(raw, list):
            values.extend(
                value
                for value in (
                    _format_evidence_reference(ref) for ref in raw if isinstance(ref, dict)
                )
                if value
            )
    return _dedupe(values) if values else None


def _format_evidence_reference(item: JsonObject) -> str | None:
    evidence_ref = item.get("evidence_ref")
    source = item.get("source")
    name = item.get("name")
    check_id = item.get("check_id")
    if evidence_ref:
        return str(evidence_ref)
    if source and name:
        return f"{source}:{name}"
    if check_id:
        return str(check_id)
    return None


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
