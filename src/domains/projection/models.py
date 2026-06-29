"""projection 도메인 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    jsonb_column,
    text_column,
    updated_at_column,
)


class DashboardCard(Base):
    __tablename__ = "dashboard_cards"

    correlation_id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = text_column()
    summary: Mapped[str] = text_column()
    last_event: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    updated_at: Mapped[Any] = updated_at_column()
