"""command DB 저장소.

agent_commands 테이블 조작을 감싸 라우터/워커와 SQLAlchemy 세부 구현 분리.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.command.events import CommandCompletedBody
from domains.command.models import (
    AgentCommand,
)
from packages.config.constants import CommandStatus
from packages.contracts.event_bus.interfaces import EventEnvelope, JsonObject
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.contracts.interfaces import CommandRecord
from packages.events.envelope import event
from packages.storage.engine import (
    DEFAULT_COMMAND_LEASE_SECONDS,
    UNKNOWN_AGENT_ID,
    DatabaseConnection,
    row_dict,
    serialize_command,
)
from packages.storage.schema import EventModel, OutboxModel


class AgentCommandRepository(DatabaseConnection):
    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        table = AgentCommand.__table__
        statement = (
            pg_insert(table)
            .values(
                command_id=plan["command_id"],
                workspace_id=plan.get("workspace_id", DEFAULT_WORKSPACE_ID),
                correlation_id=correlation_id,
                cluster_id=plan["cluster_id"],
                action=plan["action"],
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
            .order_by(table.c.created_at)
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

            completed = event(
                EventSubject.COMMAND_COMPLETED,
                source,
                CommandCompletedBody(command_id=command_id, result=result).to_body(),
                str(row["correlation_id"]),
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
                    occurred_at=completed.created_at,
                    payload=completed.payload,
                )
                .on_conflict_do_nothing(index_elements=[outbox_table.c.event_id])
            )
        return completed

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
