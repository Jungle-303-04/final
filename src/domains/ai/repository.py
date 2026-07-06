"""AI 대화 repository."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.sql import func

from domains.ai.models import AiConversation, AiConversationMessage
from packages.contracts.event_bus.interfaces import JsonObject
from packages.storage.engine import DatabaseConnection, row_dict

STATUS_ACTIVE = "active"
STATUS_WAITING = "waiting"
STATUS_COMPLETED = "completed"
STATUS_FAILED = "failed"
ROLE_USER = "user"
ROLE_ASSISTANT = "assistant"


class AiConversationRepository(DatabaseConnection):
    conversation_table = AiConversation.__table__
    message_table = AiConversationMessage.__table__

    def create_ai_conversation(self, payload: JsonObject) -> JsonObject:
        values = {
            "conversation_id": payload["conversation_id"],
            "workspace_id": payload["workspace_id"],
            "user_id": payload["user_id"],
            "title": payload["title"],
            "agent": payload["agent"],
            "status": payload.get("status", STATUS_ACTIVE),
            "context": payload.get("context") or {},
            "updated_at": func.now(),
        }
        statement = (
            pg_insert(self.conversation_table)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[self.conversation_table.c.conversation_id])
            .returning(self.conversation_table)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else payload

    def append_ai_message(self, payload: JsonObject) -> JsonObject:
        values = {
            "message_id": payload["message_id"],
            "conversation_id": payload["conversation_id"],
            "workspace_id": payload["workspace_id"],
            "role": payload["role"],
            "content": payload["content"],
            "agent": payload["agent"],
            "correlation_id": payload.get("correlation_id"),
            "metadata": payload.get("metadata") or {},
        }
        statement = (
            pg_insert(self.message_table)
            .values(**values)
            .on_conflict_do_nothing(index_elements=[self.message_table.c.message_id])
            .returning(self.message_table)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return dict(row) if row is not None else payload

    def mark_ai_conversation_status(
        self, workspace_id: str, conversation_id: str, status: str
    ) -> None:
        statement = (
            self.conversation_table.update()
            .where(
                self.conversation_table.c.workspace_id == workspace_id,
                self.conversation_table.c.conversation_id == conversation_id,
            )
            .values(status=status, updated_at=func.now())
        )
        with self.connection() as conn:
            conn.execute(statement)

    def record_ai_response(self, payload: JsonObject) -> None:
        with self.unit_of_work():
            self.append_ai_message(
                {
                    "message_id": payload["response_message_id"],
                    "conversation_id": payload["conversation_id"],
                    "workspace_id": payload["workspace_id"],
                    "role": ROLE_ASSISTANT,
                    "content": payload["content"],
                    "agent": payload["agent"],
                    "correlation_id": payload.get("correlation_id"),
                    "metadata": payload.get("metadata") or {},
                }
            )
            self.mark_ai_conversation_status(
                str(payload["workspace_id"]),
                str(payload["conversation_id"]),
                STATUS_COMPLETED,
            )

    def record_ai_failure(self, payload: JsonObject) -> None:
        with self.unit_of_work():
            self.mark_ai_conversation_status(
                str(payload["workspace_id"]),
                str(payload["conversation_id"]),
                STATUS_FAILED,
            )

    def list_ai_conversations(self, workspace_id: str, *, limit: int = 100) -> list[JsonObject]:
        table = self.conversation_table
        statement = (
            select(
                table.c.conversation_id, table.c.title, table.c.status, table.c.updated_at
            )
            .where(table.c.workspace_id == workspace_id)
            .order_by(table.c.updated_at.desc())
            .limit(max(1, min(limit, 200)))
        )
        with self.connection() as conn:
            rows = conn.execute(statement).mappings().all()
        return [row_dict(r) for r in rows]

    def get_ai_conversation(self, workspace_id: str, conversation_id: str) -> JsonObject | None:
        statement = (
            select(self.conversation_table)
            .where(
                self.conversation_table.c.workspace_id == workspace_id,
                self.conversation_table.c.conversation_id == conversation_id,
            )
            .limit(1)
        )
        with self.connection() as conn:
            row = conn.execute(statement).mappings().first()
        return row_dict(row) if row is not None else None

    def list_ai_messages(
        self,
        workspace_id: str,
        conversation_id: str,
        *,
        newest: int | None = None,
    ) -> list[JsonObject]:
        """대화 메시지 목록. newest 지정 시 최근 N개만(시간 오름차순 반환)."""
        statement = (
            select(self.message_table)
            .where(
                self.message_table.c.workspace_id == workspace_id,
                self.message_table.c.conversation_id == conversation_id,
            )
            .order_by(self.message_table.c.created_at, self.message_table.c.message_id)
        )
        if newest is not None:
            statement = (
                statement.order_by(None)
                .order_by(
                    self.message_table.c.created_at.desc(),
                    self.message_table.c.message_id.desc(),
                )
                .limit(newest)
            )
        with self.connection() as conn:
            rows = [row_dict(row) for row in conn.execute(statement).mappings()]
        return list(reversed(rows)) if newest is not None else rows
