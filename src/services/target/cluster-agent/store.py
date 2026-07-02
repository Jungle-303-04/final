from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

from work_queue import (
    LocalStoreConfig,
    OutboundItem,
    OutboundKind,
    QueueJob,
    QueueName,
    WorkStatus,
)

from packages.contracts.event_bus.interfaces import JsonObject


class LocalStore:
    """Pod-local SQLite store for target-agent queues and outbound retry spool."""

    def __init__(self, db_path: str = LocalStoreConfig.DEFAULT_DB_PATH) -> None:
        self.db_path = db_path
        if db_path != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(db_path)
        self.conn.row_factory = sqlite3.Row

    def close(self) -> None:
        self.conn.close()

    def init(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS queue_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                queue_name TEXT NOT NULL,
                job_key TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                priority INTEGER NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                locked_by TEXT,
                locked_until TEXT,
                available_at TEXT NOT NULL,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(queue_name, job_key)
            );

            CREATE INDEX IF NOT EXISTS idx_queue_jobs_lease
                ON queue_jobs(queue_name, status, available_at, priority, created_at);

            CREATE TABLE IF NOT EXISTS outbound_spool (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                item_key TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                priority INTEGER NOT NULL,
                status TEXT NOT NULL,
                attempts INTEGER NOT NULL DEFAULT 0,
                locked_by TEXT,
                locked_until TEXT,
                next_attempt_at TEXT NOT NULL,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_outbound_spool_lease
                ON outbound_spool(status, next_attempt_at, priority, created_at);
            """
        )

    def enqueue_job(
        self,
        queue_name: QueueName | str,
        job_key: str,
        payload: JsonObject,
        priority: int = LocalStoreConfig.DEFAULT_PRIORITY,
    ) -> int:
        now = utcnow()
        with self.conn:
            self.conn.execute(
                """
                INSERT OR IGNORE INTO queue_jobs (
                    queue_name, job_key, payload_json, priority, status, available_at,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(queue_name),
                    job_key,
                    encode_payload(payload),
                    priority,
                    WorkStatus.PENDING.value,
                    now,
                    now,
                    now,
                ),
            )
        return int(
            self.conn.execute(
                "SELECT id FROM queue_jobs WHERE queue_name = ? AND job_key = ?",
                (str(queue_name), job_key),
            ).fetchone()["id"]
        )

    def lease_job(
        self,
        queue_name: QueueName | str,
        worker_id: str,
        lease_seconds: int = LocalStoreConfig.DEFAULT_LEASE_SECONDS,
    ) -> QueueJob | None:
        now = utcnow()
        leased_until = utcnow(timedelta(seconds=lease_seconds))
        with self.conn:
            row = self.conn.execute(
                """
                SELECT * FROM queue_jobs
                WHERE queue_name = ?
                  AND (
                    (status IN (?, ?) AND available_at <= ?)
                    OR (status = ? AND locked_until <= ?)
                  )
                ORDER BY priority ASC, created_at ASC
                LIMIT 1
                """,
                (
                    str(queue_name),
                    WorkStatus.PENDING.value,
                    WorkStatus.FAILED.value,
                    now,
                    WorkStatus.LEASED.value,
                    now,
                ),
            ).fetchone()
            if row is None:
                return None
            self.conn.execute(
                """
                UPDATE queue_jobs
                SET status = ?, locked_by = ?, locked_until = ?, attempts = attempts + 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.LEASED.value, worker_id, leased_until, now, row["id"]),
            )
        return self.get_job(int(row["id"]))

    def get_job(self, job_id: int) -> QueueJob | None:
        row = self.conn.execute("SELECT * FROM queue_jobs WHERE id = ?", (job_id,)).fetchone()
        return queue_job_from_row(row) if row is not None else None

    def complete_job(self, job_id: int) -> None:
        now = utcnow()
        with self.conn:
            self.conn.execute(
                """
                UPDATE queue_jobs
                SET status = ?, locked_by = NULL, locked_until = NULL, updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.COMPLETED.value, now, job_id),
            )

    def fail_job(self, job_id: int, error: str, retry_delay_seconds: int) -> None:
        now = utcnow()
        available_at = utcnow(timedelta(seconds=retry_delay_seconds))
        with self.conn:
            self.conn.execute(
                """
                UPDATE queue_jobs
                SET status = ?, locked_by = NULL, locked_until = NULL, available_at = ?,
                    last_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.FAILED.value, available_at, error, now, job_id),
            )

    def enqueue_outbound(
        self,
        kind: OutboundKind | str,
        item_key: str,
        payload: JsonObject,
        priority: int = LocalStoreConfig.DEFAULT_PRIORITY,
    ) -> int:
        now = utcnow()
        with self.conn:
            self.conn.execute(
                """
                INSERT OR IGNORE INTO outbound_spool (
                    item_key, kind, payload_json, priority, status, next_attempt_at,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    item_key,
                    str(kind),
                    encode_payload(payload),
                    priority,
                    WorkStatus.PENDING.value,
                    now,
                    now,
                    now,
                ),
            )
        return int(
            self.conn.execute(
                "SELECT id FROM outbound_spool WHERE item_key = ?",
                (item_key,),
            ).fetchone()["id"]
        )

    def lease_outbound(
        self,
        worker_id: str,
        lease_seconds: int = LocalStoreConfig.DEFAULT_LEASE_SECONDS,
    ) -> OutboundItem | None:
        now = utcnow()
        leased_until = utcnow(timedelta(seconds=lease_seconds))
        with self.conn:
            row = self.conn.execute(
                """
                SELECT * FROM outbound_spool
                WHERE (
                    (status IN (?, ?) AND next_attempt_at <= ?)
                    OR (status = ? AND locked_until <= ?)
                )
                ORDER BY priority ASC, created_at ASC
                LIMIT 1
                """,
                (
                    WorkStatus.PENDING.value,
                    WorkStatus.FAILED.value,
                    now,
                    WorkStatus.LEASED.value,
                    now,
                ),
            ).fetchone()
            if row is None:
                return None
            self.conn.execute(
                """
                UPDATE outbound_spool
                SET status = ?, locked_by = ?, locked_until = ?, attempts = attempts + 1,
                    updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.LEASED.value, worker_id, leased_until, now, row["id"]),
            )
        return self.get_outbound(int(row["id"]))

    def get_outbound(self, item_id: int) -> OutboundItem | None:
        row = self.conn.execute("SELECT * FROM outbound_spool WHERE id = ?", (item_id,)).fetchone()
        return outbound_item_from_row(row) if row is not None else None

    def complete_outbound(self, item_id: int) -> None:
        now = utcnow()
        with self.conn:
            self.conn.execute(
                """
                UPDATE outbound_spool
                SET status = ?, locked_by = NULL, locked_until = NULL, updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.COMPLETED.value, now, item_id),
            )

    def fail_outbound(self, item_id: int, error: str, retry_delay_seconds: int) -> None:
        now = utcnow()
        next_attempt_at = utcnow(timedelta(seconds=retry_delay_seconds))
        with self.conn:
            self.conn.execute(
                """
                UPDATE outbound_spool
                SET status = ?, locked_by = NULL, locked_until = NULL, next_attempt_at = ?,
                    last_error = ?, updated_at = ?
                WHERE id = ?
                """,
                (WorkStatus.FAILED.value, next_attempt_at, error, now, item_id),
            )

    def queue_depths(self) -> dict[str, int]:
        rows = self.conn.execute(
            """
            SELECT queue_name AS name, COUNT(*) AS count
            FROM queue_jobs
            WHERE status IN (?, ?, ?)
            GROUP BY queue_name
            UNION ALL
            SELECT ? AS name, COUNT(*) AS count
            FROM outbound_spool
            WHERE status IN (?, ?, ?)
            """,
            (
                WorkStatus.PENDING.value,
                WorkStatus.LEASED.value,
                WorkStatus.FAILED.value,
                QueueName.OUTBOUND_SPOOL.value,
                WorkStatus.PENDING.value,
                WorkStatus.LEASED.value,
                WorkStatus.FAILED.value,
            ),
        ).fetchall()
        return {str(row["name"]): int(row["count"]) for row in rows}


def utcnow(offset: timedelta | None = None) -> str:
    now = datetime.now(UTC)
    if offset is not None:
        now += offset
    return now.isoformat()


def encode_payload(payload: JsonObject) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def decode_payload(payload_json: str) -> JsonObject:
    payload = json.loads(payload_json)
    return dict(payload) if isinstance(payload, dict) else {"value": payload}


def queue_job_from_row(row: sqlite3.Row) -> QueueJob:
    return QueueJob(
        id=int(row["id"]),
        queue_name=str(row["queue_name"]),
        job_key=str(row["job_key"]),
        payload=decode_payload(str(row["payload_json"])),
        priority=int(row["priority"]),
        status=str(row["status"]),
        attempts=int(row["attempts"]),
        locked_by=row["locked_by"],
        locked_until=row["locked_until"],
        last_error=row["last_error"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )


def outbound_item_from_row(row: sqlite3.Row) -> OutboundItem:
    return OutboundItem(
        id=int(row["id"]),
        item_key=str(row["item_key"]),
        kind=str(row["kind"]),
        payload=decode_payload(str(row["payload_json"])),
        priority=int(row["priority"]),
        status=str(row["status"]),
        attempts=int(row["attempts"]),
        locked_by=row["locked_by"],
        locked_until=row["locked_until"],
        next_attempt_at=str(row["next_attempt_at"]),
        last_error=row["last_error"],
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )
