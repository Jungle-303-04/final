"""gitops 도메인 테이블."""

from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from packages.storage.base import (
    Base,
    created_at_column,
    jsonb_column,
    text_column,
    updated_at_column,
)


class GitRepository(Base):
    __tablename__ = "git_repositories"
    __table_args__ = (UniqueConstraint("workspace_id", "repo_ref"),)

    repository_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    provider: Mapped[str] = text_column()
    repo_ref: Mapped[str] = text_column()
    default_branch: Mapped[str] = text_column()
    credential_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = text_column()
    access_policy: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class GitWatchTarget(Base):
    __tablename__ = "git_watch_targets"
    __table_args__ = (UniqueConstraint("workspace_id", "repository_id", "branch", "manifest_path"),)

    watch_target_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    repository_id: Mapped[str] = text_column()
    branch: Mapped[str] = text_column()
    manifest_path: Mapped[str] = text_column()
    interval_seconds: Mapped[int] = mapped_column(BigInteger, nullable=False)
    last_seen_commit_sha: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_polled_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
    status: Mapped[str] = text_column()
    settings: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class DeploymentBinding(Base):
    __tablename__ = "deployment_bindings"
    __table_args__ = (
        UniqueConstraint(
            "workspace_id",
            "repository_id",
            "cluster_id",
            "namespace",
            "app_name",
        ),
    )

    binding_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    repository_id: Mapped[str] = text_column()
    watch_target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    cluster_id: Mapped[str] = text_column()
    namespace: Mapped[str] = text_column()
    app_name: Mapped[str] = text_column()
    manifest_path: Mapped[str] = text_column()
    environment: Mapped[str] = text_column()
    resource_class: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    deploy_policy: Mapped[dict[str, Any]] = jsonb_column()
    access_policy: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class ManifestArtifact(Base):
    __tablename__ = "manifest_artifacts"
    __table_args__ = (UniqueConstraint("binding_id", "commit_sha", "manifest_path"),)

    artifact_id: Mapped[str] = mapped_column(Text, primary_key=True)
    workspace_id: Mapped[str] = mapped_column(ForeignKey("workspaces.workspace_id"))
    repository_id: Mapped[str] = text_column()
    watch_target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    binding_id: Mapped[str] = text_column()
    commit_sha: Mapped[str] = text_column()
    manifest_path: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    status_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rendered_manifest: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    source_summary: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class RepoChange(Base):
    __tablename__ = "repo_changes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    workspace_id: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    commit_sha: Mapped[str] = text_column()
    repository_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    watch_target_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    binding_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    manifest_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    manifest: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()
