from __future__ import annotations

from typing import Any

from sqlalchemy import BigInteger, Integer, PrimaryKeyConstraint, Text, UniqueConstraint, func
from sqlalchemy import text as sql_text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


def text_column() -> Mapped[str]:
    return mapped_column(Text, nullable=False)


def jsonb_column(default: str | None = None) -> Mapped[dict[str, Any]]:
    server_default = sql_text(default) if default is not None else None
    return mapped_column(JSONB, nullable=False, server_default=server_default)


def created_at_column() -> Mapped[Any]:
    return mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


def updated_at_column() -> Mapped[Any]:
    return mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())


class Event(Base):
    __tablename__ = "events"

    event_id: Mapped[str] = mapped_column(Text, primary_key=True)
    subject: Mapped[str] = text_column()
    source: Mapped[str] = text_column()
    correlation_id: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class RepoChange(Base):
    __tablename__ = "repo_changes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = text_column()
    commit_sha: Mapped[str] = text_column()
    manifest: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class Evidence(Base):
    __tablename__ = "evidence"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = text_column()
    kind: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class RcaReport(Base):
    __tablename__ = "rca_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = text_column()
    root_cause: Mapped[str] = text_column()
    action: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    created_at: Mapped[Any] = created_at_column()


class PullRequest(Base):
    __tablename__ = "pull_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    correlation_id: Mapped[str] = text_column()
    pr_url: Mapped[str] = text_column()
    title: Mapped[str] = text_column()
    body: Mapped[str] = text_column()
    status: Mapped[str] = text_column()
    created_at: Mapped[Any] = created_at_column()


class AgentCommand(Base):
    __tablename__ = "agent_commands"

    command_id: Mapped[str] = mapped_column(Text, primary_key=True)
    correlation_id: Mapped[str] = text_column()
    cluster_id: Mapped[str] = text_column()
    action: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    status: Mapped[str] = text_column()
    result: Mapped[dict[str, Any]] = jsonb_column("'{}'::jsonb")
    created_at: Mapped[Any] = created_at_column()
    updated_at: Mapped[Any] = updated_at_column()


class DashboardCard(Base):
    __tablename__ = "dashboard_cards"

    correlation_id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = text_column()
    summary: Mapped[str] = text_column()
    last_event: Mapped[str] = text_column()
    payload: Mapped[dict[str, Any]] = jsonb_column()
    updated_at: Mapped[Any] = updated_at_column()


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = text_column()
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
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default=sql_text("0"))
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
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default=sql_text("'open'"))
    replayed_at: Mapped[Any | None] = mapped_column(TIMESTAMP(timezone=True))
    replay_event_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[Any] = created_at_column()


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


metadata = Base.metadata

SCHEMA_UPGRADES = (
    "alter table event_dead_letters add column if not exists status text not null default 'open'",
    "alter table event_dead_letters add column if not exists replayed_at timestamptz",
    "alter table event_dead_letters add column if not exists replay_event_id text",
)
