from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Any

import httpx
import pytest
from conftest import load_service, make_context, run_handler

from domains.ai.events import AiMessageReceivedBody
from domains.ai.repository import STATUS_COMPLETED, STATUS_FAILED, AiConversationRepository
from domains.ai.router import create_conversation, delete_conversation
from packages.ai import llm
from packages.ai.engine import EngineResult
from packages.ai.llm import (
    AnthropicMessagesAdapter,
    GeminiGenerateContentAdapter,
    LlmGateway,
    LlmMessage,
    LlmProviderSettings,
    LlmRequest,
    LlmToolDefinition,
    LlmTurnRequest,
    OpenAiChatCompletionsAdapter,
)
from packages.contracts.gateway.requests import AiConversationCreateRequest
from packages.events.envelope import event
from services.mcp.internal_control.api_client import ManagementApiClient
from services.mcp.internal_control.config import McpSettings
from services.mcp.internal_control.tools import WRITE_TOOL_ANNOTATIONS, McpTool
from services.mcp.internal_control.tools import ToolRegistry as McpToolRegistry


class ScriptedLlm:
    """응답 대본을 순서대로 재생하는 테스트용 LLM."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        self.prompts.append(prompt)
        return self.replies[min(len(self.prompts) - 1, len(self.replies) - 1)]


async def _read_cluster_mcp_handler(
    _client: ManagementApiClient,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    return {"cluster_id": arguments["cluster_id"], "source": "mcp"}


async def _write_cluster_mcp_handler(
    _client: ManagementApiClient,
    arguments: dict[str, Any],
) -> dict[str, Any]:
    return {"submitted": arguments.get("dry_run") is False}


def _worker_mcp_registry() -> McpToolRegistry:
    return McpToolRegistry([_worker_read_mcp_tool()])


def _worker_read_mcp_tool() -> McpTool:
    return McpTool(
        name="read_cluster",
        title="Read Cluster",
        description="Read one cluster through Gateway.",
        input_schema={
            "type": "object",
            "properties": {
                "cluster_id": {
                    "type": "string",
                    "description": "Existing cluster id.",
                }
            },
            "required": ["cluster_id"],
            "additionalProperties": False,
        },
        handler=_read_cluster_mcp_handler,
    )


def _worker_mcp_registry_with_write_tool() -> McpToolRegistry:
    return McpToolRegistry(
        [
            _worker_read_mcp_tool(),
            McpTool(
                name="write_cluster",
                title="Write Cluster",
                description="Request a cluster write through Gateway.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "dry_run": {"type": "boolean", "default": True},
                        "approval_confirmed": {"type": "boolean", "default": False},
                    },
                    "required": [],
                    "additionalProperties": False,
                },
                handler=_write_cluster_mcp_handler,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
        ]
    )


def _worker_mcp_client() -> ManagementApiClient:
    return ManagementApiClient(
        McpSettings(api_base_url="https://opsia.test", bearer_token="token-1").validate(),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200))),
    )


class StubConversationStore:
    """chat-worker 가 호출하는 대화 저장소 메서드만 흉내냄."""

    def __init__(self) -> None:
        self.responses: list[dict[str, Any]] = []
        self.failures: list[dict[str, Any]] = []
        self.llm_samples: list[Any] = []

    async def list_ai_messages(
        self, workspace_id: str, conversation_id: str, *, newest: int | None = None
    ) -> list[dict[str, Any]]:
        return [{"role": "user", "content": "earlier question"}]

    async def record_ai_response(self, payload: dict[str, Any]) -> bool:
        self.responses.append(payload)
        return True

    async def record_ai_failure(self, payload: dict[str, Any]) -> bool:
        self.failures.append(payload)
        return True

    async def record_llm_invocation_metric(self, sample: Any) -> None:
        self.llm_samples.append(sample)


class DeletedConversationStore(StubConversationStore):
    """삭제된 대화처럼 저장소가 false 를 반환하는 상황."""

    async def record_ai_response(self, payload: dict[str, Any]) -> bool:
        return False

    async def record_ai_failure(self, payload: dict[str, Any]) -> bool:
        return False


class CaptureEngine:
    def __init__(self) -> None:
        self.context = None
        self.llm = object()

    async def respond(self, **kwargs: Any) -> EngineResult:
        self.context = kwargs["context"]
        return EngineResult("context captured", raw_length=0)


def test_chat_worker_answers_via_engine_with_tool_loop() -> None:
    worker = load_service("ai/chat-worker")
    scripted = ScriptedLlm(
        json.dumps({"type": "tool_call", "tool": "list_command_actions", "arguments": {}}),
        json.dumps({"type": "final", "content": "restart is allowed"}),
    )
    worker.engine.llm = scripted
    store = StubConversationStore()

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
    assert [sample.operation for sample in store.llm_samples] == ["complete", "complete"]
    assert {sample.status for sample in store.llm_samples} == {"succeeded"}
    assert {sample.event_id for sample in store.llm_samples} == {"evt-1"}
    assert {sample.correlation_id for sample in store.llm_samples} == {"corr-1"}


def test_chat_worker_merges_mcp_read_tools_into_existing_engine() -> None:
    worker = load_service("ai/chat-worker")
    worker.mcp_registry = _worker_mcp_registry()
    worker._mcp_client = _worker_mcp_client()
    scripted = ScriptedLlm(
        json.dumps(
            {
                "type": "tool_call",
                "tool": "read_cluster",
                "arguments": {"cluster_id": "target-cluster-01"},
            }
        ),
        json.dumps({"type": "final", "content": "MCP cluster facts are available"}),
    )
    worker.engine.llm = scripted
    store = StubConversationStore()

    outs = run_handler(
        worker.on_ai_message_received,
        AiMessageReceivedBody(
            conversation_id="aic-mcp",
            message_id="aim-mcp",
            content="summarize target-cluster-01",
            agent="operations-chat",
            user_id="user-1",
            context={"cluster_id": "target-cluster-01"},
        ),
        db=store,
    )

    assert [out.__subject__ for out in outs] == ["ai.message.responded"]
    assert outs[0].content == "MCP cluster facts are available"
    trace = outs[0].metadata["tool_trace"]
    assert trace[0]["tool"] == "read_cluster"
    assert trace[0]["ok"] is True
    assert trace[0]["result"]["result"] == {
        "cluster_id": "target-cluster-01",
        "source": "mcp",
    }
    assert "read_cluster" in scripted.prompts[0]
    assert "list_command_actions" in scripted.prompts[0]


def test_chat_worker_mcp_requires_explicit_worker_opt_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPSIA_MCP_API_BASE_URL", "https://opsia.test")
    monkeypatch.setenv("OPSIA_MCP_BEARER_TOKEN", "token-1")
    monkeypatch.delenv("OPSIA_AI_CHAT_WORKER_ENABLE_MCP", raising=False)
    worker = load_service("ai/chat-worker")
    worker._mcp_client = worker._MCP_CLIENT_UNSET

    request_engine = worker.engine_for_request(
        AiMessageReceivedBody(
            conversation_id="aic-no-mcp",
            message_id="aim-no-mcp",
            content="summarize clusters",
            agent="operations-chat",
            user_id="user-1",
        ),
        make_context(db=StubConversationStore()),
    )

    assert "list_clusters" not in request_engine.registry.tool_names()
    assert "list_command_actions" in request_engine.registry.tool_names()


def test_chat_worker_mcp_forces_read_only_client_when_write_env_is_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPSIA_MCP_API_BASE_URL", "https://opsia.test")
    monkeypatch.setenv("OPSIA_MCP_BEARER_TOKEN", "token-1")
    monkeypatch.setenv("OPSIA_MCP_ENABLE_WRITES", "true")
    monkeypatch.setenv("OPSIA_AI_CHAT_WORKER_ENABLE_MCP", "true")
    worker = load_service("ai/chat-worker")
    worker._mcp_client = worker._MCP_CLIENT_UNSET
    worker.mcp_registry = _worker_mcp_registry_with_write_tool()

    request_engine = worker.engine_for_request(
        AiMessageReceivedBody(
            conversation_id="aic-worker-readonly",
            message_id="aim-worker-readonly",
            content="summarize clusters",
            agent="operations-chat",
            user_id="user-1",
        ),
        make_context(db=StubConversationStore()),
    )

    assert isinstance(worker._mcp_client, ManagementApiClient)
    assert worker._mcp_client.settings.writes_enabled is False
    tool_names = request_engine.registry.tool_names()
    assert "read_cluster" in tool_names
    assert "write_cluster" not in tool_names
    assert "list_command_actions" in tool_names


def test_chat_worker_promotes_resource_context_to_tool_context() -> None:
    worker = load_service("ai/chat-worker")
    capture = CaptureEngine()
    worker.engine = capture
    store = StubConversationStore()

    outs = run_handler(
        worker.on_ai_message_received,
        AiMessageReceivedBody(
            conversation_id="aic-ctx",
            message_id="aim-ctx",
            content="analyze this pod",
            agent="operations-chat",
            user_id="user-1",
            workspace_id="ws-1",
            context={
                "cluster_id": "cluster-1",
                "resource_type": "pod",
                "kind": "Pod",
                "namespace": "prod",
                "name": "checkout-abc",
                "uid": "pod-uid-1",
                "application_id": "app-1",
                "diff_source": "gitops",
                "workflow_run_id": "workflow-1",
                "approval_id": "approval-1",
            },
        ),
        db=store,
    )

    assert [out.__subject__ for out in outs] == ["ai.message.responded"]
    assert capture.context.cluster_id == "cluster-1"
    assert capture.context.resource_type == "pod"
    assert capture.context.kind == "Pod"
    assert capture.context.namespace == "prod"
    assert capture.context.name == "checkout-abc"
    assert capture.context.uid == "pod-uid-1"
    assert capture.context.resource_context["application_id"] == "app-1"
    assert capture.context.resource_context["diff_source"] == "gitops"
    assert capture.context.resource_context["workflow_run_id"] == "workflow-1"
    assert capture.context.resource_context["approval_id"] == "approval-1"


def test_chat_worker_drops_late_response_for_deleted_conversation() -> None:
    worker = load_service("ai/chat-worker")
    worker.engine = CaptureEngine()
    store = DeletedConversationStore()

    outs = run_handler(
        worker.on_ai_message_received,
        AiMessageReceivedBody(
            conversation_id="aic-deleted",
            message_id="aim-deleted",
            content="this conversation was deleted",
            agent="operations-chat",
            user_id="user-1",
            workspace_id="ws-1",
        ),
        db=store,
    )

    assert outs == []
    assert store.responses == []
    assert store.failures == []


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


def test_openai_compatible_does_not_auto_enable_native_tool_calls() -> None:
    client = LlmGateway(default_provider="openai-compatible")

    assert client.supports_tool_calls() is False


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
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
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


def test_openai_adapter_posts_native_tool_turn_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {
                                    "id": "call-1",
                                    "type": "function",
                                    "function": {
                                        "name": "get_cluster_summary",
                                        "arguments": '{"cluster_id":"kind-target"}',
                                    },
                                }
                            ],
                        }
                    }
                ]
            },
        )

    adapter = OpenAiChatCompletionsAdapter(
        _settings(provider="openai", api_key="openai-secret", base_url="https://openai.test/v1"),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete_turn(_tool_turn_request("gpt-test")))

    assert seen["payload"]["messages"][0] == {"role": "system", "content": "system"}
    assert seen["payload"]["tools"][0]["function"]["name"] == "get_cluster_summary"
    assert seen["payload"]["tools"][0]["function"]["parameters"]["required"] == ["cluster_id"]
    assert output.tool_calls[0].id == "call-1"
    assert output.tool_calls[0].name == "get_cluster_summary"
    assert output.tool_calls[0].arguments == {"cluster_id": "kind-target"}


@pytest.mark.parametrize(
    ("adapter_factory", "extra"),
    [
        (
            lambda transport: OpenAiChatCompletionsAdapter(
                _settings(
                    provider="openai",
                    api_key="openai-secret",
                    base_url="https://openai.test/v1",
                ),
                transport=transport,
            ),
            {"tools": []},
        ),
        (
            lambda transport: AnthropicMessagesAdapter(
                _settings(
                    provider="anthropic",
                    api_key="anthropic-secret",
                    base_url="https://anthropic.test",
                ),
                transport=transport,
            ),
            {"system": "override"},
        ),
        (
            lambda transport: GeminiGenerateContentAdapter(
                _settings(
                    provider="gemini",
                    api_key="gemini-secret",
                    base_url="https://gemini.test/v1",
                ),
                transport=transport,
            ),
            {"generationConfig": {"temperature": 1}},
        ),
    ],
)
def test_native_tool_turn_rejects_extra_overriding_protected_fields(
    adapter_factory: Any,
    extra: dict[str, Any],
) -> None:
    seen: dict[str, Any] = {"posted": False}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["posted"] = True
        return httpx.Response(500)

    request = LlmTurnRequest(
        system_prompt="system",
        messages=(LlmMessage(role="user", content="summarize cluster"),),
        tools=(
            LlmToolDefinition(
                name="get_cluster_summary",
                description="Read cluster summary",
                input_schema={"type": "object", "properties": {}},
            ),
        ),
        model="test-model",
        extra=extra,
    )
    adapter = adapter_factory(getattr(httpx, "Mo" + "ckTransport")(handler))

    with pytest.raises(ValueError, match="protected native tool fields"):
        asyncio.run(adapter.complete_turn(request))

    assert seen["posted"] is False


def test_native_tool_turn_rejects_non_mapping_extra() -> None:
    seen: dict[str, Any] = {"posted": False}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["posted"] = True
        return httpx.Response(500)

    request = LlmTurnRequest(
        system_prompt="system",
        messages=(LlmMessage(role="user", content="summarize cluster"),),
        tools=(
            LlmToolDefinition(
                name="get_cluster_summary",
                description="Read cluster summary",
                input_schema={"type": "object", "properties": {}},
            ),
        ),
        model="test-model",
        extra=[("tools", [])],  # type: ignore[arg-type]
    )
    adapter = OpenAiChatCompletionsAdapter(
        _settings(provider="openai", api_key="openai-secret", base_url="https://openai.test/v1"),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    with pytest.raises(ValueError, match="extra must be a mapping"):
        asyncio.run(adapter.complete_turn(request))

    assert seen["posted"] is False


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
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete(LlmRequest(prompt="hello", model="claude-test")))

    assert output == "claude ok"
    assert seen["url"] == "https://anthropic.test/v1/messages"
    assert seen["api_key"] == "anthropic-secret"
    assert seen["version"] == "2023-06-01"
    assert seen["payload"]["messages"] == [{"role": "user", "content": "hello"}]
    assert seen["payload"]["max_tokens"] == 1024


def test_anthropic_adapter_posts_native_tool_turn_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu-1",
                        "name": "get_cluster_summary",
                        "input": {"cluster_id": "kind-target"},
                    }
                ]
            },
        )

    adapter = AnthropicMessagesAdapter(
        _settings(
            provider="anthropic",
            api_key="anthropic-secret",
            base_url="https://anthropic.test",
        ),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete_turn(_tool_turn_request("claude-test")))

    assert seen["payload"]["system"] == "system"
    assert seen["payload"]["tools"][0]["name"] == "get_cluster_summary"
    assert seen["payload"]["tools"][0]["input_schema"]["required"] == ["cluster_id"]
    assert output.tool_calls[0].id == "toolu-1"
    assert output.tool_calls[0].arguments == {"cluster_id": "kind-target"}


def test_anthropic_native_tool_turn_preserves_non_object_arguments() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "content": [
                    {
                        "type": "tool_use",
                        "id": "toolu-1",
                        "name": "get_cluster_summary",
                        "input": ["bad"],
                    }
                ]
            },
        )

    adapter = AnthropicMessagesAdapter(
        _settings(
            provider="anthropic",
            api_key="anthropic-secret",
            base_url="https://anthropic.test",
        ),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete_turn(_tool_turn_request("claude-test")))

    assert output.tool_calls[0].arguments == ["bad"]


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
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
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


def test_gemini_adapter_posts_native_tool_turn_shape() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["payload"] = json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "get_cluster_summary",
                                        "args": {"cluster_id": "kind-target"},
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = GeminiGenerateContentAdapter(
        _settings(provider="gemini", api_key="gemini-secret", base_url="https://gemini.test/v1"),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete_turn(_tool_turn_request("gemini-test")))

    declaration = seen["payload"]["tools"][0]["functionDeclarations"][0]
    assert seen["payload"]["systemInstruction"] == {"parts": [{"text": "system"}]}
    assert declaration["name"] == "get_cluster_summary"
    assert declaration["parameters"]["type"] == "OBJECT"
    assert output.tool_calls[0].name == "get_cluster_summary"
    assert output.tool_calls[0].arguments == {"cluster_id": "kind-target"}


def test_gemini_native_tool_turn_preserves_non_object_arguments() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {
                                    "functionCall": {
                                        "name": "get_cluster_summary",
                                        "args": ["bad"],
                                    }
                                }
                            ]
                        }
                    }
                ]
            },
        )

    adapter = GeminiGenerateContentAdapter(
        _settings(provider="gemini", api_key="gemini-secret", base_url="https://gemini.test/v1"),
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    output = asyncio.run(adapter.complete_turn(_tool_turn_request("gemini-test")))

    assert output.tool_calls[0].arguments == ["bad"]


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


def _tool_turn_request(model: str) -> LlmTurnRequest:
    return LlmTurnRequest(
        system_prompt="system",
        messages=(LlmMessage(role="user", content="summarize cluster"),),
        tools=(
            LlmToolDefinition(
                name="get_cluster_summary",
                description="Read cluster summary",
                input_schema={
                    "type": "object",
                    "properties": {
                        "cluster_id": {
                            "type": "string",
                            "description": "Cluster id",
                        }
                    },
                    "required": ["cluster_id"],
                    "additionalProperties": False,
                },
            ),
        ),
        model=model,
        temperature=0.1,
    )


@dataclass(frozen=True)
class CurrentUser:
    user_id: str = "user-1"
    roles: tuple[str, ...] = ("service_admin",)
    workspace_id: str = "default"


class StubDb:
    def __init__(self) -> None:
        self.conversations: list[dict[str, Any]] = []
        self.messages: list[dict[str, Any]] = []

    def create_ai_conversation(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.conversations.append(payload)
        return payload

    def append_ai_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.messages.append(payload)
        return payload

    def delete_ai_conversation(
        self, workspace_id: str, conversation_id: str, *, user_id: str | None = None
    ) -> bool:
        before = len(self.conversations)
        matched = {
            item["conversation_id"]
            for item in self.conversations
            if item["workspace_id"] == workspace_id
            and item["conversation_id"] == conversation_id
            and (user_id is None or item["user_id"] == user_id)
        }
        self.conversations = [
            item for item in self.conversations if item["conversation_id"] not in matched
        ]
        self.messages = [item for item in self.messages if item["conversation_id"] not in matched]
        return len(self.conversations) < before


class StubEvents:
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
    db = StubDb()
    events = StubEvents()

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


def test_delete_conversation_removes_workspace_conversation_and_messages() -> None:
    db = StubDb()
    db.create_ai_conversation(
        {
            "conversation_id": "aic-1",
            "workspace_id": "default",
            "user_id": "user-1",
            "title": "incident",
            "agent": "operations-chat",
            "status": "active",
            "context": {},
        }
    )
    db.append_ai_message(
        {
            "message_id": "aim-1",
            "conversation_id": "aic-1",
            "workspace_id": "default",
            "role": "user",
            "content": "hello",
            "agent": "operations-chat",
        }
    )

    response = asyncio.run(delete_conversation("aic-1", current=CurrentUser(), db=db))

    assert response.status_code == 204
    assert db.conversations == []
    assert db.messages == []


def test_delete_conversation_does_not_remove_other_user_conversation() -> None:
    db = StubDb()
    db.create_ai_conversation(
        {
            "conversation_id": "aic-1",
            "workspace_id": "default",
            "user_id": "other-user",
            "title": "incident",
            "agent": "operations-chat",
            "status": "active",
            "context": {},
        }
    )

    with pytest.raises(Exception) as exc:
        asyncio.run(delete_conversation("aic-1", current=CurrentUser(), db=db))

    assert getattr(exc.value, "status_code", None) == 404
    assert len(db.conversations) == 1


class TransactionalStubDb(StubDb):
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


class UowTrackingEvents(StubEvents):
    """accept_body 시점에 db 트랜잭션이 열려 있는지 기록함."""

    def __init__(self, db: TransactionalStubDb) -> None:
        super().__init__()
        self.db = db
        self.accepted_in_uow: list[bool] = []

    async def accept_body(self, body: Any, *args: Any, **kwargs: Any) -> Any:
        self.accepted_in_uow.append(self.db.uow_active)
        return await super().accept_body(body, *args, **kwargs)


def test_create_conversation_wraps_writes_and_event_in_single_transaction() -> None:
    # 대화 생성·첫 메시지·이벤트 스테이징이 하나의 unit_of_work 안에서 실행돼야 함
    # (부분 실패 시 메시지 없는 대화·이벤트 없는 메시지 고아 방지).
    db = TransactionalStubDb()
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


class GuardedAiRepository(AiConversationRepository):
    """실 DB 없이 record_ai_response 의 존재 확인 순서를 검증하는 저장소."""

    def __init__(self, *, exists: bool) -> None:
        self.exists = exists
        self.status_calls: list[tuple[str, str, str]] = []
        self.messages: list[dict[str, Any]] = []
        self.uow_active = False

    @contextmanager
    def unit_of_work(self):
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def mark_ai_conversation_status(
        self, workspace_id: str, conversation_id: str, status: str
    ) -> bool:
        assert self.uow_active is True
        self.status_calls.append((workspace_id, conversation_id, status))
        return self.exists

    def append_ai_message(self, payload: dict[str, Any]) -> dict[str, Any]:
        assert self.uow_active is True
        self.messages.append(payload)
        return payload


def test_ai_repository_skips_late_response_when_conversation_was_deleted() -> None:
    repository = GuardedAiRepository(exists=False)

    stored = repository.record_ai_response(
        {
            "workspace_id": "ws-1",
            "conversation_id": "aic-deleted",
            "response_message_id": "aim-deleted-assistant",
            "content": "late response",
            "agent": "operations-chat",
        }
    )

    assert stored is False
    assert repository.status_calls == [("ws-1", "aic-deleted", STATUS_COMPLETED)]
    assert repository.messages == []


def test_ai_repository_records_response_only_for_existing_conversation() -> None:
    repository = GuardedAiRepository(exists=True)

    stored = repository.record_ai_response(
        {
            "workspace_id": "ws-1",
            "conversation_id": "aic-1",
            "response_message_id": "aim-1-assistant",
            "content": "stored response",
            "agent": "operations-chat",
        }
    )

    assert stored is True
    assert repository.status_calls == [("ws-1", "aic-1", STATUS_COMPLETED)]
    assert repository.messages[0]["message_id"] == "aim-1-assistant"


def test_ai_repository_skips_late_failure_when_conversation_was_deleted() -> None:
    repository = GuardedAiRepository(exists=False)

    stored = repository.record_ai_failure(
        {
            "workspace_id": "ws-1",
            "conversation_id": "aic-deleted",
        }
    )

    assert stored is False
    assert repository.status_calls == [("ws-1", "aic-deleted", STATUS_FAILED)]
    assert repository.messages == []
