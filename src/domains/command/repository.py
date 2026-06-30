from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from domains.command.models import (
    AgentCommand,
)
from packages.config.constants import CommandStatus
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.interfaces import CommandRecord
from packages.storage.engine import (
    DEFAULT_COMMAND_LEASE_SECONDS,
    UNKNOWN_AGENT_ID,
    DatabaseConnection,
    row_dict,
    serialize_command,
)


class AgentCommandRepository(DatabaseConnection):
    def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
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
        )
        candidate = (
            select(table.c.command_id)
            .where(table.c.cluster_id == cluster_id, available)
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
        lease_id: str,
        agent_id: str,
        running_status: str = CommandStatus.RUNNING,
    ) -> str | None:
        table = AgentCommand.__table__
        statement = (
            update(table)
            .where(
                table.c.command_id == command_id,
                table.c.lease_id == lease_id,
                table.c.agent_id == agent_id,
                table.c.status == CommandStatus.LEASED,
                table.c.leased_until >= func.now(),
            )
            .values(status=running_status, started_at=func.now(), updated_at=func.now())
            .returning(table.c.correlation_id)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row["correlation_id"] if row else None

    async def complete_agent_command(
        self, command_id: str, result: JsonObject, lease_id: str, agent_id: str
    ) -> str | None:
        table = AgentCommand.__table__
        statement = (
            update(table)
            .where(
                table.c.command_id == command_id,
                table.c.lease_id == lease_id,
                table.c.agent_id == agent_id,
                table.c.status == CommandStatus.RUNNING,
            )
            .values(
                status=result["status"],
                result=result,
                completed_at=func.now(),
                updated_at=func.now(),
            )
            .returning(table.c.correlation_id)
        )
        async with self.async_connection() as conn:
            row = (await conn.execute(statement)).mappings().first()
        return row["correlation_id"] if row else None

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
