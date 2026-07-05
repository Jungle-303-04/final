"""dashboard 도메인 테이블 — 화면용 read model."""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Float, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import Base, created_at_column, text_column, updated_at_column


class RcaTimeline(Base):
    __tablename__ = "rca_timeline"
    __table_args__ = (UniqueConstraint("workspace_id", "correlation_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    cluster_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    incident_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_subject: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    root_cause: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    supporting_evidence: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    missing_evidence: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    action_route: Mapped[str | None] = mapped_column(Text, nullable=True)
    command_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_event_id: Mapped[str] = text_column()
    last_event_at: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
