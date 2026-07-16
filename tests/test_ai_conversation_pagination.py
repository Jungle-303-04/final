from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from domains.ai.repository import AiConversationRepository
from domains.ai.router import _conversation_cursor_scope, get_conversation
from packages.contracts.gateway.responses import AiConversationResponse
from packages.runtime.keyset_cursor import decode_keyset_cursor, encode_keyset_cursor


class _Result:
    def __init__(
        self,
        *,
        first: dict[str, Any] | None = None,
        rows: list[dict[str, Any]] | None = None,
    ) -> None:
        self._first = first
        self._rows = rows or []

    def mappings(self) -> _Result:
        return self

    def first(self) -> dict[str, Any] | None:
        return self._first

    def all(self) -> list[dict[str, Any]]:
        return self._rows


class _Connection:
    def __init__(
        self,
        *,
        conversation: dict[str, Any],
        messages: list[dict[str, Any]],
        fail_messages: bool = False,
    ) -> None:
        self.conversation = conversation
        self.messages = messages
        self.fail_messages = fail_messages
        self.statements: list[Any] = []

    def execute(self, statement: Any) -> _Result:
        self.statements.append(statement)
        if len(self.statements) == 1:
            return _Result(first=self.conversation)
        if self.fail_messages:
            raise RuntimeError("message query failed")
        return _Result(rows=self.messages)


def _conversation() -> dict[str, Any]:
    observed_at = datetime(2026, 7, 16, 12, tzinfo=UTC)
    return {
        "conversation_id": "aic-1",
        "workspace_id": "workspace-a",
        "user_id": "user-a",
        "title": "Incident review",
        "agent": "operations-chat",
        "status": "completed",
        "context": {"cluster_id": "cluster-a"},
        "created_at": observed_at,
        "updated_at": observed_at,
    }


def _messages(count: int) -> list[dict[str, Any]]:
    base = datetime(2026, 7, 16, 12, tzinfo=UTC)
    return [
        {
            "message_id": f"aim-{index:03d}",
            "conversation_id": "aic-1",
            "workspace_id": "workspace-a",
            "role": "assistant" if index % 2 == 0 else "user",
            "content": f"message {index}",
            "agent": "operations-chat",
            "correlation_id": "corr-a",
            "metadata": {},
            "created_at": base + timedelta(seconds=index),
        }
        for index in range(count, 0, -1)
    ]


def _repository(connection: _Connection) -> tuple[AiConversationRepository, dict[str, bool]]:
    transaction = {"active": False, "rolled_back": False}

    @contextmanager
    def database_connection() -> Iterator[_Connection]:
        transaction["active"] = True
        try:
            yield connection
        except Exception:
            transaction["rolled_back"] = True
            raise
        finally:
            transaction["active"] = False

    repository = object.__new__(AiConversationRepository)
    repository.connection = database_connection  # type: ignore[method-assign]
    return repository, transaction


def _sql(statement: Any) -> str:
    compiled = statement.compile(dialect=postgresql.dialect())
    return " ".join(str(compiled).casefold().split())


def test_conversation_page_bounds_201_rows_with_two_scoped_queries() -> None:
    connection = _Connection(conversation=_conversation(), messages=_messages(201))
    repository, transaction = _repository(connection)

    page = repository.get_ai_conversation_page(
        "workspace-a",
        "aic-1",
        user_id="user-a",
        limit=200,
    )

    assert page is not None
    assert len(connection.statements) == 2
    assert len(page["messages"]) == 200
    assert page["messages"][0]["message_id"] == "aim-002"
    assert page["messages"][-1]["message_id"] == "aim-201"
    assert page["has_more"] is True
    assert page["next_position"] == {
        "ordered_at": page["messages"][0]["created_at"],
        "tie_breaker": "aim-002",
    }
    conversation_sql, messages_sql = map(_sql, connection.statements)
    assert "ai_conversations.workspace_id =" in conversation_sql
    assert "ai_conversations.user_id =" in conversation_sql
    assert "join ai_conversations" in messages_sql
    assert "ai_conversations.user_id =" in messages_sql
    assert (
        "order by ai_conversation_messages.created_at desc, "
        "ai_conversation_messages.message_id desc"
    ) in messages_sql
    assert transaction == {"active": False, "rolled_back": False}


def test_conversation_page_applies_stable_keyset_before_cursor() -> None:
    connection = _Connection(conversation=_conversation(), messages=[])
    repository, _transaction = _repository(connection)
    before = (datetime(2026, 7, 16, 11, tzinfo=UTC), "aim-100")

    repository.get_ai_conversation_page(
        "workspace-a",
        "aic-1",
        user_id="user-a",
        limit=50,
        before=before,
    )

    messages_sql = _sql(connection.statements[1])
    assert (
        "(ai_conversation_messages.created_at, ai_conversation_messages.message_id) <"
        in messages_sql
    )


def test_conversation_page_fails_closed_when_message_query_fails() -> None:
    connection = _Connection(
        conversation=_conversation(),
        messages=[],
        fail_messages=True,
    )
    repository, transaction = _repository(connection)

    with pytest.raises(RuntimeError, match="message query failed"):
        repository.get_ai_conversation_page(
            "workspace-a",
            "aic-1",
            user_id="user-a",
            limit=100,
        )

    assert len(connection.statements) == 2
    assert transaction == {"active": False, "rolled_back": True}


class _PageDb:
    def __init__(self, page: dict[str, Any] | None) -> None:
        self.page = page
        self.calls: list[dict[str, Any]] = []

    def get_ai_conversation_page(
        self,
        workspace_id: str,
        conversation_id: str,
        **kwargs: Any,
    ) -> dict[str, Any] | None:
        self.calls.append(
            {
                "workspace_id": workspace_id,
                "conversation_id": conversation_id,
                **kwargs,
            }
        )
        return self.page


def test_conversation_route_returns_scope_bound_partial_cursor() -> None:
    oldest_at = datetime(2026, 7, 16, 11, tzinfo=UTC)
    db = _PageDb(
        {
            "conversation": _conversation(),
            "messages": [{"message_id": "aim-100", "created_at": oldest_at}],
            "limit": 1,
            "has_more": True,
            "next_position": {
                "ordered_at": oldest_at,
                "tie_breaker": "aim-100",
            },
        }
    )
    current = SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )

    response = asyncio.run(
        get_conversation(
            "aic-1",
            limit=1,
            cursor=None,
            current=current,
            db=db,
        )
    )

    assert response.messages_completeness == "partial"
    assert response.partial_reason_codes == ["bounded_message_history"]
    assert response.next_cursor is not None
    decoded = decode_keyset_cursor(
        response.next_cursor,
        expected_scope=_conversation_cursor_scope("workspace-a", "user-a", "aic-1"),
    )
    assert (decoded.ordered_at, decoded.tie_breaker) == (oldest_at, "aim-100")
    assert db.calls == [
        {
            "workspace_id": "workspace-a",
            "conversation_id": "aic-1",
            "user_id": "user-a",
            "limit": 1,
            "before": None,
        }
    ]


def test_conversation_route_rejects_cursor_from_another_scope_before_query() -> None:
    db = _PageDb(None)
    current = SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    cursor = encode_keyset_cursor(
        scope=_conversation_cursor_scope("workspace-a", "user-a", "aic-other"),
        ordered_at=datetime(2026, 7, 16, 11, tzinfo=UTC),
        tie_breaker="aim-100",
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            get_conversation(
                "aic-1",
                limit=100,
                cursor=cursor,
                current=current,
                db=db,
            )
        )

    assert exc.value.status_code == 422
    assert db.calls == []


def test_conversation_response_rejects_inconsistent_partial_state() -> None:
    with pytest.raises(ValidationError, match="partial message page requires"):
        AiConversationResponse(
            conversation={"conversation_id": "aic-1"},
            messages=[],
            limit=100,
            has_more=True,
            next_cursor=None,
            messages_completeness="complete",
            partial_reason_codes=[],
        )
