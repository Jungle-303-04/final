from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import httpx
import pytest
from conftest import load_service, run_handler

from domains.ai.events import AiMessageReceivedBody
from domains.ai.router import create_conversation
from packages.ai import llm
from packages.ai.llm import (
    AnthropicMessagesAdapter,
    GeminiGenerateContentAdapter,
    LlmGateway,
    LlmProviderSettings,
    LlmRequest,
    OpenAiChatCompletionsAdapter,
)
from packages.contracts.gateway.requests import AiConversationCreateRequest
from packages.events.envelope import event


class ScriptedLlm:
    """응답 대본을 순서대로 재생하는 가짜 LLM."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        self.prompts.append(prompt)
        return self.replies[min(len(self.prompts) - 1, len(self.replies) - 1)]


class FakeConversationStore:
    """chat-worker 가 호출하는 대화 저장소 메서드만 흉내냄."""

    def __init__(self) -> None:
        self.responses: list[dict[str, Any]] = []
        self.failures: list[dict[str, Any]] = []

    async def list_ai_messages(
        self, workspace_id: str, conversation_id: str, *, newest: int | None = None
    ) -> list[dict[str, Any]]:
        return [{"role": "user", "content": "earlier question"}]

    async def record_ai_response(self, payload: dict[str, Any]) -> None:
        self.responses.append(payload)

    async def record_ai_failure(self, payload: dict[str, Any]) -> None:
        self.failures.append(payload)


def test_chat_worker_answers_via_engine_with_tool_loop() -> None:
    worker = load_service("ai/chat-worker")
    scripted = ScriptedLlm(
        json.dumps({"type": "tool_call", "tool": "list_command_actions", "arguments": {}}),
        json.dumps({"type": "final", "content": "restart is allowed"}),
    )
    worker.engine.llm = scripted
    store = FakeConversationStore()

    outs = run_handler(
        worker.on_ai_message_received,
        AiMessageReceivedBody(
            conversation_id="aic-1",
            message_id="aim-1",
            content="why is checkout-api crashing?",
            agent="operations-chat",
            user_id="user-1",
            context={"cluster_id": "target-cluster-01"},
        ),
        db=store,
    )

    assert [out.__subject__ for out in outs] == ["ai.message.responded"]
    assert outs[0].content == "restart is allowed"
    trace = outs[0].metadata["tool_trace"]
    assert trace[0]["tool"] == "list_command_actions"
    assert trace[0]["ok"] is True
    # 시스템 프롬프트에 대화 정체성/요청 컨텍스트/히스토리가 주입됨
    assert "checkout-api" in scripted.prompts[0]
    assert "target-cluster-01" in scripted.prompts[0]
    assert "[user] earlier question" in scripted.prompts[0]
    assert store.responses and store.responses[0]["content"] == "restart is allowed"


def test_llm_client_defaults_to_openai_and_boots_without_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # provider 미설정이어도 게이트웨이 생성(부팅)은 성공하고,
    # provider 부재는 요청 시점 ValueError 로 실패함(합성 응답 없음).
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    client = llm.build_llm_client()

    assert isinstance(client, LlmGateway)
    assert client.default_provider == "unconfigured"
    with pytest.raises(ValueError, match="LLM_PROVIDER"):
        asyncio.run(client.complete("hello"))


def test_http_llm_provider_requires_api_key_per_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("LLM_PROVIDER", "http")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_COMPATIBLE_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    client = llm.build_llm_client()

    with pytest.raises(ValueError, match="API_KEY"):
        asyncio.run(client.complete("hello"))


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
    roles: tuple[str, ...] = ("service_admin",)
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
        "ai.message.received",
    ]
    assert events.bodies[-1].conversation_id == response.conversation_id


class TransactionalFakeDb(FakeDb):
    """unit_of_work 를 제공해 쓰기·이벤트 스테이징이 한 트랜잭션으로 묶이는지 기록함."""

    def __init__(self) -> None:
        super().__init__()
        self.uow_active = False
        self.calls: list[tuple[str, bool]] = []

    @contextmanager
    def unit_of_work(self):
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def create_ai_conversation(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("create_conversation", self.uow_active))
        return super().create_ai_conversation(payload)

    def append_ai_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(("append_message", self.uow_active))
        return super().append_ai_message(payload)


class UowTrackingEvents(FakeEvents):
    """accept_body 시점에 db 트랜잭션이 열려 있는지 기록함."""

    def __init__(self, db: TransactionalFakeDb) -> None:
        super().__init__()
        self.db = db
        self.accepted_in_uow: list[bool] = []

    async def accept_body(self, body: Any, *args: Any, **kwargs: Any) -> Any:
        self.accepted_in_uow.append(self.db.uow_active)
        return await super().accept_body(body, *args, **kwargs)


def test_create_conversation_wraps_writes_and_event_in_single_transaction() -> None:
    # 대화 생성·첫 메시지·이벤트 스테이징이 하나의 unit_of_work 안에서 실행돼야 함
    # (부분 실패 시 메시지 없는 대화·이벤트 없는 메시지 고아 방지).
    db = TransactionalFakeDb()
    events = UowTrackingEvents(db)

    response = asyncio.run(
        create_conversation(
            AiConversationCreateRequest(message="wrap me in one transaction"),
            current=CurrentUser(),
            db=db,
            events=events,
        )
    )

    assert response.accepted is True
    assert db.calls == [("create_conversation", True), ("append_message", True)]
    assert events.accepted_in_uow == [True]
    assert db.uow_active is False  # 핸들러 종료 후 트랜잭션 정리 확인
