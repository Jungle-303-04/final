"""AI 대화 read model 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class AiConversation(Base):
    __tablename__ = "ai_conversations"

    conversation_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = text_column()
    user_id: Mapped[str] = text_column()
    title: Mapped[str] = text_column()
    agent: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    context: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class AiConversationMessage(Base):
    __tablename__ = "ai_conversation_messages"

    message_id: Mapped[str] = mapped_column(Text, primary_key=True)
    conversation_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("ai_conversations.conversation_id", ondelete="CASCADE"),
        nullable=False,
    )
    workspace_id: Mapped[str] = text_column()
    role: Mapped[str] = text_column()
    content: Mapped[str] = text_column()
    agent: Mapped[str] = text_column()
    correlation_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    message_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSONB, nullable=False)
    created_at: Mapped[Any] = created_at_column()
