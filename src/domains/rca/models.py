"""rca 도메인 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    kind: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class RcaReport(Base):
    __tablename__ = "rca_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    root_cause: Mapped[str] = text_column()
    action: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class RcaBacklogItem(Base):
    __tablename__ = "rca_backlog_items"

    backlog_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = text_column()
    incident_id: Mapped[str] = text_column()
    symptom: Mapped[str] = text_column()
    title: Mapped[str] = text_column()
    reason: Mapped[str] = text_column()
    evidence_ref: Mapped[str] = text_column()
    missing_evidence: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class RecoveryPlanRecord(Base):
    __tablename__ = "recovery_plans"
    __table_args__ = (UniqueConstraint("workspace_id", "plan_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    plan_id: Mapped[str] = text_column()
    workspace_id: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    incident_id: Mapped[str] = text_column()
    evidence_ref: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    selected_action_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
