from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from services.mcp.internal_control.ai_runtime import (
    AiRuntimeMcpExecutor,
    anthropic_tools,
    format_runtime_tools,
    gemini_function_declarations,
    openai_tools,
    tools_from_mcp_registry,
)
from services.mcp.internal_control.api_client import ManagementApiClient
from services.mcp.internal_control.config import McpSettings
from services.mcp.internal_control.tools import (
    WRITE_TOOL_ANNOTATIONS,
    McpTool,
    ToolInputError,
    ToolRegistry,
    default_tool_registry,
)


async def _read_handler(_client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    return {"tool": "read_cluster", "arguments": arguments}


async def _write_handler(_client: ManagementApiClient, arguments: dict[str, Any]) -> dict[str, Any]:
    return {"tool": "write_cluster", "arguments": arguments}


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
                        }
                    },
                    "required": [],
                    "additionalProperties": False,
                },
                handler=_write_handler,
                annotations=WRITE_TOOL_ANNOTATIONS,
            ),
        ]
    )


def _client() -> ManagementApiClient:
    return ManagementApiClient(
        McpSettings(api_base_url="https://opsia.test", bearer_token="token-1").validate(),
        http_client=httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200))),
    )


def test_runtime_tools_default_to_read_only_default_registry_tools() -> None:
    registry = default_tool_registry()
    raw_tools = registry.list_tools()
    expected_names = tuple(
        sorted(
            tool["name"]
            for tool in raw_tools
            if tool["annotations"]["readOnlyHint"] is True
        )
    )

    runtime_tools = tools_from_mcp_registry(registry)

    assert tuple(tool.name for tool in runtime_tools) == expected_names
    assert all(tool.read_only is True for tool in runtime_tools)
    assert all(tool.approval_required is False for tool in runtime_tools)
    assert "create_alert_rule" not in {tool.name for tool in runtime_tools}


def test_runtime_tools_can_explicitly_include_write_tools_with_safety_metadata() -> None:
    runtime_tools = tools_from_mcp_registry(_sample_registry(), include_write_tools=True)
    by_name = {tool.name: tool for tool in runtime_tools}

    assert tuple(by_name) == ("read_cluster", "write_cluster")
    assert by_name["read_cluster"].read_only is True
    assert by_name["write_cluster"].read_only is False
    assert by_name["write_cluster"].destructive is True
    assert by_name["write_cluster"].approval_required is True
    assert "operator approval" in by_name["write_cluster"].description


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


def test_neutral_formatter_includes_safety_contract() -> None:
    tools = tools_from_mcp_registry(_sample_registry(), include_write_tools=True)
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


def test_runtime_executor_can_expose_write_tools_only_when_explicitly_allowed() -> None:
    async def run() -> None:
        executor = AiRuntimeMcpExecutor(
            _sample_registry(),
            _client(),
            allow_write_tools=True,
        )

        result = await executor.call("write_cluster", {"dry_run": True})

        assert result["tool"] == "write_cluster"
        assert result["ok"] is True
        assert result["result"]["arguments"] == {"dry_run": True}

    asyncio.run(run())
