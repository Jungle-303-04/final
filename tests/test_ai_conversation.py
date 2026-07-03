from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import pytest

from domains.ai.agent import OperationsChatAgent
from domains.ai.router import create_conversation
from packages.ai import llm
from packages.ai.llm import FakeLlmClient
from packages.contracts.event_bus.bodies import AiMessageReceivedBody
from packages.contracts.gateway.requests import AiConversationCreateRequest
from packages.events.envelope import event


def test_operations_chat_agent_uses_llm_client() -> None:
    llm = FakeLlmClient("agent answer")
    agent = OperationsChatAgent(llm)

    result = asyncio.run(
        agent.run(
            AiMessageReceivedBody(
                conversation_id="aic-1",
                message_id="aim-1",
                content="why is checkout-api crashing?",
                agent="operations-chat",
                user_id="user-1",
                context={"cluster_id": "target-cluster-01"},
            )
        )
    )

    assert result["content"] == "agent answer"
    assert "checkout-api" in llm.prompts[0]
    assert "target-cluster-01" in llm.prompts[0]


def test_llm_client_defaults_to_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    assert isinstance(llm.build_llm_client(), FakeLlmClient)


def test_http_llm_provider_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "http")
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    with pytest.raises(ValueError, match="LLM_API_KEY"):
        llm.build_llm_client()


@dataclass(frozen=True)
class CurrentUser:
    user_id: str = "user-1"
    roles: tuple[str, ...] = ("admin",)
    workspace_id: str = "default"


class FakeDb:
    def __init__(self) -> None:
        self.conversations: list[dict[str, Any]] = []
        self.messages: list[dict[str, Any]] = []

    def create_ai_conversation(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.conversations.append(payload)
        return payload

    def append_ai_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.messages.append(payload)
        return payload


class FakeEvents:
    def __init__(self) -> None:
        self.bodies: list[Any] = []

    async def accept_body(self, body: Any, *_args: Any, **_kwargs: Any) -> Any:
        self.bodies.append(body)
        return type(
            "Accepted",
            (),
            {"event": event(body.__subject__, "test", body.to_body())},
        )()


def test_create_conversation_stores_user_message_and_emits_agent_event() -> None:
    db = FakeDb()
    events = FakeEvents()

    response = asyncio.run(
        create_conversation(
            AiConversationCreateRequest(
                title="checkout incident",
                message="explain the latest RCA events",
                context={"cluster_id": "target-cluster-01"},
            ),
            current=CurrentUser(),
            db=db,
            events=events,
        )
    )

    assert response.accepted is True
    assert db.conversations[0]["title"] == "checkout incident"
    assert db.messages[0]["role"] == "user"
    assert [body.__subject__ for body in events.bodies] == [
        "ai.conversation.started",
        "ai.message.received",
    ]
    assert events.bodies[-1].conversation_id == response.conversation_id
