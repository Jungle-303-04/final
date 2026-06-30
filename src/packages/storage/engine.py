from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from packages.config.settings import required_env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, AccountRole
from packages.storage.schema import (
    metadata,
)

DATABASE_URL_ENV = "DATABASE_URL"
DASHBOARD_LIMIT = 25
ERROR_MESSAGE_LIMIT = 2000

# 상태 어휘(흩어진 리터럴 단일화)
DEAD_LETTER_STATUS_OPEN = "open"
DEAD_LETTER_STATUS_REPLAYED = "replayed"
RAW_DEAD_LETTER_SUBJECT = "__decode_failed__"
UNKNOWN_AGENT_ID = "unknown-agent"
DEFAULT_COMMAND_LEASE_SECONDS = 60
AGENT_COMMAND_COMPAT_COLUMNS = {
    "lease_id": "alter table agent_commands add column if not exists lease_id text",
    "agent_id": "alter table agent_commands add column if not exists agent_id text",
    "leased_until": "alter table agent_commands add column if not exists leased_until timestamptz",
    "started_at": "alter table agent_commands add column if not exists started_at timestamptz",
    "completed_at": "alter table agent_commands add column if not exists completed_at timestamptz",
}
USER_ACCOUNT_COMPAT_COLUMNS = {
    "email": "alter table user_accounts add column if not exists email text",
    "password_hash": "alter table user_accounts add column if not exists password_hash text",
    "role": "alter table user_accounts add column if not exists role text",
}
USER_ACCOUNT_ROLE_BACKFILL = f"""
with ranked as (
    select user_id,
           row_number() over (order by created_at, user_id) as row_number
    from user_accounts
    where role is null
)
update user_accounts as users
set role = case
    when ranked.row_number = 1 then '{AccountRole.ADMIN.value}'
    else '{AccountRole.MEMBER.value}'
end
from ranked
where users.user_id = ranked.user_id
"""
USER_ACCOUNT_ROLE_DEFAULT = (
    f"alter table user_accounts alter column role set default '{AccountRole.MEMBER.value}'"
)
USER_ACCOUNT_ROLE_NOT_NULL = "alter table user_accounts alter column role set not null"
WORKSPACE_COMPAT_COLUMNS = {
    "agent_commands": {
        "workspace_id": "alter table agent_commands add column if not exists workspace_id text",
    },
    "dashboard_cards": {
        "workspace_id": "alter table dashboard_cards add column if not exists workspace_id text",
    },
    "evidence": {
        "workspace_id": "alter table evidence add column if not exists workspace_id text",
    },
    "rca_reports": {
        "workspace_id": "alter table rca_reports add column if not exists workspace_id text",
    },
}
WORKSPACE_BACKFILL_COLUMNS = (
    "agent_commands",
    "dashboard_cards",
    "evidence",
    "rca_reports",
)
USER_ACCOUNT_EMAIL_INDEX = (
    "create unique index if not exists ux_user_accounts_email "
    "on user_accounts (email) where email is not null"
)
REPO_CHANGE_COMPAT_COLUMNS = {
    "workspace_id": "alter table repo_changes add column if not exists workspace_id text",
    "repository_id": "alter table repo_changes add column if not exists repository_id text",
    "watch_target_id": "alter table repo_changes add column if not exists watch_target_id text",
    "binding_id": "alter table repo_changes add column if not exists binding_id text",
    "manifest_path": "alter table repo_changes add column if not exists manifest_path text",
}

# 풀 제어: 앱은 PgBouncer 로 연결(싸다). pre_ping 으로 죽은 연결은 쓰기 전에 폐기,
# timeout 으로 하트비트 창(30s) 안에 빨리 실패.
# prepare_threshold=None: PgBouncer transaction pooling 에서 prepared statement 가
# 트랜잭션을 가로질러 깨지지 않도록 psycopg server-side prepared statement 비활성화.
POOL_OPTIONS = {
    "pool_size": 2,
    "max_overflow": 2,
    "pool_timeout": 10,
    "pool_pre_ping": True,
    "pool_recycle": 300,
    "connect_args": {"prepare_threshold": None},
}


def compact_error(error: str) -> str:
    return error[:ERROR_MESSAGE_LIMIT]


def iso_or_none(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def serialize_dead_letter(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["replayed_at"] = iso_or_none(item.get("replayed_at"))
    return item


def serialize_command(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["leased_until"] = iso_or_none(item.get("leased_until"))
    return item


def row_dict(row: Any) -> JsonObject:
    return dict(row)


_ACTIVE_CONN: ContextVar[Connection | None] = ContextVar("active_conn", default=None)


class DatabaseConnection:
    def __init__(self) -> None:
        self.url = required_env(DATABASE_URL_ENV)
        self.engine: Engine = create_engine(self.sqlalchemy_url, **POOL_OPTIONS)
        self.async_engine: AsyncEngine = create_async_engine(self.sqlalchemy_url, **POOL_OPTIONS)

    @property
    def sqlalchemy_url(self) -> str:
        return self.url.replace("postgresql://", "postgresql+psycopg://", 1)

    @contextmanager
    def connection(self):
        active = _ACTIVE_CONN.get()
        if active is not None:
            yield active  # UoW 트랜잭션에 합류(commit 은 UoW 소유)
            return
        with self.engine.begin() as conn:
            yield conn

    @contextmanager
    def unit_of_work(self):
        """한 트랜잭션 — 안에서 connection() 호출은 모두 이 커넥션을 쓴다."""
        with self.engine.begin() as conn:
            token = _ACTIVE_CONN.set(conn)
            try:
                yield conn
            finally:
                _ACTIVE_CONN.reset(token)

    @asynccontextmanager
    async def async_connection(self):
        async with self.async_engine.begin() as conn:
            yield conn

    def check_ready(self) -> None:
        """가벼운 연결 확인(SELECT 1) — readiness 프로브용. DDL/마이그레이션 안 함."""
        with self.connection() as conn:
            conn.execute(text("SELECT 1"))

    def init(self) -> None:
        from domains.registry import load_domain_tables

        load_domain_tables()  # domains/*/tables.py 자동 등록(create_all 전)
        metadata.create_all(self.engine)
        self.ensure_compatible_schema()
        ensure_default_workspace = getattr(self, "ensure_default_workspace", None)
        if callable(ensure_default_workspace):
            ensure_default_workspace()

    def ensure_compatible_schema(self) -> None:
        """Keep local demo DBs usable until a real migration tool is introduced."""
        with self.engine.begin() as conn:
            existing_columns = self._existing_columns(conn, "agent_commands")
            for column, statement in AGENT_COMMAND_COMPAT_COLUMNS.items():
                if column in existing_columns:
                    continue
                conn.execute(text("set local lock_timeout = '5s'"))
                conn.execute(text(statement))

            existing_user_columns = self._existing_columns(conn, "user_accounts")
            for column, statement in USER_ACCOUNT_COMPAT_COLUMNS.items():
                if column in existing_user_columns:
                    continue
                conn.execute(text("set local lock_timeout = '5s'"))
                conn.execute(text(statement))
            conn.execute(text(USER_ACCOUNT_ROLE_BACKFILL))
            conn.execute(text(USER_ACCOUNT_ROLE_DEFAULT))
            conn.execute(text(USER_ACCOUNT_ROLE_NOT_NULL))
            conn.execute(text(USER_ACCOUNT_EMAIL_INDEX))

            existing_repo_change_columns = self._existing_columns(conn, "repo_changes")
            for column, statement in REPO_CHANGE_COMPAT_COLUMNS.items():
                if column in existing_repo_change_columns:
                    continue
                conn.execute(text("set local lock_timeout = '5s'"))
                conn.execute(text(statement))
            conn.execute(
                text(
                    """
                    update repo_changes
                    set workspace_id = :workspace_id
                    where workspace_id is null
                    """
                ),
                {"workspace_id": DEFAULT_WORKSPACE_ID},
            )
            conn.execute(
                text(
                    f"""
                    alter table repo_changes
                    alter column workspace_id set default '{DEFAULT_WORKSPACE_ID}'
                    """
                )
            )
            conn.execute(text("alter table repo_changes alter column workspace_id set not null"))

            for table_name, columns in WORKSPACE_COMPAT_COLUMNS.items():
                existing_table_columns = self._existing_columns(conn, table_name)
                for column, statement in columns.items():
                    if column in existing_table_columns:
                        continue
                    conn.execute(text("set local lock_timeout = '5s'"))
                    conn.execute(text(statement))

            for table_name in WORKSPACE_BACKFILL_COLUMNS:
                conn.execute(
                    text(
                        f"""
                        update {table_name}
                        set workspace_id = :workspace_id
                        where workspace_id is null
                        """
                    ),
                    {"workspace_id": DEFAULT_WORKSPACE_ID},
                )
                conn.execute(
                    text(
                        f"""
                        alter table {table_name}
                        alter column workspace_id set default '{DEFAULT_WORKSPACE_ID}'
                        """
                    )
                )
                conn.execute(
                    text(
                        f"""
                        alter table {table_name}
                        alter column workspace_id set not null
                        """
                    )
                )

    @staticmethod
    def _existing_columns(conn: Connection, table_name: str) -> set[str]:
        return set(
            conn.execute(
                text(
                    """
                    select column_name
                    from information_schema.columns
                    where table_schema = current_schema()
                      and table_name = :table_name
                    """
                ),
                {"table_name": table_name},
            ).scalars()
        )

    def dispose(self) -> None:
        self.engine.dispose()

    async def dispose_async(self) -> None:
        await self.async_engine.dispose()
