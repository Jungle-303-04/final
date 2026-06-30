"""identity 도메인 테이블 — 계정·워크스페이스·클러스터 권한 경계."""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class UserAccount(Base):
    __tablename__ = "user_accounts"
    __table_args__ = (UniqueConstraint("email"),)

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    display_name: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    role: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("slug"),)

    workspace_id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = text_column()
    slug: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("user_accounts.user_id"))
    role: Mapped[str] = text_column()
    permissions: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class ResourceAccessGrant(Base):
    __tablename__ = "resource_access_grants"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "subject_type",
            "subject_id",
            "resource_type",
            "resource_id",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    subject_type: Mapped[str] = text_column()
    subject_id: Mapped[str] = text_column()
    resource_type: Mapped[str] = text_column()
    resource_id: Mapped[str] = text_column()
    role: Mapped[str] = text_column()
    permissions: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class ClusterRegistration(Base):
    __tablename__ = "cluster_registrations"
    __table_args__ = (UniqueConstraint("workspace_id", "cluster_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    cluster_id: Mapped[str] = text_column()
    name: Mapped[str] = text_column()
    environment: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    # per-cluster agent 토큰의 SHA-256 해시(원문 미저장). agent 인증·테넌트 식별의 권위 소스.
    # 기존 등록분은 NULL(재등록 전까지 agent 인증 불가) — 전역 토큰 신뢰 제거.
    agent_token_hash: Mapped[str | None] = mapped_column(Text, nullable=True, index=True)
    settings: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
