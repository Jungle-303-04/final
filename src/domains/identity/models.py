"""identity 도메인 테이블 — 계정·워크스페이스·레포·클러스터 권한 경계."""

from __future__ import annotations

from typing import Any

from sqlalchemy import ARRAY, BigInteger, ForeignKey, Text, UniqueConstraint
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


class UserAccount(Base):
    __tablename__ = "user_accounts"

    user_id: Mapped[str] = mapped_column(Text, primary_key=True)
    display_name: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
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


class TokenVault(Base):
    __tablename__ = "token_vault"

    token_ref: Mapped[str] = mapped_column(Text, primary_key=True)
    provider: Mapped[str] = text_column()
    encrypted_payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class RepositoryIntegration(Base):
    __tablename__ = "repository_integrations"
    __table_args__ = (UniqueConstraint("workspace_id", "provider", "repository_full_name"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    provider: Mapped[str] = text_column()
    repository_full_name: Mapped[str] = text_column()
    default_branch: Mapped[str] = text_column()
    token_ref: Mapped[str] = mapped_column(ForeignKey("token_vault.token_ref"))
    status: Mapped[str] = text_column()
    settings: Mapped[dict[str, Any]] = jsonb_column()
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
    agent_token_ref: Mapped[str] = mapped_column(ForeignKey("token_vault.token_ref"))
    status: Mapped[str] = text_column()
    settings: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class RepoClusterBinding(Base):
    __tablename__ = "repo_cluster_bindings"
    __table_args__ = (UniqueConstraint("repository_id", "cluster_registration_id", "namespace"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(ForeignKey("repository_integrations.id"))
    cluster_registration_id: Mapped[int] = mapped_column(ForeignKey("cluster_registrations.id"))
    namespace: Mapped[str] = text_column()
    deploy_policy: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()
