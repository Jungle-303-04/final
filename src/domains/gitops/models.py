"""gitops 도메인 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import Base, created_at_column, jsonb_column, text_column


class RepoChange(Base):
    __tablename__ = "repo_changes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = text_column()
    commit_sha: Mapped[str] = text_column()
    manifest: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
