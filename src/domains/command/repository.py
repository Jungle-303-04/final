"""command DB 저장소 — agent_commands 조작을 감싸 라우터/워커와 SQLAlchemy 세부 구현 분리."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.command.events import CommandCompletedBody
from domains.command.models import (
    AgentCommand,
)
from domains.command.policy import DEFAULT_COMMAND_LEASE_SECONDS
from packages.config.constants import CommandStatus
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
COMMAND_PRIORITY_HIGH = 100


class AgentCommandRepository(DatabaseConnection):
    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        table = AgentCommand.__table__
        workspace_id = str(plan.get("workspace_id", DEFAULT_WORKSPACE_ID))
        cluster_id = str(plan["cluster_id"])
        priority = int(plan.get("priority") or COMMAND_PRIORITY_HIGH)
        statement = (
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
        with self.connection() as conn:
            conn.execute(statement)
            # 커밋 시점에 전달되는 웨이크업 알림 — 게이트웨이 롱폴이 1초 폴링 주기를
            # 기다리지 않고 즉시 lease 를 재시도한다(리스너 없으면 무해한 no-op).
            conn.execute(
                text("select pg_notify(:channel, :payload)"),
                {
                    "channel": AGENT_COMMAND_CHANNEL,
                    "payload": wakeup_key(workspace_id, cluster_id),
                },
            )

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
            completed = event(body.__subject__, source, body.to_body(), str(row["correlation_id"]))
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
                    occurred_at=completed.created_at,
                    payload=completed.payload,
                )
                .on_conflict_do_nothing(index_elements=[outbox_table.c.event_id])
            )
        return completed

    def fail_expired_agent_commands(
        self, grace_seconds: int = EXPIRED_COMMAND_GRACE_SECONDS
    ) -> list[JsonObject]:
        """만료 방치 명령을 FAILED 로 종결하고 종결된 행을 반환함(완료 이벤트 발행용).

        LEASED/RUNNING 인데 lease 만료 후 유예(grace)까지 지난 명령은 완료 이벤트가
        영영 없어 workflow 가 영구 APPLYING 으로 남음(감사 C6). 단일 원자
        UPDATE ... RETURNING 으로 정리해 호출자가 CommandCompleted(FAILED)를 흘림.
        """
        table = AgentCommand.__table__
        failure = {
            "status": CommandStatus.FAILED,
            "applied": False,
            "message": EXPIRED_COMMAND_FAILURE_MESSAGE,
        }
        statement = (
            update(table)
            .where(
                table.c.status.in_([CommandStatus.LEASED, CommandStatus.RUNNING]),
                table.c.leased_until
                < func.now() - text(f"interval '{int(grace_seconds)} seconds'"),
            )
            .values(
                status=CommandStatus.FAILED,
                result=failure,
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
