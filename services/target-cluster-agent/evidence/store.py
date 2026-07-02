from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import cast

from packages.contracts.event_bus.interfaces import JsonObject

COLLECTION_STATUS_OPEN = "open"
COLLECTION_STATUS_FAILED = "failed"
COLLECTION_STATUS_UPLOADED = "uploaded"

TASK_STATUS_COMPLETED = "completed"
TASK_STATUS_FAILED = "failed"
TASK_STATUS_LEASED = "leased"
TASK_STATUS_QUEUED = "queued"


@dataclass(frozen=True)
class EvidenceTask:
    collection_id: str
    provider_key: str
    attempt_count: int


class EvidenceTaskStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path, timeout=5.0)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("pragma foreign_keys = on")
        self.conn.execute("pragma journal_mode = wal")
        self.conn.execute("pragma busy_timeout = 5000")
        self.init_schema()

    def init_schema(self) -> None:
        self.conn.executescript(
            """
            create table if not exists evidence_collections (
                collection_id text primary key,
                cluster_id text not null,
                status text not null,
                scheduled_for real not null,
                created_at real not null,
                updated_at real not null
            );

            create table if not exists evidence_tasks (
                collection_id text not null,
                provider_key text not null,
                status text not null,
                lease_until real,
                leased_by text,
                attempt_count integer not null default 0,
                result_json text,
                error text,
                created_at real not null,
                updated_at real not null,
                primary key (collection_id, provider_key),
                foreign key (collection_id)
                    references evidence_collections(collection_id)
                    on delete cascade
            );

            create index if not exists idx_evidence_tasks_provider_status
                on evidence_tasks(provider_key, status, created_at);

            create index if not exists idx_evidence_collections_status
                on evidence_collections(status, scheduled_for);
            """
        )
        self.conn.commit()

    def recover_expired_leases(self, now: float) -> None:
        self.conn.execute(
            """
            update evidence_tasks
            set status = ?, lease_until = null, leased_by = null, updated_at = ?
            where status = ? and lease_until <= ?
            """,
            (TASK_STATUS_QUEUED, now, TASK_STATUS_LEASED, now),
        )
        self.conn.commit()

    def create_collection(
        self,
        collection_id: str,
        cluster_id: str,
        provider_keys: tuple[str, ...],
        scheduled_for: float,
        now: float,
    ) -> bool:
        with self.conn:
            cursor = self.conn.execute(
                """
                insert or ignore into evidence_collections
                    (collection_id, cluster_id, status, scheduled_for, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?)
                """,
                (
                    collection_id,
                    cluster_id,
                    COLLECTION_STATUS_OPEN,
                    scheduled_for,
                    now,
                    now,
                ),
            )
            if cursor.rowcount != 1:
                return False

            self.conn.executemany(
                """
                insert into evidence_tasks
                    (collection_id, provider_key, status, created_at, updated_at)
                values (?, ?, ?, ?, ?)
                """,
                [
                    (collection_id, provider_key, TASK_STATUS_QUEUED, now, now)
                    for provider_key in provider_keys
                ],
            )
            return True

    def lease_task(
        self,
        provider_key: str,
        worker_id: str,
        lease_seconds: int,
        now: float,
    ) -> EvidenceTask | None:
        lease_until = now + lease_seconds
        with self.conn:
            row = self.conn.execute(
                """
                update evidence_tasks
                set status = ?,
                    lease_until = ?,
                    leased_by = ?,
                    attempt_count = attempt_count + 1,
                    error = null,
                    updated_at = ?
                where rowid = (
                    select rowid
                    from evidence_tasks
                    where provider_key = ? and status = ?
                    order by created_at
                    limit 1
                )
                returning collection_id, provider_key, attempt_count
                """,
                (
                    TASK_STATUS_LEASED,
                    lease_until,
                    worker_id,
                    now,
                    provider_key,
                    TASK_STATUS_QUEUED,
                ),
            ).fetchone()
            if row is None:
                return None

        return EvidenceTask(
            collection_id=row["collection_id"],
            provider_key=row["provider_key"],
            attempt_count=int(row["attempt_count"]),
        )

    def complete_task(self, task: EvidenceTask, result: JsonObject, now: float) -> None:
        with self.conn:
            self.conn.execute(
                """
                update evidence_tasks
                set status = ?,
                    lease_until = null,
                    leased_by = null,
                    result_json = ?,
                    error = null,
                    updated_at = ?
                where collection_id = ? and provider_key = ?
                """,
                (
                    TASK_STATUS_COMPLETED,
                    json.dumps(result),
                    now,
                    task.collection_id,
                    task.provider_key,
                ),
            )
            self.touch_collection(task.collection_id, now)

    def fail_task(
        self,
        task: EvidenceTask,
        error: str,
        max_attempts: int,
        now: float,
    ) -> None:
        next_status = (
            TASK_STATUS_FAILED if task.attempt_count >= max_attempts else TASK_STATUS_QUEUED
        )
        with self.conn:
            self.conn.execute(
                """
                update evidence_tasks
                set status = ?,
                    lease_until = null,
                    leased_by = null,
                    error = ?,
                    updated_at = ?
                where collection_id = ? and provider_key = ?
                """,
                (next_status, error, now, task.collection_id, task.provider_key),
            )
            self.touch_collection(task.collection_id, now)

    def next_uploadable_collection(self) -> str | None:
        row = self.conn.execute(
            """
            select c.collection_id
            from evidence_collections c
            where c.status = ?
              and not exists (
                select 1
                from evidence_tasks t
                where t.collection_id = c.collection_id
                  and t.status in (?, ?)
              )
            order by c.scheduled_for
            limit 1
            """,
            (COLLECTION_STATUS_OPEN, TASK_STATUS_QUEUED, TASK_STATUS_LEASED),
        ).fetchone()
        return str(row["collection_id"]) if row else None

    def evidence_payload(self, collection_id: str) -> JsonObject:
        collection = self.conn.execute(
            """
            select cluster_id
            from evidence_collections
            where collection_id = ?
            """,
            (collection_id,),
        ).fetchone()
        if collection is None:
            raise ValueError(f"unknown evidence collection: {collection_id}")

        evidence: JsonObject = {
            "cluster_id": collection["cluster_id"],
            "correlation_id": collection_id,
            "kubernetes": {},
        }
        rows = self.conn.execute(
            """
            select provider_key, status, result_json
            from evidence_tasks
            where collection_id = ?
            order by provider_key
            """,
            (collection_id,),
        ).fetchall()
        for row in rows:
            provider_key = str(row["provider_key"])
            if row["status"] == TASK_STATUS_COMPLETED and row["result_json"]:
                result = json.loads(row["result_json"])
                if not isinstance(result, dict):
                    raise ValueError(f"invalid evidence result for {collection_id}:{provider_key}")
                evidence.update(cast(JsonObject, result))
            elif row["status"] == TASK_STATUS_FAILED:
                evidence.setdefault(provider_key, self.empty_provider_payload(provider_key))
        return evidence

    def mark_uploaded(self, collection_id: str, now: float) -> None:
        with self.conn:
            self.conn.execute(
                """
                update evidence_collections
                set status = ?, updated_at = ?
                where collection_id = ?
                """,
                (COLLECTION_STATUS_UPLOADED, now, collection_id),
            )

    def mark_failed(self, collection_id: str, now: float) -> None:
        with self.conn:
            self.conn.execute(
                """
                update evidence_collections
                set status = ?, updated_at = ?
                where collection_id = ?
                """,
                (COLLECTION_STATUS_FAILED, now, collection_id),
            )

    def collection_has_failed_task(self, collection_id: str) -> bool:
        row = self.conn.execute(
            """
            select 1
            from evidence_tasks
            where collection_id = ? and status = ?
            limit 1
            """,
            (collection_id, TASK_STATUS_FAILED),
        ).fetchone()
        return row is not None

    def has_unuploaded_collection(self) -> bool:
        row = self.conn.execute(
            """
            select 1
            from evidence_collections
            where status = ?
            limit 1
            """,
            (COLLECTION_STATUS_OPEN,),
        ).fetchone()
        return row is not None

    def touch_collection(self, collection_id: str, now: float) -> None:
        self.conn.execute(
            "update evidence_collections set updated_at = ? where collection_id = ?",
            (now, collection_id),
        )

    def empty_provider_payload(self, provider_key: str) -> object:
        if provider_key == "logs":
            return []
        return {}
