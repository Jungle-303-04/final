"""rca 도메인 repository — 증거·RCA 리포트 영속."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import Select, case, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.rca.models import Evidence, RcaBacklogItem, RcaReport, RecoveryPlanRecord
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, iso_or_none

RECOVERY_PLAN_STATUS_SELECTION_REQUESTED = "selection_requested"
RECOVERY_PLAN_STATUS_SELECTED = "selected"
OPEN_RECOVERY_PLAN_STATUSES = (RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,)


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
    ) -> list[JsonObject]:
        """워크스페이스 범위 evidence 목록(최신순) — /evidence 범용 조회 API 용.

        since 는 포함(>=), until 은 미포함(<) 경계. limit/offset 은 호출자(라우터)가 검증함.
        """
        table = Evidence.__table__
        statement: Select[Any] = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(limit)
            .offset(offset)
        )
        if correlation_id is not None:
            statement = statement.where(table.c.correlation_id == correlation_id)
        if kind is not None:
            statement = statement.where(table.c.kind == kind)
        statement = _apply_created_at_window(statement, table, since, until)
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
    ) -> list[JsonObject]:
        """워크스페이스 범위 RCA report 목록(최신순) — /rca-reports 조회 API 용.

        since 는 포함(>=), until 은 미포함(<) 경계. payload 요약은 라우터가 수행함.
        """
        table = RcaReport.__table__
        statement: Select[Any] = (
            select(table)
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.created_at.desc(), table.c.id.desc())
            .limit(limit)
            .offset(offset)
        )
        if correlation_id is not None:
            statement = statement.where(table.c.correlation_id == correlation_id)
        statement = _apply_created_at_window(statement, table, since, until)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [_serialize_created_at(row) for row in rows]

    def upsert_recovery_selection_request(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: JsonObject,
    ) -> None:
        table = RecoveryPlanRecord.__table__
        insert = pg_insert(table).values(
            plan_id=str(plan["plan_id"]),
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            incident_id=str(plan["incident_id"]),
            evidence_ref=str(plan["evidence_ref"]),
            status=RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,
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
        statement = pg_insert(table).values(
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            root_cause=root_cause,
            action=action,
            payload=body,
        )
        with self.connection() as conn:
            conn.execute(statement)


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


def _serialize_created_at(row: Any) -> JsonObject:
    item = dict(row)
    item["created_at"] = iso_or_none(item.get("created_at"))
    return item
