"""rca 도메인 repository — 증거·RCA 리포트 영속."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import Select, and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.rca.models import (
    Evidence,
    IncidentSignalClaim,
    RcaBacklogItem,
    RcaReport,
    RecoveryPlanRecord,
)
from domains.rca.report_narrative import (
    RCA_NARRATIVE_PAYLOAD_KEY,
    RCA_NARRATIVE_STATUS_KEY,
)
from domains.rca.report_projection import rca_report_projection
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.event_bus.subjects import EventSubject
from packages.storage.engine import DatabaseConnection, iso_or_none
from packages.storage.schema import EventModel

RECOVERY_PLAN_STATUS_SELECTION_REQUESTED = "selection_requested"
RECOVERY_PLAN_STATUS_SELECTED = "selected"
BACKLOG_STATUS_OPEN = "open"
BACKLOG_STATUS_RESOLVED = "resolved"
BACKLOG_RULE_RESOLVED_REASON = "matching RCA rule is now available"
OPEN_RECOVERY_PLAN_STATUSES = (RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,)


def _rca_report_summary_columns() -> tuple[Any, ...]:
    """목록 API 에 필요한 작은 projection 만 읽어 payload DB I/O 를 피한다."""
    table = RcaReport.__table__
    return (
        table.c.id,
        table.c.workspace_id,
        table.c.correlation_id,
        table.c.root_cause,
        table.c.action,
        table.c.incident_id,
        table.c.cluster_id,
        table.c.symptom,
        table.c.severity,
        table.c.payload["incident"]["first_seen_at"].astext.label("first_seen_at"),
        table.c.confidence,
        table.c.reason,
        table.c.evidence_ref,
        table.c.supporting_evidence,
        table.c.missing_evidence,
        table.c.payload["rca_detail"]["evidence_summary"].astext.label("evidence_summary"),
        table.c.payload["rca_detail"]["evidence_bundle_summary"].astext.label(
            "evidence_bundle_summary"
        ),
        table.c.resource_kind,
        table.c.resource_name,
        table.c.namespace,
        table.c.secondary_symptoms,
        table.c.selected_candidate_id,
        table.c.candidates,
        table.c.supporting_evidence_refs,
        table.c.missing_evidence_checks,
        table.c.payload[RCA_NARRATIVE_PAYLOAD_KEY].label(RCA_NARRATIVE_PAYLOAD_KEY),
        table.c.payload[RCA_NARRATIVE_STATUS_KEY].astext.label(RCA_NARRATIVE_STATUS_KEY),
        table.c.created_at,
    )


class RcaRepository(DatabaseConnection):
    def save_evidence(
        self, correlation_id: str, workspace_id: str, kind: str, body: JsonObject
    ) -> None:
        table = Evidence.__table__
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            kind=kind,
            payload=body,
        )
        with self.connection() as conn:
            conn.execute(statement)

    def get_evidence_payload(
        self,
        workspace_id: str,
        correlation_id: str,
        kind: str,
    ) -> JsonObject | None:
        table = Evidence.__table__
        statement = (
            select(table.c.payload)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.correlation_id == correlation_id,
                table.c.kind == kind,
            )
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(1)
        )
        with self.connection() as conn:
            payload = conn.execute(statement).scalar_one_or_none()
        return payload if isinstance(payload, dict) else None

    def claim_incident_signal(
        self,
        workspace_id: str,
        cluster_id: str,
        signal_key: str,
        correlation_id: str,
        payload: JsonObject,
    ) -> bool:
        """Atomically claim one concrete termination before emitting an incident.

        PostgreSQL arbitrates concurrent workers through the unique identity.
        Returning ``False`` means this exact termination was already handled,
        including by a worker process that has since restarted.
        """
        table = IncidentSignalClaim.__table__
        statement = (
            pg_insert(table)
            .values(
                workspace_id=workspace_id,
                cluster_id=cluster_id,
                signal_key=signal_key,
                first_correlation_id=correlation_id,
                payload=payload,
            )
            .on_conflict_do_nothing(
                constraint="uq_incident_signal_claim_identity",
            )
            .returning(table.c.id)
        )
        with self.connection() as conn:
            return conn.execute(statement).scalar_one_or_none() is not None

    def upsert_rca_backlog_item(self, body: JsonObject) -> None:
        table = RcaBacklogItem.__table__
        insert_statement = pg_insert(table).values(
            backlog_id=body["backlog_id"],
            workspace_id=body["workspace_id"],
            incident_id=body["incident_id"],
            symptom=body["symptom"],
            title=body["title"],
            reason=body["reason"],
            evidence_ref=body["evidence_ref"],
            missing_evidence={"items": body["missing_evidence"]},
            status=body["status"],
            occurrence_count=1,
            payload=body["payload"],
            updated_at=func.now(),
        )
        statement = insert_statement.on_conflict_do_update(
            index_elements=[table.c.backlog_id],
            set_={
                "incident_id": insert_statement.excluded.incident_id,
                "reason": insert_statement.excluded.reason,
                "evidence_ref": insert_statement.excluded.evidence_ref,
                "missing_evidence": insert_statement.excluded.missing_evidence,
                "status": insert_statement.excluded.status,
                "occurrence_count": table.c.occurrence_count + 1,
                "payload": insert_statement.excluded.payload,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def resolve_rca_backlog_item_for_rule(
        self,
        workspace_id: str,
        symptom: str,
        reason: str = BACKLOG_RULE_RESOLVED_REASON,
    ) -> int:
        """매칭 룰이 생긴 symptom 의 missing-rule backlog 를 닫는다."""
        table = RcaBacklogItem.__table__
        backlog_id = f"missing-cause-rule:{workspace_id}:{symptom}"
        statement = (
            table.update()
            .where(
                table.c.backlog_id == backlog_id,
                table.c.workspace_id == workspace_id,
                table.c.status == BACKLOG_STATUS_OPEN,
            )
            .values(status=BACKLOG_STATUS_RESOLVED, reason=reason, updated_at=func.now())
            .returning(table.c.backlog_id)
        )
        with self.connection() as conn:
            return len(conn.execute(statement).all())

    def list_rca_reports(self, workspace_id: str, *, limit: int = 5) -> list[JsonObject]:
        """최근 RCA 리포트 조회(최신순) — AI 도구 등 읽기 전용 소비자용."""
        table = RcaReport.__table__
        statement = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(limit)
        )
        with self.connection() as conn:
            return [dict(row) for row in conn.execute(statement).mappings()]

    def list_evidence_records(
        self,
        workspace_id: str,
        *,
        correlation_id: str | None = None,
        kind: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
        cursor: tuple[datetime, int] | None = None,
    ) -> list[JsonObject]:
        """워크스페이스 범위 evidence 목록(최신순) — /evidence 범용 조회 API 용.

        since 는 포함(>=), until 은 미포함(<) 경계.
        cursor 가 있으면 (created_at, id) keyset 을 우선하고, 없으면 offset 하위호환을 쓴다.
        """
        table = Evidence.__table__
        statement: Select[Any] = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(limit)
        )
        if correlation_id is not None:
            statement = statement.where(table.c.correlation_id == correlation_id)
        if kind is not None:
            statement = statement.where(table.c.kind == kind)
        statement = _apply_created_at_window(statement, table, since, until)
        statement = _apply_keyset_or_offset(statement, table, cursor, offset)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [_serialize_created_at(row) for row in rows]

    def list_rca_report_records(
        self,
        workspace_id: str,
        *,
        correlation_id: str | None = None,
        since: datetime | None = None,
        until: datetime | None = None,
        limit: int = 50,
        offset: int = 0,
        cursor: tuple[datetime, int] | None = None,
    ) -> list[JsonObject]:
        """워크스페이스 범위 RCA report 목록(최신순) — /rca-reports 조회 API 용.

        since 는 포함(>=), until 은 미포함(<) 경계. payload 요약은 라우터가 수행함.
        cursor 가 있으면 (created_at, id) keyset 을 우선하고, 없으면 offset 하위호환을 쓴다.
        """
        table = RcaReport.__table__
        statement: Select[Any] = (
            select(*_rca_report_summary_columns())
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(limit)
        )
        if correlation_id is not None:
            statement = statement.where(table.c.correlation_id == correlation_id)
        statement = _apply_created_at_window(statement, table, since, until)
        statement = _apply_keyset_or_offset(statement, table, cursor, offset)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [_serialize_created_at(row) for row in rows]

    def get_rca_test_analysis_outcome(
        self,
        correlation_id: str,
        workspace_id: str,
    ) -> JsonObject | None:
        """Return the latest terminal RCA-test analysis event for one tenant/run."""
        table = EventModel.__table__
        statement = (
            select(table.c.subject, table.c.payload)
            .where(
                table.c.correlation_id == correlation_id,
                table.c.payload["workspace_id"].astext == workspace_id,
                or_(
                    table.c.subject == EventSubject.RCA_ANALYSIS_BLOCKED.value,
                    and_(
                        table.c.subject == EventSubject.INCIDENT_DETECTED.value,
                        table.c.payload["detected"].as_boolean().is_(False),
                    ),
                ),
            )
            .order_by(table.c.created_at.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def upsert_recovery_selection_request(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: JsonObject,
    ) -> None:
        self.upsert_recovery_plan(
            correlation_id,
            workspace_id,
            plan,
            status=RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,
        )

    def upsert_recovery_plan(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: JsonObject,
        *,
        status: str,
        selected_action_id: str | None = None,
        selected_by: str | None = None,
    ) -> None:
        """Persist every generated plan, including the auto-selected path.

        recovery.planned is an operator-visible read model boundary. Previously only
        selection_requested plans were stored, so a valid recovery.planned audit event
        could lead to a 404 in the incident detail after automatic selection.
        """
        if status not in {
            RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,
            RECOVERY_PLAN_STATUS_SELECTED,
        }:
            raise ValueError(f"Unsupported recovery plan status: {status}")
        table = RecoveryPlanRecord.__table__
        insert = pg_insert(table).values(
            plan_id=str(plan["plan_id"]),
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            incident_id=str(plan["incident_id"]),
            evidence_ref=str(plan["evidence_ref"]),
            status=status,
            selected_action_id=selected_action_id,
            selected_by=selected_by,
            payload=plan,
            updated_at=func.now(),
        )
        statement = insert.on_conflict_do_update(
            index_elements=[table.c.workspace_id, table.c.plan_id],
            set_={
                "correlation_id": insert.excluded.correlation_id,
                "incident_id": insert.excluded.incident_id,
                "evidence_ref": insert.excluded.evidence_ref,
                "status": case(
                    (
                        table.c.status == RECOVERY_PLAN_STATUS_SELECTED,
                        table.c.status,
                    ),
                    else_=insert.excluded.status,
                ),
                "selected_action_id": case(
                    (
                        table.c.status == RECOVERY_PLAN_STATUS_SELECTED,
                        table.c.selected_action_id,
                    ),
                    else_=insert.excluded.selected_action_id,
                ),
                "selected_by": case(
                    (
                        table.c.status == RECOVERY_PLAN_STATUS_SELECTED,
                        table.c.selected_by,
                    ),
                    else_=insert.excluded.selected_by,
                ),
                "payload": insert.excluded.payload,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def get_recovery_plan(self, plan_id: str, workspace_id: str) -> JsonObject | None:
        table = RecoveryPlanRecord.__table__
        statement = (
            select(
                table.c.plan_id,
                table.c.workspace_id,
                table.c.correlation_id,
                table.c.incident_id,
                table.c.evidence_ref,
                table.c.status,
                table.c.selected_action_id,
                table.c.selected_by,
                table.c.payload,
            )
            .where(table.c.plan_id == plan_id, table.c.workspace_id == workspace_id)
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def get_recovery_plan_by_correlation(
        self, correlation_id: str, workspace_id: str
    ) -> JsonObject | None:
        table = RecoveryPlanRecord.__table__
        statement = (
            select(
                table.c.plan_id,
                table.c.workspace_id,
                table.c.correlation_id,
                table.c.incident_id,
                table.c.evidence_ref,
                table.c.status,
                table.c.selected_action_id,
                table.c.selected_by,
                table.c.payload,
            )
            .where(
                table.c.correlation_id == correlation_id,
                table.c.workspace_id == workspace_id,
            )
            .order_by(table.c.updated_at.desc(), table.c.id.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def select_recovery_plan_action_if_open(
        self,
        plan_id: str,
        workspace_id: str,
        action_id: str,
        selected_by: str,
    ) -> JsonObject | None:
        table = RecoveryPlanRecord.__table__
        statement = (
            table.update()
            .where(
                table.c.plan_id == plan_id,
                table.c.workspace_id == workspace_id,
                table.c.status.in_(OPEN_RECOVERY_PLAN_STATUSES),
            )
            .values(
                status=RECOVERY_PLAN_STATUS_SELECTED,
                selected_action_id=action_id,
                selected_by=selected_by,
                updated_at=func.now(),
            )
            .returning(table.c.payload, table.c.correlation_id)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row else None

    def save_rca_report(
        self,
        correlation_id: str,
        workspace_id: str,
        root_cause: str,
        action: str,
        body: JsonObject,
    ) -> None:
        table = RcaReport.__table__
        projection = rca_report_projection(body)
        # Narrative and additive evidence summaries remain in the existing
        # JSON payload. The latter are exposed by ``rca_report_summary`` but
        # intentionally have no dedicated storage columns.
        projection.pop(RCA_NARRATIVE_PAYLOAD_KEY, None)
        projection.pop(RCA_NARRATIVE_STATUS_KEY, None)
        projection.pop("evidence_summary", None)
        projection.pop("evidence_bundle_summary", None)
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            root_cause=root_cause,
            action=action,
            **projection,
            payload=body,
        )
        with self.connection() as conn:
            conn.execute(statement)

    def find_recent_rca_report(
        self,
        workspace_id: str,
        root_cause: str,
        resource_key: str,
        window_seconds: int,
    ) -> JsonObject | None:
        """같은 (workspace, root_cause, 대상 리소스) 리포트가 최근 window 안에 있는지 조회.

        장애가 지속되는 동안 evidence 주기(~10s)마다 동일 리포트가 무한 적재되는 것을
        막는 dedup 조회 — rca-worker 가 저장 전에 호출한다(있으면 저장 생략).
        리소스 비교는 저장 시 만든 projection 컬럼을 Python 에서
        `rca_report_resource_key` 로 비교한다(JSONB 원문 읽기 방지).
        """
        table = RcaReport.__table__
        threshold = datetime.now(UTC) - timedelta(seconds=window_seconds)
        statement = (
            select(
                table.c.id,
                table.c.correlation_id,
                table.c.cluster_id,
                table.c.namespace,
                table.c.resource_kind,
                table.c.resource_name,
                table.c.created_at,
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.root_cause == root_cause,
                table.c.created_at >= threshold,
            )
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(20)
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        for row in rows:
            if rca_report_resource_key(row) == resource_key:
                return {
                    "id": row["id"],
                    "correlation_id": row["correlation_id"],
                    "created_at": iso_or_none(row.get("created_at")),
                }
        return None


def rca_report_resource_key(incident: Mapping[str, Any] | None) -> str:
    """리포트 dedup 용 대상 리소스 키 — `namespace/kind/name` (incident 없으면 "unknown")."""
    if not isinstance(incident, Mapping):
        return "unknown"
    return (
        f"{incident.get('namespace') or 'unknown'}"
        f"/{incident.get('resource_kind') or 'unknown'}"
        f"/{incident.get('resource_name') or 'unknown'}"
    )


def _apply_created_at_window(
    statement: Select[Any],
    table: Any,
    since: datetime | None,
    until: datetime | None,
) -> Select[Any]:
    if since is not None:
        statement = statement.where(table.c.created_at >= since)
    if until is not None:
        statement = statement.where(table.c.created_at < until)
    return statement


def _apply_keyset_or_offset(
    statement: Select[Any],
    table: Any,
    cursor: tuple[datetime, int] | None,
    offset: int,
) -> Select[Any]:
    if cursor is None:
        return statement.offset(offset)
    created_at, row_id = cursor
    # 최신순 정렬에서 cursor 다음 페이지는 더 오래된 시각 또는 같은 시각의 더 작은 id 다.
    return statement.where(
        or_(
            table.c.created_at < created_at,
            and_(table.c.created_at == created_at, table.c.id < row_id),
        )
    )


def _serialize_created_at(row: Any) -> JsonObject:
    item = dict(row)
    item["created_at"] = iso_or_none(item.get("created_at"))
    return item
