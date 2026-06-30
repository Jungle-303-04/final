"""command 도메인 테이블 — 에이전트 명령 큐."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class AgentCommand(Base):
    __tablename__ = "agent_commands"

    command_id: Mapped[str] = mapped_column(Text, primary_key=True)
    correlation_id: Mapped[str] = text_column()
    cluster_id: Mapped[str] = text_column()
    action: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    lease_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    agent_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    leased_until: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    started_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    completed_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    result: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
