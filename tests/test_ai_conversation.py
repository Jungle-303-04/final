from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import httpx
import pytest

from domains.ai.agent import OperationsChatAgent
from domains.ai.events import AiMessageReceivedBody
from domains.ai.router import create_conversation
from packages.ai import llm
from packages.ai.llm import (
    AnthropicMessagesAdapter,
    FakeLlmClient,
    GeminiGenerateContentAdapter,
    LlmGateway,
    LlmProviderSettings,
    LlmRequest,
    OpenAiChatCompletionsAdapter,
)
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

    client = llm.build_llm_client()

    assert isinstance(client, LlmGateway)
    assert client.metadata()["provider"] == "fake"
    assert asyncio.run(client.complete("hello")) == "fake-llm-response"


def test_http_llm_provider_requires_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "http")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_COMPATIBLE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    with pytest.raises(ValueError, match="API_KEY"):
        llm.build_llm_client()


def test_llm_gateway_selects_anthropic_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "anthropic")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anthropic-secret")
    monkeypatch.setenv("ANTHROPIC_MODEL", "claude-test-model")
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    client = llm.build_llm_client()

    assert isinstance(client, LlmGateway)
    assert client.metadata()["provider"] == "anthropic"
    assert client.metadata()["model"] == "claude-test-model"


def test_openai_adapter_posts_chat_completion_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["authorization"] = request.headers["authorization"]
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "openai ok"}}]})

    adapter = OpenAiChatCompletionsAdapter(
        _settings(provider="openai", api_key="openai-secret", base_url="https://openai.test/v1"),
        transport=httpx.MockTransport(handler),
    )

    output = asyncio.run(
        adapter.complete(
            LlmRequest(
                prompt="hello",
                model="gpt-test",
                response_format={"type": "json_object"},
            )
        )
    )

    assert output == "openai ok"
    assert seen["url"] == "https://openai.test/v1/chat/completions"
    assert seen["authorization"] == "Bearer openai-secret"
    assert seen["payload"]["model"] == "gpt-test"
    assert seen["payload"]["response_format"] == {"type": "json_object"}


def test_anthropic_adapter_posts_messages_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["api_key"] = request.headers["x-api-key"]
        seen["version"] = request.headers["anthropic-version"]
        seen["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"content": [{"type": "text", "text": "claude ok"}]})

    adapter = AnthropicMessagesAdapter(
        _settings(
            provider="anthropic",
            api_key="anthropic-secret",
            base_url="https://anthropic.test",
        ),
        transport=httpx.MockTransport(handler),
    )

    output = asyncio.run(adapter.complete(LlmRequest(prompt="hello", model="claude-test")))

    assert output == "claude ok"
    assert seen["url"] == "https://anthropic.test/v1/messages"
    assert seen["api_key"] == "anthropic-secret"
    assert seen["version"] == "2023-06-01"
    assert seen["payload"]["messages"] == [{"role": "user", "content": "hello"}]
    assert seen["payload"]["max_tokens"] == 1024


def test_gemini_adapter_posts_generate_content_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["api_key"] = request.headers["x-goog-api-key"]
        seen["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={"candidates": [{"content": {"parts": [{"text": "gemini ok"}]}}]},
        )

    adapter = GeminiGenerateContentAdapter(
        _settings(provider="gemini", api_key="gemini-secret", base_url="https://gemini.test/v1"),
        transport=httpx.MockTransport(handler),
    )

    output = asyncio.run(
        adapter.complete(
            LlmRequest(
                prompt="hello",
                model="gemini-test",
                response_format={"type": "json_object"},
            )
        )
    )

    assert output == "gemini ok"
    assert seen["url"] == "https://gemini.test/v1/models/gemini-test:generateContent"
    assert seen["api_key"] == "gemini-secret"
    assert seen["payload"]["contents"] == [{"role": "user", "parts": [{"text": "hello"}]}]
    assert seen["payload"]["generationConfig"]["responseMimeType"] == "application/json"


def _settings(*, provider: str, api_key: str, base_url: str) -> LlmProviderSettings:
    return LlmProviderSettings(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        api_key_env="TEST_API_KEY",
        model="test-model",
        timeout_seconds=1,
        max_retries=0,
        default_max_tokens=1024,
    )


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
