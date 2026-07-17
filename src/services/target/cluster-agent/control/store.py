from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from dataclasses import dataclass
from pathlib import Path
from types import TracebackType

from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.requests import AgentPolicy, DesiredResource

ACTIVE_POLICY_ID = "active"
RECONCILE_STATUS_APPLIED = "applied"
RECONCILE_STATUS_UNCHANGED = "unchanged"
SUCCESSFUL_RECONCILE_STATUSES = {
    RECONCILE_STATUS_APPLIED,
    RECONCILE_STATUS_UNCHANGED,
}


@dataclass(frozen=True)
class ReconcileResult:
    resource_id: str
    scope: str
    kind: str
    namespace: str
    name: str
    desired_hash: str
    status: str
    message: str


class AgentControlStore:
    def __init__(self, db_path: str) -> None:
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.conn: sqlite3.Connection | None = sqlite3.connect(db_path, timeout=5.0)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("pragma journal_mode = wal")
        self.conn.execute("pragma busy_timeout = 5000")
        self.init_schema()

    def __enter__(self) -> AgentControlStore:
        return self

    def __exit__(
        self,
        _exc_type: type[BaseException] | None,
        _exc: BaseException | None,
        _traceback: TracebackType | None,
    ) -> None:
        self.close()

    def __del__(self) -> None:
        self.close()

    def close(self) -> None:
        conn = getattr(self, "conn", None)
        if conn is None:
            return
        conn.close()
        self.conn = None

    def connection(self) -> sqlite3.Connection:
        if self.conn is None:
            raise RuntimeError("AgentControlStore is closed")
        return self.conn

    def init_schema(self) -> None:
        conn = self.connection()
        conn.executescript(
            """
            create table if not exists agent_policy (
                policy_id text primary key,
                generation integer not null,
                payload_json text not null,
                updated_at real not null
            );

            create table if not exists reconcile_resources (
                resource_id text primary key,
                scope text not null,
                kind text not null,
                namespace text not null,
                name text not null,
                desired_hash text not null,
                status text not null,
                message text not null,
                updated_at real not null
            );

            create table if not exists runtime_settings (
                setting_key text primary key,
                setting_value text not null,
                updated_at real not null
            );
            """
        )
        conn.commit()

    def save_policy(self, policy: AgentPolicy) -> None:
        now = time.time()
        conn = self.connection()
        with conn:
            conn.execute(
                """
                insert into agent_policy
                    (policy_id, generation, payload_json, updated_at)
                values (?, ?, ?, ?)
                on conflict (policy_id) do update set
                    generation = excluded.generation,
                    payload_json = excluded.payload_json,
                    updated_at = excluded.updated_at
                """,
                (
                    ACTIVE_POLICY_ID,
                    policy.generation,
                    policy.model_dump_json(),
                    now,
                ),
            )

    def load_policy(self) -> AgentPolicy | None:
        row = (
            self.connection()
            .execute(
                """
            select payload_json
            from agent_policy
            where policy_id = ?
            """,
                (ACTIVE_POLICY_ID,),
            )
            .fetchone()
        )
        if row is None:
            return None
        return AgentPolicy.model_validate_json(str(row["payload_json"]))

    def active_generation(self) -> int:
        row = (
            self.connection()
            .execute(
                """
            select generation
            from agent_policy
            where policy_id = ?
            """,
                (ACTIVE_POLICY_ID,),
            )
            .fetchone()
        )
        return int(row["generation"]) if row else 0

    def last_successful_resource_hash(self, resource_id: str) -> str | None:
        row = (
            self.connection()
            .execute(
                """
            select desired_hash, status
            from reconcile_resources
            where resource_id = ?
            """,
                (resource_id,),
            )
            .fetchone()
        )
        if row is None or row["status"] not in SUCCESSFUL_RECONCILE_STATUSES:
            return None
        return str(row["desired_hash"])

    def save_reconcile_result(self, result: ReconcileResult) -> None:
        now = time.time()
        conn = self.connection()
        with conn:
            conn.execute(
                """
                insert into reconcile_resources (
                    resource_id,
                    scope,
                    kind,
                    namespace,
                    name,
                    desired_hash,
                    status,
                    message,
                    updated_at
                )
                values (?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict (resource_id) do update set
                    scope = excluded.scope,
                    kind = excluded.kind,
                    namespace = excluded.namespace,
                    name = excluded.name,
                    desired_hash = excluded.desired_hash,
                    status = excluded.status,
                    message = excluded.message,
                    updated_at = excluded.updated_at
                """,
                (
                    result.resource_id,
                    result.scope,
                    result.kind,
                    result.namespace,
                    result.name,
                    result.desired_hash,
                    result.status,
                    result.message,
                    now,
                ),
            )

    def save_runtime_setting(self, key: str, value: str) -> None:
        normalized_key = key.strip()
        normalized_value = value.strip()
        if not normalized_key or not normalized_value:
            raise ValueError("runtime setting key and value are required")
        conn = self.connection()
        with conn:
            conn.execute(
                """
                insert into runtime_settings (setting_key, setting_value, updated_at)
                values (?, ?, ?)
                on conflict (setting_key) do update set
                    setting_value = excluded.setting_value,
                    updated_at = excluded.updated_at
                """,
                (normalized_key, normalized_value, time.time()),
            )

    def load_runtime_setting(self, key: str) -> str | None:
        row = (
            self.connection()
            .execute(
                """
                select setting_value
                from runtime_settings
                where setting_key = ?
                """,
                (key.strip(),),
            )
            .fetchone()
        )
        return str(row["setting_value"]) if row is not None else None


def desired_resource_hash(resource: DesiredResource) -> str:
    payload: JsonObject = resource.model_dump()
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()
