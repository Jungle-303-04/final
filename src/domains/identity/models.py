"""identity 도메인 테이블 — OAuth 계정·토큰 볼트."""

from __future__ import annotations

from typing import Any

from sqlalchemy import ARRAY, BigInteger, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class OAuthAccount(Base):
    __tablename__ = "oauth_accounts"
    __table_args__ = (UniqueConstraint("user_id", "provider"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = text_column()
    provider: Mapped[str] = text_column()
    provider_user: Mapped[str] = text_column()
    scopes: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    token_ref: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class TokenVault(Base):
    __tablename__ = "token_vault"

    token_ref: Mapped[str] = mapped_column(Text, primary_key=True)
    provider: Mapped[str] = text_column()
    encrypted_payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
