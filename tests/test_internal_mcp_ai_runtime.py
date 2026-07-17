from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx
import pytest

from packages.ai.tools import ToolContext
from packages.ai.tools import ToolRegistry as AiToolRegistry
from services.mcp.internal_control.ai_runtime import (
    AiRuntimeMcpExecutor,
    ai_tool_registry_from_mcp,
    ai_tool_registry_with_mcp,
    anthropic_tools,
    format_runtime_tools,
    gemini_function_declarations,
    mcp_conversation_engine,
    openai_tools,
    tools_from_mcp_registry,
)
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.config import McpConfigurationError, McpSettings
from services.mcp.internal_control.tools import (
    WRITE_TOOL_ANNOTATIONS,
    McpTool,
    ToolInputError,
    ToolRegistry,
    default_tool_registry,
)


class _ScriptedLlm:
    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **_options: Any) -> str:
        self.prompts.append(prompt)
        index = min(len(self.prompts) - 1, len(self.replies) - 1)
        return self.replies[index]


async def _read_handler(_client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    return {"tool": "read_cluster", "arguments": arguments}


async def _base_ai_handler(context: ToolContext) -> dict[str, Any]:
    return {"workspace_id": context.workspace_id}


async def _base_read_cluster_handler(
    _context: ToolContext,
    cluster_id: str,
) -> dict[str, Any]:
    return {"cluster_id": cluster_id, "source": "base"}


async def _write_handler(_client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    return {"tool": "write_cluster", "arguments": arguments}


async def _tool_input_error_handler(
    _client: ManagementApiClient,
    _arguments: dict[str, Any],
) -> dict[str, Any]:
    raise ToolInputError(
        "authorization: Bearer secret-token password=plain-secret admin@example.com"
    )


async def _management_api_error_handler(
    _client: ManagementApiClient,
    _arguments: dict[str, Any],
) -> dict[str, Any]:
    raise ManagementApiError(
        403,
        "cookie: service_session=session-token token=plain-secret admin@example.com",
    )


async def _sensitive_success_handler(
    _client: ManagementApiClient,
    _arguments: dict[str, Any],
) -> dict[str, Any]:
    return {
        "cluster_id": "cluster-1",
        "password": "result-password",
        "note": "authorization: Bearer result-token token=result-secret admin@example.com",
    }


def _sample_registry() -> ToolRegistry:
    return ToolRegistry(
        [
            McpTool(
                name="read_cluster",
                title="Read Cluster",
                description="Read one cluster through Gateway.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "cluster_id": {
                            "type": "string",
                            "description": "Existing cluster id.",
                            "minLength": 1,
                            "maxLength": 128,
                        }
                    },
                    "required": ["cluster_id"],
                    "additionalProperties": False,
                },
                handler=_read_handler,
            ),
            McpTool(
                name="write_cluster",
                title="Write Cluster",
                description="Request a cluster write through Gateway.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "dry_run": {
                            "type": "boolean",
                            "description": "Do not submit when true.",
                            "default": True,
                        },
                        "approval_confirmed": {
                            "type": "boolean",
                            "description": "Must be true after operator approval.",
                            "default": False,
                        },
                    },
                    "required": [],
                    "additionalProperties": False,
                },
                handler=_write_handler,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
        ]
    )


def _client(*, writes_enabled: bool = False) -> ManagementApiClient:
    return ManagementApiClient(
        McpSettings(
            api_base_url="https://opsia.test",
            bearer_token="token-1",
            writes_enabled=writes_enabled,
        ).validate(),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200))),
    )


def _tool_context() -> ToolContext:
    return ToolContext(db=None, workspace_id="workspace-1", user_id="user-1")


def _final(content: str) -> str:
    return json.dumps({"type": "final", "content": content}, ensure_ascii=False)


def _tool_call(tool: str, **arguments: Any) -> str:
    return json.dumps(
        {"type": "tool_call", "tool": tool, "arguments": arguments},
        ensure_ascii=False,
    )


def test_runtime_tools_default_to_read_only_default_registry_tools() -> None:
    registry = default_tool_registry()
    raw_tools = registry.list_tools()
    expected_names = tuple(
        sorted(tool["name"] for tool in raw_tools if tool["annotations"]["readOnlyHint"] is True)
    )

    runtime_tools = tools_from_mcp_registry(registry)

    assert tuple(tool.name for tool in runtime_tools) == expected_names
    assert all(tool.read_only is True for tool in runtime_tools)
    assert all(tool.approval_required is False for tool in runtime_tools)
    assert "create_alert_rule" not in {tool.name for tool in runtime_tools}


def test_runtime_tools_with_write_enabled_match_default_registry_tools() -> None:
    registry = default_tool_registry()
    expected_names = tuple(sorted(tool["name"] for tool in registry.list_tools()))

    runtime_tools = tools_from_mcp_registry(
        registry,
        include_write_tools=True,
        write_tools_enabled=True,
    )

    assert tuple(tool.name for tool in runtime_tools) == expected_names
    assert any(tool.approval_required is True for tool in runtime_tools)
    assert any(tool.read_only is False for tool in runtime_tools)
    for tool in runtime_tools:
        if tool.read_only:
            continue
        properties = tool.input_schema.get("properties") or {}
        assert "dry_run" not in properties
        assert "approval_confirmed" not in properties


def test_runtime_tools_can_explicitly_include_write_tools_with_safety_metadata() -> None:
    runtime_tools = tools_from_mcp_registry(
        _sample_registry(),
        include_write_tools=True,
        write_tools_enabled=True,
    )
    by_name = {tool.name: tool for tool in runtime_tools}

    assert tuple(by_name) == ("read_cluster", "write_cluster")
    assert by_name["read_cluster"].read_only is True
    assert by_name["write_cluster"].read_only is False
    assert by_name["write_cluster"].destructive is True
    assert by_name["write_cluster"].approval_required is True
    assert "operator approval" in by_name["write_cluster"].description
    assert "proposal-only" in by_name["write_cluster"].description
    assert "approval_confirmed" not in by_name["write_cluster"].input_schema["properties"]
    assert "dry_run" not in by_name["write_cluster"].input_schema["properties"]


def test_runtime_tools_require_write_enabled_before_describing_write_tools() -> None:
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        tools_from_mcp_registry(_sample_registry(), include_write_tools=True)


def test_provider_formatters_preserve_schema_without_mutating_registry() -> None:
    registry = _sample_registry()

    openai = openai_tools(registry)
    anthropic = anthropic_tools(registry)
    gemini = gemini_function_declarations(registry)

    assert openai == [
        {
            "type": "function",
            "function": {
                "name": "read_cluster",
                "description": openai[0]["function"]["description"],
                "parameters": registry.list_tools()[0]["inputSchema"],
            },
        }
    ]
    assert anthropic[0]["name"] == "read_cluster"
    assert anthropic[0]["input_schema"]["properties"]["cluster_id"]["maxLength"] == 128
    assert gemini[0]["parameters"]["type"] == "OBJECT"
    assert gemini[0]["parameters"]["properties"]["cluster_id"]["type"] == "STRING"

    openai[0]["function"]["parameters"]["additionalProperties"] = True
    assert registry.list_tools()[0]["inputSchema"]["additionalProperties"] is False


def test_provider_formatters_require_write_enabled_before_describing_write_tools() -> None:
    registry = _sample_registry()

    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        openai_tools(registry, include_write_tools=True)
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        anthropic_tools(registry, include_write_tools=True)
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        gemini_function_declarations(registry, include_write_tools=True)

    assert (
        len(
            openai_tools(
                registry,
                include_write_tools=True,
                write_tools_enabled=True,
            )
        )
        == 2
    )
    assert (
        len(
            anthropic_tools(
                registry,
                include_write_tools=True,
                write_tools_enabled=True,
            )
        )
        == 2
    )
    assert (
        len(
            gemini_function_declarations(
                registry,
                include_write_tools=True,
                write_tools_enabled=True,
            )
        )
        == 2
    )


def test_neutral_formatter_includes_safety_contract() -> None:
    tools = tools_from_mcp_registry(
        _sample_registry(),
        include_write_tools=True,
        write_tools_enabled=True,
    )
    neutral = format_runtime_tools(tools, format="neutral")

    assert neutral[0]["safety"] == {
        "read_only": True,
        "destructive": False,
        "idempotent": True,
        "approval_required": False,
    }
    assert neutral[1]["safety"] == {
        "read_only": False,
        "destructive": True,
        "idempotent": False,
        "approval_required": True,
    }


def test_runtime_executor_invokes_only_exposed_tools() -> None:
    async def run() -> None:
        registry = _sample_registry()
        executor = AiRuntimeMcpExecutor(registry, _client())

        result = await executor.call("read_cluster", {"cluster_id": "cluster-1"})

        assert result == {
            "tool": "read_cluster",
            "ok": True,
            "result": {
                "tool": "read_cluster",
                "arguments": {"cluster_id": "cluster-1"},
            },
        }
        with pytest.raises(ToolInputError, match="not exposed"):
            await executor.call("write_cluster", {"dry_run": True})

    asyncio.run(run())


def test_runtime_executor_does_not_echo_unknown_tool_names() -> None:
    async def run() -> None:
        executor = AiRuntimeMcpExecutor(_sample_registry(), _client())

        with pytest.raises(ToolInputError) as exc_info:
            await executor.call("authorization: Bearer secret-token", {})

        detail = str(exc_info.value)
        assert "secret-token" not in detail
        assert "authorization" not in detail
        assert detail == "tool is not exposed to the AI runtime"

    asyncio.run(run())


def test_runtime_executor_rejects_non_object_arguments_before_registry_call() -> None:
    async def run() -> None:
        executor = AiRuntimeMcpExecutor(_sample_registry(), _client())

        with pytest.raises(ToolInputError, match="arguments must be an object"):
            await executor.call("read_cluster", [])  # type: ignore[arg-type]
        with pytest.raises(ToolInputError, match="tool name is required"):
            await executor.call("", {})

    asyncio.run(run())


def test_runtime_executor_can_expose_write_tools_only_when_explicitly_allowed() -> None:
    async def run() -> None:
        executor = AiRuntimeMcpExecutor(
            _sample_registry(),
            _client(writes_enabled=True),
            allow_write_tools=True,
        )

        result = await executor.call("write_cluster", {"dry_run": True})

        assert result["tool"] == "write_cluster"
        assert result["ok"] is True
        assert result["result"]["arguments"] == {"dry_run": True}

    asyncio.run(run())


def test_runtime_executor_blocks_ai_runtime_write_submission_flags() -> None:
    async def run() -> None:
        executor = AiRuntimeMcpExecutor(
            _sample_registry(),
            _client(writes_enabled=True),
            allow_write_tools=True,
        )

        for arguments in (
            {"dry_run": False},
            {"dry_run": True, "approval_confirmed": True},
        ):
            with pytest.raises(ToolInputError, match="proposal-only"):
                await executor.call("write_cluster", arguments)

    asyncio.run(run())


def test_runtime_executor_requires_write_enabled_before_exposing_write_tools() -> None:
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        AiRuntimeMcpExecutor(
            _sample_registry(),
            _client(writes_enabled=False),
            allow_write_tools=True,
        )


def test_runtime_executor_redacts_sensitive_tool_input_errors() -> None:
    async def run() -> None:
        registry = ToolRegistry(
            [
                McpTool(
                    name="read_leaky_error",
                    title="Read Leaky Error",
                    description="Raises a sensitive error.",
                    input_schema={
                        "type": "object",
                        "properties": {},
                        "required": [],
                        "additionalProperties": False,
                    },
                    handler=_tool_input_error_handler,
                )
            ]
        )
        executor = AiRuntimeMcpExecutor(registry, _client())

        with pytest.raises(ToolInputError) as exc_info:
            await executor.call("read_leaky_error", {})

        detail = str(exc_info.value)
        assert "secret-token" not in detail
        assert "plain-secret" not in detail
        assert "admin@example.com" not in detail
        assert "[REDACTED]" in detail

    asyncio.run(run())


def test_runtime_executor_redacts_sensitive_management_api_errors() -> None:
    async def run() -> None:
        registry = ToolRegistry(
            [
                McpTool(
                    name="read_leaky_management_error",
                    title="Read Leaky Management Error",
                    description="Raises a sensitive management API error.",
                    input_schema={
                        "type": "object",
                        "properties": {},
                        "required": [],
                        "additionalProperties": False,
                    },
                    handler=_management_api_error_handler,
                )
            ]
        )
        executor = AiRuntimeMcpExecutor(registry, _client())

        with pytest.raises(ManagementApiError) as exc_info:
            await executor.call("read_leaky_management_error", {})

        detail = exc_info.value.detail
        assert "session-token" not in detail
        assert "plain-secret" not in detail
        assert "admin@example.com" not in detail
        assert "[REDACTED]" in detail

    asyncio.run(run())


def test_runtime_executor_redacts_sensitive_success_payloads() -> None:
    async def run() -> None:
        registry = ToolRegistry(
            [
                McpTool(
                    name="read_sensitive_payload",
                    title="Read Sensitive Payload",
                    description="Returns a sensitive-looking success payload.",
                    input_schema={
                        "type": "object",
                        "properties": {},
                        "required": [],
                        "additionalProperties": False,
                    },
                    handler=_sensitive_success_handler,
                )
            ]
        )
        executor = AiRuntimeMcpExecutor(registry, _client())

        result = await executor.call("read_sensitive_payload", {})

        serialized = json.dumps(result, ensure_ascii=False)
        assert result["result"]["cluster_id"] == "cluster-1"
        assert result["result"]["password"] == "[REDACTED]"
        for leaked in (
            "result-password",
            "result-token",
            "result-secret",
            "admin@example.com",
        ):
            assert leaked not in serialized
        assert "[REDACTED]" in serialized

    asyncio.run(run())


def test_mcp_tools_can_be_registered_for_internal_conversation_engine() -> None:
    async def run() -> None:
        ai_registry = ai_tool_registry_from_mcp(_sample_registry(), _client())

        assert ai_registry.tool_names() == ("read_cluster",)
        spec = ai_registry.spec("read_cluster")
        assert spec.required_parameters() == ("cluster_id",)
        assert "read-only Gateway API call" in spec.description

        result = await ai_registry.execute(
            "read_cluster",
            _tool_context(),
            {"cluster_id": "cluster-1"},
        )

        assert result == {
            "tool": "read_cluster",
            "ok": True,
            "result": {
                "tool": "read_cluster",
                "arguments": {"cluster_id": "cluster-1"},
            },
        }
        with pytest.raises(ValueError, match="unknown ai tool: write_cluster"):
            ai_registry.spec("write_cluster")

    asyncio.run(run())


def test_mcp_tools_can_be_merged_with_existing_internal_ai_tools() -> None:
    async def run() -> None:
        base_registry = AiToolRegistry()
        base_registry.tool(
            name="base_status",
            description="Read the existing internal AI context.",
        )(_base_ai_handler)

        merged = ai_tool_registry_with_mcp(
            base_registry,
            _client(),
            registry=_sample_registry(),
        )

        assert merged.tool_names() == ("base_status", "read_cluster")
        assert await merged.execute("base_status", _tool_context(), {}) == {
            "workspace_id": "workspace-1"
        }
        assert await merged.execute(
            "read_cluster",
            _tool_context(),
            {"cluster_id": "cluster-1"},
        ) == {
            "tool": "read_cluster",
            "ok": True,
            "result": {
                "tool": "read_cluster",
                "arguments": {"cluster_id": "cluster-1"},
            },
        }

    asyncio.run(run())


def test_mcp_registry_merge_keeps_existing_internal_tool_on_name_overlap() -> None:
    async def run() -> None:
        base_registry = AiToolRegistry()
        base_registry.tool(
            name="read_cluster",
            description="Existing internal cluster reader.",
            parameters={"cluster_id": {"type": "string", "required": True}},
        )(_base_read_cluster_handler)

        merged = ai_tool_registry_with_mcp(
            base_registry,
            _client(),
            registry=_sample_registry(),
        )

        assert merged.tool_names() == ("read_cluster",)
        assert await merged.execute(
            "read_cluster",
            _tool_context(),
            {"cluster_id": "cluster-1"},
        ) == {"cluster_id": "cluster-1", "source": "base"}

    asyncio.run(run())


def test_mcp_conversation_engine_runs_model_tool_call_loop() -> None:
    async def run() -> None:
        llm = _ScriptedLlm(
            _tool_call("read_cluster", cluster_id="cluster-1"),
            _final("cluster summary ready"),
        )
        engine = mcp_conversation_engine(
            llm,
            _client(),
            registry=_sample_registry(),
        )

        result = await engine.respond(
            system_prompt="system",
            history=[],
            user_message="summarize cluster-1",
            context=_tool_context(),
        )

        assert result.content == "cluster summary ready"
        assert result.tool_trace == [
            {
                "tool": "read_cluster",
                "arguments": {"cluster_id": "cluster-1"},
                "ok": True,
                "result": {
                    "tool": "read_cluster",
                    "ok": True,
                    "result": {
                        "tool": "read_cluster",
                        "arguments": {"cluster_id": "cluster-1"},
                    },
                },
            }
        ]
        assert len(llm.prompts) == 2
        assert "[tool:read_cluster]" in llm.prompts[1]
        assert "cluster-1" in llm.prompts[1]

    asyncio.run(run())


def test_mcp_conversation_engine_respects_write_tool_exposure_gate() -> None:
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        mcp_conversation_engine(
            _ScriptedLlm(_final("never used")),
            _client(writes_enabled=False),
            registry=_sample_registry(),
            include_write_tools=True,
        )


def test_mcp_conversation_engine_blocks_model_write_submission() -> None:
    async def run() -> None:
        llm = _ScriptedLlm(
            _tool_call("write_cluster", dry_run=False),
            _final("write was not submitted"),
        )
        engine = mcp_conversation_engine(
            llm,
            _client(writes_enabled=True),
            registry=_sample_registry(),
            include_write_tools=True,
        )

        result = await engine.respond(
            system_prompt="system",
            history=[],
            user_message="submit the write",
            context=_tool_context(),
        )

        assert result.content == "write was not submitted"
        assert result.tool_trace[0]["tool"] == "write_cluster"
        assert result.tool_trace[0]["ok"] is False
        assert "unknown arguments" in result.tool_trace[0]["error"]

    asyncio.run(run())


def test_internal_conversation_engine_registry_requires_write_enabled_for_write_tools() -> None:
    with pytest.raises(McpConfigurationError, match="OPSIA_MCP_ENABLE_WRITES=true"):
        ai_tool_registry_from_mcp(
            _sample_registry(),
            _client(writes_enabled=False),
            include_write_tools=True,
        )


def test_internal_conversation_engine_registry_can_explicitly_include_write_tools() -> None:
    ai_registry = ai_tool_registry_from_mcp(
        _sample_registry(),
        _client(writes_enabled=True),
        include_write_tools=True,
    )

    assert ai_registry.tool_names() == ("read_cluster", "write_cluster")
    write_spec = ai_registry.spec("write_cluster")
    assert write_spec.required_parameters() == ()
    assert "approval_confirmed" not in write_spec.parameters
    assert "dry_run" not in write_spec.parameters
    with pytest.raises(ValueError, match="unknown arguments"):
        asyncio.run(
            ai_registry.execute(
                "write_cluster",
                _tool_context(),
                {"dry_run": True, "approval_confirmed": True},
            )
        )
    with pytest.raises(ValueError, match="unknown arguments"):
        asyncio.run(
            ai_registry.execute(
                "write_cluster",
                _tool_context(),
                {"dry_run": False},
            )
        )
