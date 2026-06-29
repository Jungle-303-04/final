from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Integer, PrimaryKeyConstraint, Text
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class EventModel(Base):
    __tablename__ = "events"

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    subject: Mapped[str] = text_column()
    source: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class EventProcessing(Base):
    __tablename__ = "event_processing"
    __table_args__ = (PrimaryKeyConstraint("event_id", "consumer"),)

    event_id: Mapped[str] = mapped_column(Text, nullable=False)
    consumer: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class EventDeadLetter(Base):
    __tablename__ = "event_dead_letters"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    original_event_id: Mapped[str] = text_column()
    original_subject: Mapped[str] = text_column()
    consumer: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    attempts: Mapped[int] = mapped_column(Integer, nullable=False)
    error: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    replayed_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True))
    replay_event_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[Any] = created_at_column()


class OutboxModel(Base):
    __tablename__ = "outbox"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    subject: Mapped[str] = text_column()
    source: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    causation_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    sent_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)


metadata = Base.metadata
