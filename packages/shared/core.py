from __future__ import annotations

import json
import os
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import nats
import psycopg
from nats.js.errors import NotFoundError
from psycopg.rows import dict_row

from packages.shared.constants import (
    DEFAULT_DATABASE_URL,
    DEFAULT_NATS_URL,
    DEFAULT_SERVICE_NAME,
    GITHUB_PROVIDER,
    LOCAL_USER_ID,
    REQUIRED_GITHUB_SCOPE,
    SERVICE_NAME_ENV,
    STREAM_NAME,
    STREAM_SUBJECTS,
)

DATABASE_URL_ENV = "DATABASE_URL"
NATS_URL_ENV = "NATS_URL"
DEFAULT_OAUTH_SCOPES = ["profile", "email"]
TOKEN_REF_PREFIX = "vault://oauth"
FAKE_ENCRYPTED_TOKEN_NOTE = "fake encrypted provider token payload"
TOKEN_EXPIRES_IN_SECONDS = 3600
DASHBOARD_LIMIT = 25
DEPENDENCY_RETRY_LIMIT = 60
DEPENDENCY_RETRY_DELAY_SECONDS = 2


def env(name: str, default: str) -> str:
    return os.getenv(name, default)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def event(
    subject: str, source: str, payload: dict[str, Any], correlation_id: str | None = None
) -> dict[str, Any]:
    return {
        "event_id": str(uuid.uuid4()),
        "subject": subject,
        "source": source,
        "correlation_id": correlation_id or payload.get("correlation_id") or str(uuid.uuid4()),
        "timestamp": now_iso(),
        "payload": payload,
    }


class Database:
    def __init__(self) -> None:
        self.url = env(DATABASE_URL_ENV, DEFAULT_DATABASE_URL)

    def connect(self):
        return psycopg.connect(self.url, row_factory=dict_row)

    def init(self) -> None:
        ddl = [
            """
            create table if not exists events (
                event_id text primary key,
                subject text not null,
                source text not null,
                correlation_id text not null,
                payload jsonb not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists repo_changes (
                id bigserial primary key,
                correlation_id text not null,
                commit_sha text not null,
                manifest jsonb not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists evidence (
                id bigserial primary key,
                correlation_id text not null,
                kind text not null,
                payload jsonb not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists rca_reports (
                id bigserial primary key,
                correlation_id text not null,
                root_cause text not null,
                action text not null,
                payload jsonb not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists pull_requests (
                id bigserial primary key,
                correlation_id text not null,
                pr_url text not null,
                title text not null,
                body text not null,
                status text not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists agent_commands (
                command_id text primary key,
                correlation_id text not null,
                cluster_id text not null,
                action text not null,
                payload jsonb not null,
                status text not null,
                result jsonb not null default '{}'::jsonb,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists dashboard_cards (
                correlation_id text primary key,
                status text not null,
                summary text not null,
                last_event text not null,
                payload jsonb not null,
                updated_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists audit_log (
                id bigserial primary key,
                event_id text not null,
                subject text not null,
                source text not null,
                correlation_id text not null,
                payload jsonb not null,
                created_at timestamptz not null default now()
            )
            """,
            """
            create table if not exists oauth_accounts (
                id bigserial primary key,
                user_id text not null,
                provider text not null,
                provider_user text not null,
                scopes text[] not null,
                token_ref text not null,
                status text not null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                unique (user_id, provider)
            )
            """,
            """
            create table if not exists token_vault (
                token_ref text primary key,
                provider text not null,
                encrypted_payload jsonb not null,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now()
            )
            """,
        ]
        with self.connect() as conn:
            with conn.cursor() as cur:
                for statement in ddl:
                    cur.execute(statement)

    def record_event(self, evt: dict[str, Any]) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into events (event_id, subject, source, correlation_id, payload)
                    values (%s, %s, %s, %s, %s)
                    on conflict (event_id) do nothing
                    """,
                    (
                        evt["event_id"],
                        evt["subject"],
                        evt["source"],
                        evt["correlation_id"],
                        json.dumps(evt["payload"]),
                    ),
                )

    def save_oauth_account(self, payload: dict[str, Any]) -> dict[str, Any]:
        provider = payload["provider"]
        user_id = payload.get("user_id", LOCAL_USER_ID)
        scopes = payload.get("scopes") or DEFAULT_OAUTH_SCOPES.copy()
        if provider == GITHUB_PROVIDER and REQUIRED_GITHUB_SCOPE not in scopes:
            scopes.append(REQUIRED_GITHUB_SCOPE)
        token_ref = f"{TOKEN_REF_PREFIX}/{provider}/{user_id}/{uuid.uuid4()}"
        provider_user = payload.get("provider_user") or f"{provider}-{user_id}"
        encrypted_payload = {
            "note": FAKE_ENCRYPTED_TOKEN_NOTE,
            "access_token": f"fake-{provider}-access-token",
            "refresh_token": f"fake-{provider}-refresh-token",
            "expires_at": int(time.time()) + TOKEN_EXPIRES_IN_SECONDS,
        }
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into token_vault (token_ref, provider, encrypted_payload)
                    values (%s, %s, %s)
                    """,
                    (token_ref, provider, json.dumps(encrypted_payload)),
                )
                cur.execute(
                    """
                    insert into oauth_accounts
                        (user_id, provider, provider_user, scopes, token_ref, status, updated_at)
                    values (%s, %s, %s, %s, %s, 'connected', now())
                    on conflict (user_id, provider) do update set
                        provider_user = excluded.provider_user,
                        scopes = excluded.scopes,
                        token_ref = excluded.token_ref,
                        status = 'connected',
                        updated_at = now()
                    """,
                    (user_id, provider, provider_user, scopes, token_ref),
                )
        return {
            "user_id": user_id,
            "provider": provider,
            "provider_user": provider_user,
            "scopes": scopes,
            "token_ref": token_ref,
        }

    def latest_github_token_ref(self) -> str | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select token_ref
                    from oauth_accounts
                    where provider = %s and status = 'connected'
                    order by updated_at desc
                    limit 1
                    """,
                    (GITHUB_PROVIDER,),
                )
                row = cur.fetchone()
                return row["token_ref"] if row else None

    def upsert_dashboard(self, evt: dict[str, Any], status: str, summary: str) -> None:
        payload = {
            "last_event_id": evt["event_id"],
            "last_source": evt["source"],
            "last_payload": evt["payload"],
            "updated_at": now_iso(),
        }
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into dashboard_cards
                        (correlation_id, status, summary, last_event, payload, updated_at)
                    values (%s, %s, %s, %s, %s, now())
                    on conflict (correlation_id) do update set
                        status = excluded.status,
                        summary = excluded.summary,
                        last_event = excluded.last_event,
                        payload = excluded.payload,
                        updated_at = now()
                    """,
                    (evt["correlation_id"], status, summary, evt["subject"], json.dumps(payload)),
                )

    def list_dashboard(self) -> list[dict[str, Any]]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select correlation_id, status, summary, last_event, payload, updated_at
                    from dashboard_cards
                    order by updated_at desc
                    limit %s
                    """,
                    (DASHBOARD_LIMIT,),
                )
                return list(cur.fetchall())


class EventBus:
    def __init__(self) -> None:
        self.url = env(NATS_URL_ENV, DEFAULT_NATS_URL)
        self.nc = None
        self.js = None

    async def connect(self) -> None:
        for attempt in range(DEPENDENCY_RETRY_LIMIT):
            try:
                self.nc = await nats.connect(
                    self.url, name=env(SERVICE_NAME_ENV, DEFAULT_SERVICE_NAME)
                )
                self.js = self.nc.jetstream()
                await self.ensure_stream()
                return
            except Exception as exc:
                print(
                    f"waiting for nats ({attempt + 1}/{DEPENDENCY_RETRY_LIMIT}): {exc}", flush=True
                )
                await asyncio_sleep(DEPENDENCY_RETRY_DELAY_SECONDS)
        raise RuntimeError("NATS is not available")

    async def ensure_stream(self) -> None:
        assert self.js is not None
        try:
            info = await self.js.stream_info(STREAM_NAME)
            subjects = sorted(set(info.config.subjects or []) | set(STREAM_SUBJECTS))
            await self.js.update_stream(name=STREAM_NAME, subjects=subjects, storage="file")
        except NotFoundError:
            await self.js.add_stream(name=STREAM_NAME, subjects=STREAM_SUBJECTS, storage="file")

    async def publish(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        assert self.js is not None
        evt = event(subject, source, payload, correlation_id)
        await self.js.publish(subject, json.dumps(evt).encode())
        print(f"published {subject} correlation={evt['correlation_id']}", flush=True)
        return evt

    async def subscribe(self, subject: str, durable: str):
        assert self.js is not None
        return await self.js.pull_subscribe(subject, durable=durable, stream=STREAM_NAME)

    async def close(self) -> None:
        if self.nc:
            await self.nc.drain()


async def asyncio_sleep(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


async def wait_for_database(db: Database) -> None:
    for attempt in range(DEPENDENCY_RETRY_LIMIT):
        try:
            db.init()
            return
        except Exception as exc:
            print(
                f"waiting for postgres ({attempt + 1}/{DEPENDENCY_RETRY_LIMIT}): {exc}",
                flush=True,
            )
            await asyncio_sleep(DEPENDENCY_RETRY_DELAY_SECONDS)
    raise RuntimeError("PostgreSQL is not available")


async def publish_and_record(
    bus: EventBus,
    db: Database,
    subject: str,
    source: str,
    payload: dict[str, Any],
    correlation_id: str | None = None,
) -> dict[str, Any]:
    evt = await bus.publish(subject, source, payload, correlation_id)
    db.record_event(evt)
    return evt
