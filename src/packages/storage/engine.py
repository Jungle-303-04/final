from __future__ import annotations

from contextlib import asynccontextmanager, contextmanager
from contextvars import ContextVar
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from packages.config.constants import CommandStatus
from packages.config.settings import required_env
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, AccountRole
from packages.storage.schema import (
    metadata,
)

DATABASE_URL_ENV = "DATABASE_URL"
ERROR_MESSAGE_LIMIT = 2000
DB_LOCK_TIMEOUT = "5s"
DB_STATEMENT_TIMEOUT = "30s"
DB_IDLE_IN_TRANSACTION_TIMEOUT = "30s"
SCHEMA_INIT_LOCK_NAMESPACE = 774897281
SCHEMA_INIT_LOCK_KEY = 20260703

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
EVENT_COMPAT_COLUMNS = {
    "causation_id": "alter table events add column if not exists causation_id text",
}
OUTBOX_COMPAT_COLUMNS = {
    "lease_id": "alter table outbox add column if not exists lease_id text",
    "leased_until": "alter table outbox add column if not exists leased_until timestamptz",
}
OUTBOX_CLAIM_INDEX = (
    "create index if not exists ix_outbox_claim on outbox (source, sent_at, leased_until, id)"
)
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
    "evidence": {
        "workspace_id": "alter table evidence add column if not exists workspace_id text",
    },
    "rca_reports": {
        "workspace_id": "alter table rca_reports add column if not exists workspace_id text",
    },
    # 일반 테이블 컬럼 호환(워크스페이스 한정 아님) — per-cluster agent 토큰 해시 추가.
    # backfill 대상 아님(NULL = 미인증 → 재등록 시 채워짐).
    "cluster_registrations": {
        "agent_token_hash": (
            "alter table cluster_registrations add column if not exists agent_token_hash text"
        ),
    },
}
WORKSPACE_BACKFILL_COLUMNS = (
    "agent_commands",
    "evidence",
    "rca_reports",
)
USER_ACCOUNT_EMAIL_INDEX = (
    "create unique index if not exists ux_user_accounts_email "
    "on user_accounts (email) where email is not null"
)
CLUSTER_AGENT_TOKEN_HASH_INDEX = (
    "create index if not exists ix_cluster_registrations_agent_token_hash "
    "on cluster_registrations (agent_token_hash) where agent_token_hash is not null"
)
OPERATIONAL_INDEXES = (
    (
        "create index if not exists ix_agent_commands_available "
        "on agent_commands (workspace_id, cluster_id, status, created_at) "
        f"where status in ('{CommandStatus.QUEUED}', '{CommandStatus.LEASED}', "
        f"'{CommandStatus.RUNNING}')"
    ),
    ("create index if not exists ix_event_processing_status on event_processing (status)"),
    (
        "create index if not exists ix_event_dead_letters_open "
        f"on event_dead_letters (status, id) where status = '{DEAD_LETTER_STATUS_OPEN}'"
    ),
    (
        "create index if not exists ix_events_correlation_created "
        "on events (correlation_id, created_at)"
    ),
)
REPO_CHANGE_COMPAT_COLUMNS = {
    "workspace_id": "alter table repo_changes add column if not exists workspace_id text",
    "repository_id": "alter table repo_changes add column if not exists repository_id text",
    "watch_target_id": "alter table repo_changes add column if not exists watch_target_id text",
    "binding_id": "alter table repo_changes add column if not exists binding_id text",
    "manifest_path": "alter table repo_changes add column if not exists manifest_path text",
}
MANIFEST_ARTIFACT_COMPAT_COLUMNS = {
    "workspace_id": "alter table manifest_artifacts add column if not exists workspace_id text",
}
MANIFEST_ARTIFACT_DROP_LEGACY_UNIQUE = """
do $$
declare
    old_constraint text;
begin
    select con.conname
    into old_constraint
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = current_schema()
      and rel.relname = 'manifest_artifacts'
      and con.contype = 'u'
      and (
          select array_agg(att.attname::text order by ord.ordinality)
          from unnest(con.conkey) with ordinality as ord(attnum, ordinality)
          join pg_attribute att on att.attrelid = rel.oid and att.attnum = ord.attnum
      ) = array['binding_id', 'commit_sha', 'manifest_path']::text[]
    limit 1;

    if old_constraint is not null then
        execute format('alter table manifest_artifacts drop constraint %I', old_constraint);
    end if;
end $$;
"""
MANIFEST_ARTIFACT_WORKSPACE_UNIQUE = """
create unique index if not exists ux_manifest_artifacts_workspace_binding_commit_path
on manifest_artifacts (workspace_id, binding_id, commit_sha, manifest_path)
"""

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


def has_active_connection() -> bool:
    return _ACTIVE_CONN.get() is not None


def configure_transaction(conn: Connection) -> None:
    conn.execute(text(f"set local lock_timeout = '{DB_LOCK_TIMEOUT}'"))
    conn.execute(text(f"set local statement_timeout = '{DB_STATEMENT_TIMEOUT}'"))
    conn.execute(
        text(f"set local idle_in_transaction_session_timeout = '{DB_IDLE_IN_TRANSACTION_TIMEOUT}'")
    )


def acquire_schema_init_lock(conn: Connection) -> None:
    conn.execute(
        text("select pg_advisory_xact_lock(:namespace, :key)"),
        {"namespace": SCHEMA_INIT_LOCK_NAMESPACE, "key": SCHEMA_INIT_LOCK_KEY},
    )


async def configure_async_transaction(conn: Any) -> None:
    await conn.execute(text(f"set local lock_timeout = '{DB_LOCK_TIMEOUT}'"))
    await conn.execute(text(f"set local statement_timeout = '{DB_STATEMENT_TIMEOUT}'"))
    await conn.execute(
        text(f"set local idle_in_transaction_session_timeout = '{DB_IDLE_IN_TRANSACTION_TIMEOUT}'")
    )


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
            configure_transaction(conn)
            yield conn

    @contextmanager
    def unit_of_work(self):
        """한 트랜잭션 — 안에서 connection() 호출은 모두 이 커넥션을 사용.

        이미 활성 UoW 안이면 새 트랜잭션을 열지 않고 합류 — 중첩 호출이
        바깥 트랜잭션보다 먼저 커밋되는 원자성 파괴 방지(commit 은 최상위 UoW 소유).
        """
        active = _ACTIVE_CONN.get()
        if active is not None:
            yield active
            return
        with self.engine.begin() as conn:
            configure_transaction(conn)
            token = _ACTIVE_CONN.set(conn)
            try:
                yield conn
            finally:
                _ACTIVE_CONN.reset(token)

    @asynccontextmanager
    async def async_connection(self):
        async with self.async_engine.begin() as conn:
            await configure_async_transaction(conn)
            yield conn

    def check_ready(self) -> None:
        """가벼운 연결 확인(SELECT 1) — readiness 프로브용. DDL/마이그레이션 안 함."""
        with self.connection() as conn:
            conn.execute(text("SELECT 1"))

    def init(self) -> None:
        from domains.registry import load_domain_tables

        load_domain_tables()  # domains/*/tables.py 자동 등록(create_all 전)
        with self.engine.begin() as conn:
            configure_transaction(conn)
            acquire_schema_init_lock(conn)
            token = _ACTIVE_CONN.set(conn)
            try:
                metadata.create_all(conn)
                self.ensure_compatible_schema(conn)
                ensure_default_workspace = getattr(self, "ensure_default_workspace", None)
                if callable(ensure_default_workspace):
                    ensure_default_workspace()
            finally:
                _ACTIVE_CONN.reset(token)

    def ensure_compatible_schema(self, existing_conn: Connection | None = None) -> None:
        """Keep local demo DBs usable until a real migration tool is introduced."""
        if existing_conn is not None:
            self._apply_compatible_schema(existing_conn)
            return

        with self.engine.begin() as conn:
            configure_transaction(conn)
            acquire_schema_init_lock(conn)
            self._apply_compatible_schema(conn)

    def _apply_compatible_schema(self, conn: Connection) -> None:
        self._add_missing_columns(conn, "events", EVENT_COMPAT_COLUMNS)
        self._add_missing_columns(conn, "outbox", OUTBOX_COMPAT_COLUMNS)
        conn.execute(text(OUTBOX_CLAIM_INDEX))

        self._add_missing_columns(conn, "agent_commands", AGENT_COMMAND_COMPAT_COLUMNS)
        self._add_missing_columns(conn, "user_accounts", USER_ACCOUNT_COMPAT_COLUMNS)
        conn.execute(text(USER_ACCOUNT_ROLE_BACKFILL))
        conn.execute(text(USER_ACCOUNT_ROLE_DEFAULT))
        conn.execute(text(USER_ACCOUNT_ROLE_NOT_NULL))
        conn.execute(text(USER_ACCOUNT_EMAIL_INDEX))

        self._add_missing_columns(conn, "repo_changes", REPO_CHANGE_COMPAT_COLUMNS)
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

        self._add_missing_columns(conn, "manifest_artifacts", MANIFEST_ARTIFACT_COMPAT_COLUMNS)
        conn.execute(
            text(
                """
                update manifest_artifacts
                set workspace_id = :workspace_id
                where workspace_id is null
                """
            ),
            {"workspace_id": DEFAULT_WORKSPACE_ID},
        )
        conn.execute(
            text(
                f"""
                alter table manifest_artifacts
                alter column workspace_id set default '{DEFAULT_WORKSPACE_ID}'
                """
            )
        )
        conn.execute(text("alter table manifest_artifacts alter column workspace_id set not null"))
        conn.execute(text(MANIFEST_ARTIFACT_DROP_LEGACY_UNIQUE))
        conn.execute(text(MANIFEST_ARTIFACT_WORKSPACE_UNIQUE))

        for table_name, columns in WORKSPACE_COMPAT_COLUMNS.items():
            self._add_missing_columns(conn, table_name, columns)
        conn.execute(text(CLUSTER_AGENT_TOKEN_HASH_INDEX))
        for statement in OPERATIONAL_INDEXES:
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

    def _add_missing_columns(
        self, conn: Connection, table_name: str, columns: dict[str, str]
    ) -> None:
        existing_columns = self._existing_columns(conn, table_name)
        for column, statement in columns.items():
            if column in existing_columns:
                continue
            self._execute_schema_ddl(conn, statement)

    @staticmethod
    def _execute_schema_ddl(conn: Connection, statement: str) -> None:
        conn.execute(text(f"set local lock_timeout = '{DB_LOCK_TIMEOUT}'"))
        conn.execute(text(statement))

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
