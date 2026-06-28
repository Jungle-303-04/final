from __future__ import annotations

import asyncio
import time
import uuid
from contextlib import asynccontextmanager, contextmanager
from typing import Any

from sqlalchemy import create_engine, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from packages.config.constants import Auth, GitHub, Postgres
from packages.config.errors import fail
from packages.config.settings import env
from packages.config.time import now_iso
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.interfaces import CommandRecord, EventProcessingRecord, InitializableStore
from packages.storage.schema import (
    AgentCommand,
    AuditLog,
    DashboardCard,
    EventDeadLetter,
    EventModel,
    EventProcessing,
    Evidence,
    OAuthAccount,
    PullRequest,
    RcaReport,
    RepoChange,
    TokenVault,
    metadata,
)

DATABASE_URL_ENV = "DATABASE_URL"
DEFAULT_OAUTH_SCOPES = ["profile", "email"]
TOKEN_REF_PREFIX = "vault://oauth"
FAKE_ENCRYPTED_TOKEN_NOTE = "fake encrypted provider token payload"
TOKEN_EXPIRES_IN_SECONDS = 3600
DASHBOARD_LIMIT = 25
DEPENDENCY_RETRY_LIMIT = 60
DEPENDENCY_RETRY_DELAY_SECONDS = 2
ERROR_MESSAGE_LIMIT = 2000


def compact_error(error: str) -> str:
    return error[:ERROR_MESSAGE_LIMIT]


def iso_or_none(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def serialize_dead_letter(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["replayed_at"] = iso_or_none(item.get("replayed_at"))
    return item


def row_dict(row: Any) -> JsonObject:
    return dict(row)


class DatabaseConnection:
    def __init__(self) -> None:
        self.url = env(DATABASE_URL_ENV, Postgres.DEFAULT_URL)
        self.engine: Engine = create_engine(self.sqlalchemy_url)
        self.async_engine: AsyncEngine = create_async_engine(self.sqlalchemy_url)

    @property
    def sqlalchemy_url(self) -> str:
        return self.url.replace("postgresql://", "postgresql+psycopg://", 1)

    @contextmanager
    def connection(self):
        with self.engine.begin() as conn:
            yield conn

    @asynccontextmanager
    async def async_connection(self):
        async with self.async_engine.begin() as conn:
            yield conn

    def init(self) -> None:
        metadata.create_all(self.engine)

    def dispose(self) -> None:
        self.engine.dispose()

    async def dispose_async(self) -> None:
        await self.async_engine.dispose()


class EventRepository(DatabaseConnection):
    def record_event(self, evt: EventEnvelope) -> None:
        table = EventModel.__table__
        statement = (
            pg_insert(table)
            .values(
                event_id=evt.event_id,
                subject=evt.subject,
                source=evt.source,
                correlation_id=evt.correlation_id,
                payload=evt.payload,
            )
            .on_conflict_do_nothing(index_elements=[table.c.event_id])
        )
        with self.connection() as conn:
            conn.execute(statement)

    def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> EventProcessingRecord:
        table = EventProcessing.__table__
        with self.connection() as conn:
            self.insert_event_processing(conn, table, evt, consumer)
            row = self.claim_event_processing(conn, table, evt, consumer)
            if row:
                return EventProcessingRecord(status=row["status"], attempts=row["attempts"])

            existing = self.get_event_processing(conn, table, evt, consumer)
            if existing:
                return EventProcessingRecord(
                    status=existing["status"], attempts=existing["attempts"]
                )
            return EventProcessingRecord(status="unknown", attempts=0)

    def insert_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> None:
        statement = (
            pg_insert(table)
            .values(
                event_id=evt.event_id,
                consumer=consumer,
                subject=evt.subject,
                correlation_id=evt.correlation_id,
                status=EventProcessingStatus.PROCESSING,
                attempts=0,
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.event_id, table.c.consumer])
        )
        conn.execute(statement)

    def claim_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> JsonObject | None:
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id)
            .where(table.c.consumer == consumer)
            .where(
                table.c.status.not_in(
                    (EventProcessingStatus.PROCESSED, EventProcessingStatus.DEAD_LETTERED)
                )
            )
            .values(
                attempts=table.c.attempts + 1,
                status=EventProcessingStatus.PROCESSING,
                last_error=None,
                updated_at=func.now(),
            )
            .returning(table.c.status, table.c.attempts)
        )
        row = conn.execute(statement).mappings().first()
        return row_dict(row) if row else None

    def get_event_processing(
        self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str
    ) -> JsonObject | None:
        statement = select(table.c.status, table.c.attempts).where(
            table.c.event_id == evt.event_id, table.c.consumer == consumer
        )
        row = conn.execute(statement).mappings().first()
        return row_dict(row) if row else None

    def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None:
        table = EventProcessing.__table__
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(status=EventProcessingStatus.PROCESSED, last_error=None, updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)

    def fail_event_processing(
        self, evt: EventEnvelope, consumer: str, error: str, status: str
    ) -> None:
        table = EventProcessing.__table__
        statement = (
            update(table)
            .where(table.c.event_id == evt.event_id, table.c.consumer == consumer)
            .values(status=status, last_error=compact_error(error), updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)


class DeadLetterRepository(DatabaseConnection):
    def record_dead_letter(
        self, evt: EventEnvelope, consumer: str, error: str, attempts: int
    ) -> JsonObject:
        table = EventDeadLetter.__table__
        statement = (
            pg_insert(table)
            .values(
                original_event_id=evt.event_id,
                original_subject=evt.subject,
                consumer=consumer,
                correlation_id=evt.correlation_id,
                attempts=attempts,
                error=compact_error(error),
                payload=evt.payload,
                status="open",
            )
            .returning(table.c.id, table.c.created_at)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().one()
        return {
            "dead_letter_id": row["id"],
            "original_event_id": evt.event_id,
            "original_subject": evt.subject,
            "consumer": consumer,
            "correlation_id": evt.correlation_id,
            "attempts": attempts,
            "error": compact_error(error),
            "created_at": row["created_at"].isoformat(),
            "status": "open",
        }

    def list_dead_letters(self, limit: int) -> list[JsonObject]:
        table = EventDeadLetter.__table__
        statement = select(table).order_by(table.c.created_at.desc()).limit(limit)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [serialize_dead_letter(row) for row in rows]

    def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None:
        table = EventDeadLetter.__table__
        statement = select(table).where(table.c.id == dead_letter_id)
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return serialize_dead_letter(row) if row else None

    def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> None:
        table = EventDeadLetter.__table__
        statement = (
            update(table)
            .where(table.c.id == dead_letter_id)
            .values(status="replayed", replayed_at=func.now(), replay_event_id=replay_event_id)
        )
        with self.connection() as conn:
            conn.execute(statement)


class OAuthRepository(DatabaseConnection):
    def save_oauth_account(self, payload: JsonObject) -> JsonObject:
        provider = payload["provider"]
        user_id = payload.get("user_id", Auth.LOCAL_USER_ID)
        scopes = payload.get("scopes") or DEFAULT_OAUTH_SCOPES.copy()
        if provider == GitHub.PROVIDER and GitHub.REQUIRED_SCOPE not in scopes:
            scopes.append(GitHub.REQUIRED_SCOPE)
        token_ref = f"{TOKEN_REF_PREFIX}/{provider}/{user_id}/{uuid.uuid4()}"
        provider_user = payload.get("provider_user") or f"{provider}-{user_id}"
        encrypted_payload = {
            "note": FAKE_ENCRYPTED_TOKEN_NOTE,
            "access_token": f"fake-{provider}-access-token",
            "refresh_token": f"fake-{provider}-refresh-token",
            "expires_at": int(time.time()) + TOKEN_EXPIRES_IN_SECONDS,
        }
        token_table = TokenVault.__table__
        account_table = OAuthAccount.__table__
        token_statement = pg_insert(token_table).values(
            token_ref=token_ref, provider=provider, encrypted_payload=encrypted_payload
        )
        account_insert = pg_insert(account_table).values(
            user_id=user_id,
            provider=provider,
            provider_user=provider_user,
            scopes=scopes,
            token_ref=token_ref,
            status="connected",
            updated_at=func.now(),
        )
        account_statement = account_insert.on_conflict_do_update(
            index_elements=[account_table.c.user_id, account_table.c.provider],
            set_={
                "provider_user": account_insert.excluded.provider_user,
                "scopes": account_insert.excluded.scopes,
                "token_ref": account_insert.excluded.token_ref,
                "status": "connected",
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(token_statement)
            conn.execute(account_statement)
        return {
            "user_id": user_id,
            "provider": provider,
            "provider_user": provider_user,
            "scopes": scopes,
            "token_ref": token_ref,
        }

    def latest_github_token_ref(self) -> str | None:
        table = OAuthAccount.__table__
        statement = (
            select(table.c.token_ref)
            .where(table.c.provider == GitHub.PROVIDER, table.c.status == "connected")
            .order_by(table.c.updated_at.desc())
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return row["token_ref"] if row else None


class RepoChangeRepository(DatabaseConnection):
    def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject) -> None:
        table = RepoChange.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, commit_sha=commit_sha, manifest=manifest
        )
        with self.connection() as conn:
            conn.execute(statement)


class AgentCommandRepository(DatabaseConnection):
    async def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        table = AgentCommand.__table__
        statement = (
            pg_insert(table)
            .values(
                command_id=plan["command_id"],
                correlation_id=correlation_id,
                cluster_id=plan["cluster_id"],
                action=plan["action"],
                payload=plan,
                status=status,
                result={},
                updated_at=func.now(),
            )
            .on_conflict_do_nothing(index_elements=[table.c.command_id])
        )
        async with self.async_connection() as conn:
            await conn.execute(statement)

    async def lease_agent_command(
        self, cluster_id: str, queued_status: str, leased_status: str
    ) -> CommandRecord | None:
        table = AgentCommand.__table__
        find_statement = (
            select(
                table.c.command_id,
                table.c.correlation_id,
                table.c.cluster_id,
                table.c.action,
                table.c.payload,
            )
            .where(table.c.cluster_id == cluster_id, table.c.status == queued_status)
            .order_by(table.c.created_at)
            .limit(1)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(find_statement)).mappings().first()
            if row:
                await self.mark_agent_command_leased(conn, table, row["command_id"], leased_status)
            return row_dict(row) if row else None

    async def mark_agent_command_leased(
        self, conn: AsyncConnection, table: Any, command_id: str, leased_status: str
    ) -> None:
        statement = (
            update(table)
            .where(table.c.command_id == command_id)
            .values(status=leased_status, updated_at=func.now())
        )
        await conn.execute(statement)

    async def complete_agent_command(self, command_id: str, result: JsonObject) -> str | None:
        table = AgentCommand.__table__
        statement = (
            update(table)
            .where(table.c.command_id == command_id)
            .values(status=result["status"], result=result, updated_at=func.now())
            .returning(table.c.correlation_id)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row["correlation_id"] if row else None


class RcaRepository(DatabaseConnection):
    def save_evidence(self, correlation_id: str, kind: str, payload: JsonObject) -> None:
        table = Evidence.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, kind=kind, payload=payload
        )
        with self.connection() as conn:
            conn.execute(statement)

    def save_rca_report(
        self, correlation_id: str, root_cause: str, action: str, payload: JsonObject
    ) -> None:
        table = RcaReport.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, root_cause=root_cause, action=action, payload=payload
        )
        with self.connection() as conn:
            conn.execute(statement)

    def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None:
        table = PullRequest.__table__
        statement = pg_insert(table).values(
            correlation_id=correlation_id, pr_url=pr_url, title=title, body=body, status=status
        )
        with self.connection() as conn:
            conn.execute(statement)


class DashboardRepository(DatabaseConnection):
    def upsert_dashboard(self, evt: EventEnvelope, status: str, summary: str) -> None:
        payload = {
            "last_event_id": evt.event_id,
            "last_source": evt.source,
            "last_payload": evt.payload,
            "updated_at": now_iso(),
        }
        table = DashboardCard.__table__
        insert_statement = pg_insert(table).values(
            correlation_id=evt.correlation_id,
            status=status,
            summary=summary,
            last_event=evt.subject,
            payload=payload,
            updated_at=func.now(),
        )
        statement = insert_statement.on_conflict_do_update(
            index_elements=[table.c.correlation_id],
            set_={
                "status": insert_statement.excluded.status,
                "summary": insert_statement.excluded.summary,
                "last_event": insert_statement.excluded.last_event,
                "payload": insert_statement.excluded.payload,
                "updated_at": func.now(),
            },
        )
        with self.connection() as conn:
            conn.execute(statement)

    def list_dashboard(self) -> list[JsonObject]:
        table = DashboardCard.__table__
        statement = select(table).order_by(table.c.updated_at.desc()).limit(DASHBOARD_LIMIT)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [row_dict(row) for row in rows]


class AuditLogRepository(DatabaseConnection):
    def append_audit_log(self, evt: EventEnvelope) -> None:
        table = AuditLog.__table__
        statement = pg_insert(table).values(
            event_id=evt.event_id,
            subject=evt.subject,
            source=evt.source,
            correlation_id=evt.correlation_id,
            payload=evt.payload,
        )
        with self.connection() as conn:
            conn.execute(statement)


class Database(
    EventRepository,
    DeadLetterRepository,
    OAuthRepository,
    RepoChangeRepository,
    AgentCommandRepository,
    RcaRepository,
    DashboardRepository,
    AuditLogRepository,
):
    pass


async def wait_for_database(db: InitializableStore) -> None:
    for attempt in range(DEPENDENCY_RETRY_LIMIT):
        try:
            db.init()
            return
        except Exception as exc:
            message = f"waiting for postgres ({attempt + 1}/{DEPENDENCY_RETRY_LIMIT}): {exc}"
            print(message, flush=True)
            await asyncio.sleep(DEPENDENCY_RETRY_DELAY_SECONDS)
    fail("PostgreSQL 에 연결할 수 없다")
