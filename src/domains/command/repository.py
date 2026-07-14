"""command DB 저장소 — agent_commands 조작을 감싸 라우터/워커와 SQLAlchemy 세부 구현 분리."""

from __future__ import annotations

import hashlib
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import DateTime, case, cast, func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.command.events import CommandCompletedBody
from domains.command.models import (
    AgentCommand,
)
from domains.command.policy import DEFAULT_COMMAND_LEASE_SECONDS
from packages.config.constants import Command, CommandStatus
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.interfaces import CommandRecord
from packages.events.envelope import event
from packages.runtime.command_wakeup import AGENT_COMMAND_CHANNEL, wakeup_key
from packages.storage.engine import (
    UNKNOWN_AGENT_ID,
    DatabaseConnection,
    row_dict,
    serialize_command,
)
from packages.storage.schema import EventModel, OutboxModel

# 만료 명령 janitor 기준 — lease 만료 직후는 재리스 후보(lease_agent_command)라
# 건드리지 않고, 이 유예가 지나도록 어떤 에이전트도 집지 않은 명령만 소진으로 간주함.
EXPIRED_COMMAND_GRACE_SECONDS = 300
EXPIRED_COMMAND_FAILURE_MESSAGE = "command lease expired; no agent completed the command"
QUEUED_COMMAND_TTL_SECONDS = 1800
QUEUED_COMMAND_FAILURE_MESSAGE = "command queue expired; no connected agent accepted the command"
COMMAND_PRIORITY_HIGH = 100


def rca_test_guard_lock_key(
    workspace_id: str,
    cluster_id: str,
    resource_kind: str,
    namespace: str,
    resource_name: str,
) -> int:
    """동일 테스트 대상만 직렬화하는 PostgreSQL signed bigint advisory key."""
    canonical = "\x1f".join(
        (workspace_id, cluster_id, resource_kind.casefold(), namespace, resource_name)
    )
    digest = hashlib.sha256(canonical.encode("utf-8")).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def agent_command_insert(
    *,
    correlation_id: str,
    plan: JsonObject,
    status: str,
) -> Any:
    table = AgentCommand.__table__
    workspace_id = str(plan.get("workspace_id", DEFAULT_WORKSPACE_ID))
    cluster_id = str(plan["cluster_id"])
    priority = int(plan.get("priority") or COMMAND_PRIORITY_HIGH)
    return (
        pg_insert(table)
        .values(
            command_id=plan["command_id"],
            workspace_id=workspace_id,
            correlation_id=correlation_id,
            cluster_id=cluster_id,
            action=plan["action"],
            priority=priority,
            payload=plan,
            status=status,
            lease_id=None,
            agent_id=None,
            leased_until=None,
            started_at=None,
            completed_at=None,
            result={},
            updated_at=func.now(),
        )
        .on_conflict_do_nothing(index_elements=[table.c.command_id])
    )


def notify_agent_command(conn: Any, workspace_id: str, cluster_id: str) -> None:
    # 트랜잭션 커밋 시 전달되어 롱폴이 즉시 lease를 재시도한다.
    conn.execute(
        text("select pg_notify(:channel, :payload)"),
        {
            "channel": AGENT_COMMAND_CHANNEL,
            "payload": wakeup_key(workspace_id, cluster_id),
        },
    )


class AgentCommandRepository(DatabaseConnection):
    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> bool:
        if plan.get("action") == Command.RCA_TEST_SCENARIO_INJECT_ACTION:
            raise ValueError("RCA test inject commands require the atomic reservation guard")
        workspace_id = str(plan.get("workspace_id", DEFAULT_WORKSPACE_ID))
        cluster_id = str(plan["cluster_id"])
        table = AgentCommand.__table__
        with self.connection() as conn:
            inserted = conn.execute(
                agent_command_insert(
                    correlation_id=correlation_id,
                    plan=plan,
                    status=status,
                ).returning(table.c.command_id)
            ).scalar_one_or_none()
            if inserted is None:
                return False
            notify_agent_command(conn, workspace_id, cluster_id)
            return True

    def queue_rca_test_command_if_available(
        self,
        correlation_id: str,
        plan: JsonObject,
        status: str,
        *,
        resource_kind: str,
        namespace: str,
        resource_name: str,
        max_concurrent_runs: int,
        ttl_seconds: int,
    ) -> bool:
        """같은 fixture 예약 확인과 inject enqueue를 한 DB 트랜잭션으로 처리한다."""
        if plan.get("action") != Command.RCA_TEST_SCENARIO_INJECT_ACTION:
            raise ValueError("atomic RCA test reservation accepts inject commands only")
        if max_concurrent_runs < 1 or ttl_seconds < 1:
            raise ValueError("RCA test concurrency and TTL must be positive")

        table = AgentCommand.__table__
        cleanup = table.alias("finished_rca_test_cleanup")
        workspace_id = str(plan.get("workspace_id", DEFAULT_WORKSPACE_ID))
        cluster_id = str(plan["cluster_id"])
        normalized_resource_kind = resource_kind.strip().casefold()
        inject_payload = table.c.payload["payload"]
        cleanup_payload = cleanup.c.payload["payload"]
        cleanup_finished = (
            select(1)
            .select_from(cleanup)
            .where(
                cleanup.c.workspace_id == table.c.workspace_id,
                cleanup.c.cluster_id == table.c.cluster_id,
                cleanup.c.action == Command.RCA_TEST_SCENARIO_CLEANUP_ACTION,
                cleanup.c.status == CommandStatus.COMPLETED,
                cleanup_payload["run_id"].astext == inject_payload["run_id"].astext,
            )
            .correlate(table)
            .exists()
        )
        active_count = (
            select(func.count())
            .select_from(table)
            .where(
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.action == Command.RCA_TEST_SCENARIO_INJECT_ACTION,
                func.lower(func.coalesce(inject_payload["resource_kind"].astext, "Deployment"))
                == normalized_resource_kind,
                inject_payload["namespace"].astext == namespace,
                inject_payload["resource_name"].astext == resource_name,
                cast(inject_payload["expires_at"].astext, DateTime(timezone=True)) > func.now(),
                ~cleanup_finished,
            )
        )
        lock_key = rca_test_guard_lock_key(
            workspace_id,
            cluster_id,
            resource_kind,
            namespace,
            resource_name,
        )

        with self.connection() as conn:
            conn.execute(text("select pg_advisory_xact_lock(:lock_key)"), {"lock_key": lock_key})
            if int(conn.execute(active_count).scalar_one()) >= max_concurrent_runs:
                return False
            inserted = conn.execute(
                agent_command_insert(
                    correlation_id=correlation_id, plan=plan, status=status
                ).returning(table.c.command_id)
            ).scalar_one_or_none()
            if inserted is None:
                return False
            notify_agent_command(conn, workspace_id, cluster_id)
            return True

    async def get_agent_command(
        self, command_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID
    ) -> JsonObject | None:
        """워크스페이스 범위 명령 단건 조회 — 콘솔이 상태·실제 결과를 폴링하는 용도."""
        table = AgentCommand.__table__
        statement = select(
            table.c.command_id,
            table.c.cluster_id,
            table.c.correlation_id,
            table.c.action,
            table.c.payload,
            table.c.status,
            table.c.result,
            table.c.completed_at,
        ).where(
            table.c.command_id == command_id,
            table.c.workspace_id == workspace_id,
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row_dict(row) if row else None

    async def list_agent_commands_by_correlation(
        self,
        workspace_id: str,
        correlation_id: str,
        *,
        limit: int = 20,
    ) -> list[JsonObject]:
        """Read the newest bounded command batch for one workspace correlation."""
        table = AgentCommand.__table__
        statement = (
            select(
                table.c.command_id,
                table.c.cluster_id,
                table.c.correlation_id,
                table.c.action,
                table.c.payload,
                table.c.status,
                table.c.result,
                table.c.completed_at,
                table.c.created_at,
            )
            .where(
                table.c.workspace_id == workspace_id,
                table.c.correlation_id == correlation_id,
            )
            .order_by(table.c.created_at.desc(), table.c.command_id.desc())
            .limit(max(1, min(limit, 20)))
        )
        async with self.async_connection() as conn:
            rows = (await conn.execute(statement)).mappings().all()
        return [row_dict(row) for row in rows]

    async def lease_agent_command(
        self,
        cluster_id: str,
        workspace_id: str = DEFAULT_WORKSPACE_ID,
        queued_status: str = CommandStatus.QUEUED,
        leased_status: str = CommandStatus.LEASED,
        agent_id: str = UNKNOWN_AGENT_ID,
        lease_seconds: int = DEFAULT_COMMAND_LEASE_SECONDS,
    ) -> CommandRecord | None:
        table = AgentCommand.__table__
        now = datetime.now(UTC)
        leased_until = now + timedelta(seconds=lease_seconds)
        lease_id = str(uuid.uuid4())
        columns = (
            table.c.command_id,
            table.c.workspace_id,
            table.c.correlation_id,
            table.c.cluster_id,
            table.c.action,
            table.c.payload,
            table.c.status,
            table.c.lease_id,
            table.c.agent_id,
            table.c.leased_until,
        )
        available = or_(
            table.c.status == queued_status,
            (table.c.status == leased_status) & (table.c.leased_until < func.now()),
            (table.c.status == CommandStatus.RUNNING) & (table.c.leased_until < func.now()),
        )
        candidate = (
            select(table.c.command_id)
            .where(
                table.c.workspace_id == workspace_id, table.c.cluster_id == cluster_id, available
            )
            .order_by(table.c.priority.desc(), table.c.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
            .scalar_subquery()
        )
        async with self.async_connection() as conn:
            statement = (
                update(table)
                .where(table.c.command_id == candidate)
                .values(
                    status=leased_status,
                    lease_id=lease_id,
                    agent_id=agent_id,
                    leased_until=leased_until,
                    updated_at=func.now(),
                )
                .returning(*columns)
            )
            leased = (await conn.execute(statement)).mappings().first()
            return serialize_command(row_dict(leased)) if leased else None

    async def start_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        running_status: str = CommandStatus.RUNNING,
        lease_seconds: int = DEFAULT_COMMAND_LEASE_SECONDS,
    ) -> str | None:
        table = AgentCommand.__table__
        leased_until = datetime.now(UTC) + timedelta(seconds=lease_seconds)
        statement = (
            update(table)
            .where(
                table.c.command_id == command_id,
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.lease_id == lease_id,
                table.c.agent_id == agent_id,
                table.c.status == CommandStatus.LEASED,
                table.c.leased_until >= func.now(),
            )
            .values(
                status=running_status,
                leased_until=leased_until,
                started_at=func.now(),
                updated_at=func.now(),
            )
            .returning(table.c.correlation_id)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row["correlation_id"] if row else None

    async def heartbeat_agent_command(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        lease_id: str,
        agent_id: str,
        lease_seconds: int = DEFAULT_COMMAND_LEASE_SECONDS,
    ) -> str | None:
        table = AgentCommand.__table__
        leased_until = datetime.now(UTC) + timedelta(seconds=lease_seconds)
        statement = (
            update(table)
            .where(
                table.c.command_id == command_id,
                table.c.workspace_id == workspace_id,
                table.c.cluster_id == cluster_id,
                table.c.lease_id == lease_id,
                table.c.agent_id == agent_id,
                table.c.status.in_([CommandStatus.LEASED, CommandStatus.RUNNING]),
                table.c.leased_until >= func.now(),
            )
            .values(leased_until=leased_until, updated_at=func.now())
            .returning(table.c.correlation_id)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row["correlation_id"] if row else None

    async def complete_agent_command_and_stage_event(
        self,
        command_id: str,
        workspace_id: str,
        cluster_id: str,
        result: JsonObject,
        lease_id: str,
        agent_id: str,
        source: str,
    ) -> EventEnvelope | None:
        command_table = AgentCommand.__table__
        event_table = EventModel.__table__
        outbox_table = OutboxModel.__table__
        statement = (
            update(command_table)
            .where(
                command_table.c.command_id == command_id,
                command_table.c.workspace_id == workspace_id,
                command_table.c.cluster_id == cluster_id,
                command_table.c.lease_id == lease_id,
                command_table.c.agent_id == agent_id,
                command_table.c.status == CommandStatus.RUNNING,
                command_table.c.leased_until >= func.now(),
            )
            .values(
                status=result["status"],
                result=result,
                completed_at=func.now(),
                updated_at=func.now(),
            )
            .returning(command_table.c.correlation_id)
        )
        async with self.async_engine.begin() as conn:
            row = (await conn.execute(statement)).mappings().first()
            if not row:
                return None

            body = CommandCompletedBody(command_id=command_id, result=result)
            completed = event(
                body.__subject__,
                source,
                body.to_body(),
                str(row["correlation_id"]),
                workspace_id=workspace_id,
            )
            await conn.execute(
                pg_insert(event_table)
                .values(
                    event_id=completed.event_id,
                    subject=completed.subject,
                    source=completed.source,
                    correlation_id=completed.correlation_id,
                    causation_id=completed.causation_id,
                    payload=completed.payload,
                )
                .on_conflict_do_nothing(index_elements=[event_table.c.event_id])
            )
            await conn.execute(
                pg_insert(outbox_table)
                .values(
                    event_id=completed.event_id,
                    subject=completed.subject,
                    source=completed.source,
                    correlation_id=completed.correlation_id,
                    causation_id=completed.causation_id,
                    workspace_id=completed.workspace_id,
                    occurred_at=completed.created_at,
                    payload=completed.payload,
                )
                .on_conflict_do_nothing(index_elements=[outbox_table.c.event_id])
            )
        return completed

    def fail_expired_agent_commands(
        self,
        grace_seconds: int = EXPIRED_COMMAND_GRACE_SECONDS,
        *,
        queue_ttl_seconds: int = QUEUED_COMMAND_TTL_SECONDS,
    ) -> list[JsonObject]:
        """미수신 queue와 만료 lease를 FAILED로 종결해 완료 이벤트 발행 대상으로 반환함.

        등록이 사라지거나 Agent가 연결을 잃으면 QUEUED 행도 lease 없이 영구 잔존할 수
        있다. 오래된 QUEUED와 lease 유예가 지난 LEASED/RUNNING을 단일 원자
        UPDATE ... RETURNING으로 닫아 호출자가 CommandCompleted(FAILED)를 흘린다.
        """
        grace_seconds = int(grace_seconds)
        queue_ttl_seconds = int(queue_ttl_seconds)
        if grace_seconds < 1 or queue_ttl_seconds < 1:
            raise ValueError("command expiry durations must be positive")
        table = AgentCommand.__table__
        statement = (
            update(table)
            .where(
                or_(
                    (
                        (table.c.status == CommandStatus.QUEUED)
                        & (
                            table.c.created_at
                            < func.now() - text(f"interval '{queue_ttl_seconds} seconds'")
                        )
                    ),
                    (
                        table.c.status.in_([CommandStatus.LEASED, CommandStatus.RUNNING])
                        & (
                            table.c.leased_until
                            < func.now() - text(f"interval '{grace_seconds} seconds'")
                        )
                    ),
                )
            )
            .values(
                status=CommandStatus.FAILED,
                result=func.jsonb_build_object(
                    "status",
                    CommandStatus.FAILED,
                    "applied",
                    False,
                    "message",
                    case(
                        (
                            table.c.status == CommandStatus.QUEUED,
                            QUEUED_COMMAND_FAILURE_MESSAGE,
                        ),
                        else_=EXPIRED_COMMAND_FAILURE_MESSAGE,
                    ),
                ),
                completed_at=func.now(),
                updated_at=func.now(),
            )
            .returning(
                table.c.command_id,
                table.c.workspace_id,
                table.c.cluster_id,
                table.c.correlation_id,
                table.c.result,
            )
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [row_dict(row) for row in rows]

    def command_status_counts(self) -> dict[str, int]:
        table = AgentCommand.__table__
        statement = select(table.c.status, func.count().label("count")).group_by(table.c.status)
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return {row["status"]: int(row["count"]) for row in rows}

    def oldest_command_age_seconds(self, status: str) -> float:
        table = AgentCommand.__table__
        statement = select(func.extract("epoch", func.now() - func.min(table.c.created_at))).where(
            table.c.status == status
        )
        with self.connection() as conn:
            age = conn.execute(statement).scalar()
        return float(age or 0)
