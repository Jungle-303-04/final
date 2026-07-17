from __future__ import annotations

from collections.abc import Iterable
from copy import deepcopy
from dataclasses import dataclass
from typing import Any, Literal

from packages.security.log_lines import redact_log_line
from services.mcp.internal_control.api_client import ManagementApiClient, ManagementApiError
from services.mcp.internal_control.tools import ToolInputError, ToolRegistry, default_tool_registry

AiRuntimeToolFormat = Literal["neutral", "openai", "anthropic", "gemini"]

READ_ONLY_HINT = "readOnlyHint"
DESTRUCTIVE_HINT = "destructiveHint"
IDEMPOTENT_HINT = "idempotentHint"


@dataclass(frozen=True, slots=True)
class AiRuntimeTool:
    """Provider-neutral tool metadata that can be projected into model tool formats."""

    name: str
    description: str
    input_schema: dict[str, Any]
    read_only: bool
    destructive: bool
    idempotent: bool
    approval_required: bool

    def as_neutral_tool(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": deepcopy(self.input_schema),
            "safety": {
                "read_only": self.read_only,
                "destructive": self.destructive,
                "idempotent": self.idempotent,
                "approval_required": self.approval_required,
            },
        }

    def as_openai_tool(self) -> dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": deepcopy(self.input_schema),
            },
        }

    def as_anthropic_tool(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": deepcopy(self.input_schema),
        }

    def as_gemini_function_declaration(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": _gemini_schema(self.input_schema),
        }


class AiRuntimeMcpExecutor:
    """Execute runtime tool calls through the MCP registry and existing Gateway APIs."""

    def __init__(
        self,
        registry: ToolRegistry,
        client: ManagementApiClient,
        *,
        allow_write_tools: bool = False,
    ) -> None:
        self.registry = registry
        self.client = client
        self.allow_write_tools = allow_write_tools
        self._tool_by_name = {
            tool.name: tool
            for tool in tools_from_mcp_registry(
                registry,
                include_write_tools=allow_write_tools,
            )
        }

    async def call(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name not in self._tool_by_name:
            raise ToolInputError(f"tool is not exposed to the AI runtime: {name}")
        try:
            result = await self.registry.call(name, arguments, self.client)
        except ToolInputError:
            raise
        except ManagementApiError:
            raise
        except Exception as exc:
            raise ToolInputError(redact_log_line(str(exc))) from exc
        return {
            "tool": name,
            "ok": True,
            "result": result,
        }


def tools_from_mcp_registry(
    registry: ToolRegistry | None = None,
    *,
    include_write_tools: bool = False,
) -> tuple[AiRuntimeTool, ...]:
    selected_registry = registry or default_tool_registry()
    runtime_tools: list[AiRuntimeTool] = []
    for protocol_tool in selected_registry.list_tools():
        runtime_tool = _runtime_tool(protocol_tool)
        if not include_write_tools and not runtime_tool.read_only:
            continue
        runtime_tools.append(runtime_tool)
    return tuple(runtime_tools)


def format_runtime_tools(
    tools: Iterable[AiRuntimeTool],
    *,
    format: AiRuntimeToolFormat = "neutral",
) -> list[dict[str, Any]]:
    if format == "neutral":
        return [tool.as_neutral_tool() for tool in tools]
    if format == "openai":
        return [tool.as_openai_tool() for tool in tools]
    if format == "anthropic":
        return [tool.as_anthropic_tool() for tool in tools]
    if format == "gemini":
        return [tool.as_gemini_function_declaration() for tool in tools]
    raise ValueError(f"unsupported AI runtime tool format: {format}")


def openai_tools(
    registry: ToolRegistry | None = None,
    *,
    include_write_tools: bool = False,
) -> list[dict[str, Any]]:
    return format_runtime_tools(
        tools_from_mcp_registry(registry, include_write_tools=include_write_tools),
        format="openai",
    )


def anthropic_tools(
    registry: ToolRegistry | None = None,
    *,
    include_write_tools: bool = False,
) -> list[dict[str, Any]]:
    return format_runtime_tools(
        tools_from_mcp_registry(registry, include_write_tools=include_write_tools),
        format="anthropic",
    )


def gemini_function_declarations(
    registry: ToolRegistry | None = None,
    *,
    include_write_tools: bool = False,
) -> list[dict[str, Any]]:
    return format_runtime_tools(
        tools_from_mcp_registry(registry, include_write_tools=include_write_tools),
        format="gemini",
    )


def _runtime_tool(protocol_tool: dict[str, Any]) -> AiRuntimeTool:
    annotations = protocol_tool.get("annotations") or {}
    read_only = bool(annotations.get(READ_ONLY_HINT) is True)
    destructive = bool(annotations.get(DESTRUCTIVE_HINT) is True)
    idempotent = bool(annotations.get(IDEMPOTENT_HINT) is True)
    return AiRuntimeTool(
        name=str(protocol_tool["name"]),
        description=_runtime_description(
            str(protocol_tool.get("description", "")),
            read_only=read_only,
        ),
        input_schema=deepcopy(protocol_tool["inputSchema"]),
        read_only=read_only,
        destructive=destructive,
        idempotent=idempotent,
        approval_required=not read_only,
    )


def _runtime_description(description: str, *, read_only: bool) -> str:
    if read_only:
        return f"{description} Safety: read-only Gateway API call."
    return (
        f"{description} Safety: write-capable Gateway API call; expose only after explicit "
        "operator approval. The tool still requires dry-run/proposal confirmation and Gateway RBAC."
    )


def _gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    converted: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "type" and isinstance(value, str):
            converted[key] = value.upper()
        elif key == "properties" and isinstance(value, dict):
            converted[key] = {
                str(name): _gemini_schema(child)
                for name, child in value.items()
                if isinstance(child, dict)
            }
        elif key == "items" and isinstance(value, dict):
            converted[key] = _gemini_schema(value)
        elif key in {
            "description",
            "enum",
            "format",
            "maximum",
            "maxItems",
            "maxLength",
            "minimum",
            "minItems",
            "minLength",
            "required",
        }:
            converted[key] = deepcopy(value)
    return converted


__all__ = [
    "AiRuntimeMcpExecutor",
    "AiRuntimeTool",
    "AiRuntimeToolFormat",
    "anthropic_tools",
    "format_runtime_tools",
    "gemini_function_declarations",
    "openai_tools",
    "tools_from_mcp_registry",
]
