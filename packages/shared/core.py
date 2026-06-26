from __future__ import annotations

import json
import os
import time
import uuid
from datetime import UTC, datetime

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
    EventProcessingStatus,
    EventSubject,
)
from packages.shared.contracts import (
    CommandRecord,
    DeadLetterStore,
    Event,
    EventClient,
    EventProcessingRecord,
    EventPublisher,
    EventRecorder,
    EventSubscription,
    InitializableStore,
    JsonObject,
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
ERROR_MESSAGE_LIMIT = 2000


def env(name: str, default: str) -> str:
    return os.getenv(name, default)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def compact_error(error: str) -> str:
    return error[:ERROR_MESSAGE_LIMIT]


def iso_or_none(value: object) -> str | None:
    return value.isoformat() if hasattr(value, "isoformat") else None


def serialize_dead_letter(row: JsonObject) -> JsonObject:
    item = dict(row)
    item["created_at"] = iso_or_none(item.get("created_at"))
    item["replayed_at"] = iso_or_none(item.get("replayed_at"))
    return item


def event(
    subject: str, source: str, payload: JsonObject, correlation_id: str | None = None
) -> Event:
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
            create table if not exists event_processing (
                event_id text not null,
                consumer text not null,
                subject text not null,
                correlation_id text not null,
                status text not null,
                attempts integer not null default 0,
                last_error text,
                created_at timestamptz not null default now(),
                updated_at timestamptz not null default now(),
                primary key (event_id, consumer)
            )
            """,
            """
            create table if not exists event_dead_letters (
                id bigserial primary key,
                original_event_id text not null,
                original_subject text not null,
                consumer text not null,
                correlation_id text not null,
                attempts integer not null,
                error text not null,
                payload jsonb not null,
                status text not null default 'open',
                replayed_at timestamptz,
                replay_event_id text,
                created_at timestamptz not null default now()
            )
            """,
            """
            alter table event_dead_letters
            add column if not exists status text not null default 'open'
            """,
            "alter table event_dead_letters add column if not exists replayed_at timestamptz",
            "alter table event_dead_letters add column if not exists replay_event_id text",
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

    def record_event(self, evt: Event) -> None:
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

    def begin_event_processing(self, evt: Event, consumer: str) -> EventProcessingRecord:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into event_processing (
                        event_id,
                        consumer,
                        subject,
                        correlation_id,
                        status,
                        attempts,
                        updated_at
                    )
                    values (%s, %s, %s, %s, %s, 0, now())
                    on conflict (event_id, consumer) do nothing
                    """,
                    (
                        evt["event_id"],
                        consumer,
                        evt["subject"],
                        evt["correlation_id"],
                        EventProcessingStatus.PROCESSING,
                    ),
                )
                cur.execute(
                    """
                    update event_processing
                    set attempts = attempts + 1,
                        status = %s,
                        last_error = null,
                        updated_at = now()
                    where event_id = %s
                      and consumer = %s
                      and status not in (%s, %s)
                    returning status, attempts
                    """,
                    (
                        EventProcessingStatus.PROCESSING,
                        evt["event_id"],
                        consumer,
                        EventProcessingStatus.PROCESSED,
                        EventProcessingStatus.DEAD_LETTERED,
                    ),
                )
                row = cur.fetchone()
                if row:
                    return {"status": row["status"], "attempts": row["attempts"]}

                cur.execute(
                    """
                    select status, attempts
                    from event_processing
                    where event_id = %s and consumer = %s
                    """,
                    (evt["event_id"], consumer),
                )
                existing = cur.fetchone()
                return dict(existing) if existing else {"status": "unknown", "attempts": 0}

    def finish_event_processing(self, evt: Event, consumer: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update event_processing
                    set status = %s,
                        last_error = null,
                        updated_at = now()
                    where event_id = %s and consumer = %s
                    """,
                    (EventProcessingStatus.PROCESSED, evt["event_id"], consumer),
                )

    def fail_event_processing(self, evt: Event, consumer: str, error: str, status: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update event_processing
                    set status = %s,
                        last_error = %s,
                        updated_at = now()
                    where event_id = %s and consumer = %s
                    """,
                    (
                        status,
                        compact_error(error),
                        evt["event_id"],
                        consumer,
                    ),
                )

    def record_dead_letter(
        self, evt: Event, consumer: str, error: str, attempts: int
    ) -> JsonObject:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into event_dead_letters (
                        original_event_id,
                        original_subject,
                        consumer,
                        correlation_id,
                        attempts,
                        error,
                        payload
                    )
                    values (%s, %s, %s, %s, %s, %s, %s)
                    returning id, created_at
                    """,
                    (
                        evt["event_id"],
                        evt["subject"],
                        consumer,
                        evt["correlation_id"],
                        attempts,
                        compact_error(error),
                        json.dumps(evt["payload"]),
                    ),
                )
                row = cur.fetchone()
                return {
                    "dead_letter_id": row["id"],
                    "original_event_id": evt["event_id"],
                    "original_subject": evt["subject"],
                    "consumer": consumer,
                    "correlation_id": evt["correlation_id"],
                    "attempts": attempts,
                    "error": compact_error(error),
                    "created_at": row["created_at"].isoformat(),
                    "status": "open",
                }

    def list_dead_letters(self, limit: int) -> list[JsonObject]:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id,
                           original_event_id,
                           original_subject,
                           consumer,
                           correlation_id,
                           attempts,
                           error,
                           payload,
                           status,
                           replayed_at,
                           replay_event_id,
                           created_at
                    from event_dead_letters
                    order by created_at desc
                    limit %s
                    """,
                    (limit,),
                )
                return [serialize_dead_letter(row) for row in cur.fetchall()]

    def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select id,
                           original_event_id,
                           original_subject,
                           consumer,
                           correlation_id,
                           attempts,
                           error,
                           payload,
                           status,
                           replayed_at,
                           replay_event_id,
                           created_at
                    from event_dead_letters
                    where id = %s
                    """,
                    (dead_letter_id,),
                )
                row = cur.fetchone()
                return serialize_dead_letter(row) if row else None

    def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update event_dead_letters
                    set status = 'replayed',
                        replayed_at = now(),
                        replay_event_id = %s
                    where id = %s
                    """,
                    (replay_event_id, dead_letter_id),
                )

    def save_oauth_account(self, payload: JsonObject) -> JsonObject:
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

    def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into repo_changes (correlation_id, commit_sha, manifest)
                    values (%s, %s, %s)
                    """,
                    (correlation_id, commit_sha, json.dumps(manifest)),
                )

    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into agent_commands (
                        command_id,
                        correlation_id,
                        cluster_id,
                        action,
                        payload,
                        status,
                        updated_at
                    )
                    values (%s, %s, %s, %s, %s, %s, now())
                    on conflict (command_id) do nothing
                    """,
                    (
                        plan["command_id"],
                        correlation_id,
                        plan["cluster_id"],
                        plan["action"],
                        json.dumps(plan),
                        status,
                    ),
                )

    def lease_agent_command(
        self, cluster_id: str, queued_status: str, leased_status: str
    ) -> CommandRecord | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select command_id, correlation_id, cluster_id, action, payload
                    from agent_commands
                    where cluster_id = %s and status = %s
                    order by created_at
                    limit 1
                    """,
                    (cluster_id, queued_status),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        update agent_commands
                        set status = %s, updated_at = now()
                        where command_id = %s
                        """,
                        (leased_status, row["command_id"]),
                    )
                return dict(row) if row else None

    def complete_agent_command(self, command_id: str, result: JsonObject) -> str | None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update agent_commands
                    set status = %s, result = %s, updated_at = now()
                    where command_id = %s
                    returning correlation_id
                    """,
                    (result["status"], json.dumps(result), command_id),
                )
                row = cur.fetchone()
                return row["correlation_id"] if row else None

    def save_evidence(self, correlation_id: str, kind: str, payload: JsonObject) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "insert into evidence (correlation_id, kind, payload) values (%s, %s, %s)",
                    (correlation_id, kind, json.dumps(payload)),
                )

    def save_rca_report(
        self, correlation_id: str, root_cause: str, action: str, payload: JsonObject
    ) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into rca_reports (correlation_id, root_cause, action, payload)
                    values (%s, %s, %s, %s)
                    """,
                    (correlation_id, root_cause, action, json.dumps(payload)),
                )

    def save_pull_request(
        self, correlation_id: str, pr_url: str, title: str, body: str, status: str
    ) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into pull_requests (correlation_id, pr_url, title, body, status)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (correlation_id, pr_url, title, body, status),
                )

    def upsert_dashboard(self, evt: Event, status: str, summary: str) -> None:
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

    def list_dashboard(self) -> list[JsonObject]:
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

    def append_audit_log(self, evt: Event) -> None:
        with self.connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    insert into audit_log (event_id, subject, source, correlation_id, payload)
                    values (%s, %s, %s, %s, %s)
                    """,
                    (
                        evt["event_id"],
                        evt["subject"],
                        evt["source"],
                        evt["correlation_id"],
                        json.dumps(evt["payload"]),
                    ),
                )


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
        payload: JsonObject,
        correlation_id: str | None = None,
    ) -> Event:
        assert self.js is not None
        evt = event(subject, source, payload, correlation_id)
        await self.js.publish(subject, json.dumps(evt).encode())
        print(f"published {subject} correlation={evt['correlation_id']}", flush=True)
        return evt

    async def subscribe(self, subject: str, durable: str) -> EventSubscription:
        assert self.js is not None
        return await self.js.pull_subscribe(subject, durable=durable, stream=STREAM_NAME)

    async def close(self) -> None:
        if self.nc:
            await self.nc.drain()


class RecordedEventClient:
    def __init__(self, publisher: EventPublisher, recorder: EventRecorder) -> None:
        self.publisher = publisher
        self.recorder = recorder

    async def publish(
        self,
        subject: str,
        source: str,
        payload: JsonObject,
        correlation_id: str | None = None,
    ) -> Event:
        evt = await self.publisher.publish(subject, source, payload, correlation_id)
        self.recorder.record_event(evt)
        return evt


class DeadLetterSink:
    def __init__(
        self,
        events: EventClient,
        store: DeadLetterStore,
        source: str,
    ) -> None:
        self.events = events
        self.store = store
        self.source = source

    async def capture(
        self,
        evt: Event,
        consumer: str,
        error: Exception,
        attempts: int,
    ) -> Event:
        dead_letter = self.store.record_dead_letter(evt, consumer, str(error), attempts)
        return await self.events.publish(
            EventSubject.DEAD_LETTER_CREATED,
            self.source,
            dead_letter,
            evt["correlation_id"],
        )


async def asyncio_sleep(seconds: float) -> None:
    import asyncio

    await asyncio.sleep(seconds)


async def wait_for_database(db: InitializableStore) -> None:
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
    bus: EventPublisher,
    db: EventRecorder,
    subject: str,
    source: str,
    payload: JsonObject,
    correlation_id: str | None = None,
) -> Event:
    return await RecordedEventClient(bus, db).publish(subject, source, payload, correlation_id)
