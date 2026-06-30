from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from packages.config.settings import required_env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.schema import (
    metadata,
)

DATABASE_URL_ENV = "DATABASE_URL"
TOKEN_REF_PREFIX = "vault://oauth"
PLACEHOLDER_CREDENTIAL_NOTE = "provider credential pending Token Broker implementation"
CREDENTIAL_STATUS_PENDING = "pending"
CREDENTIAL_STATUS_READY = "ready"
DASHBOARD_LIMIT = 25
ERROR_MESSAGE_LIMIT = 2000

# 상태 어휘(흩어진 리터럴 단일화)
ACCOUNT_STATUS_CONNECTED = "connected"
DEAD_LETTER_STATUS_OPEN = "open"
DEAD_LETTER_STATUS_REPLAYED = "replayed"
RAW_DEAD_LETTER_SUBJECT = "__decode_failed__"
UNKNOWN_AGENT_ID = "unknown-agent"
DEFAULT_COMMAND_LEASE_SECONDS = 60

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

    def init(self) -> None:
        from domains.registry import load_domain_tables

        load_domain_tables()  # domains/*/tables.py 자동 등록(create_all 전)
        metadata.create_all(self.engine)
        self.ensure_compatible_schema()

    def ensure_compatible_schema(self) -> None:
        """Keep local demo DBs usable until a real migration tool is introduced."""
        statements = (
            "alter table agent_commands add column if not exists lease_id text",
            "alter table agent_commands add column if not exists agent_id text",
            "alter table agent_commands add column if not exists leased_until timestamptz",
            "alter table agent_commands add column if not exists started_at timestamptz",
            "alter table agent_commands add column if not exists completed_at timestamptz",
        )
        with self.engine.begin() as conn:
            for statement in statements:
                conn.execute(text(statement))

    def dispose(self) -> None:
        self.engine.dispose()

    async def dispose_async(self) -> None:
        await self.async_engine.dispose()
