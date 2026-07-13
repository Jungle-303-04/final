"""@ai.tool 레지스트리 검증 — 등록/중복 차단/멱등 재선언/인자 검증/실행."""

from __future__ import annotations

import asyncio

import pytest

from packages.ai.tools import ToolContext, ToolRegistry


def make_registry() -> ToolRegistry:
    registry = ToolRegistry()

    @registry.tool(
        name="echo",
        description="입력을 그대로 돌려줌",
        parameters={
            "value": {"type": "string", "description": "돌려줄 값", "required": True},
            "upper": {"type": "boolean", "description": "대문자 여부"},
        },
    )
    async def echo(context: ToolContext, value: str, upper: bool = False) -> dict:
        return {"value": value.upper() if upper else value, "workspace": context.workspace_id}

    return registry


def make_context() -> ToolContext:
    return ToolContext(
        db=None,
        workspace_id="ws-1",
        user_id="user-1",
        cluster_id="c-1",
        locale="ko",
    )


def test_tool_decorator_registers_spec_and_reader() -> None:
    registry = make_registry()

    assert registry.tool_names() == ("echo",)
    spec = registry.spec("echo")
    assert spec.description == "입력을 그대로 돌려줌"
    assert spec.required_parameters() == ("value",)
    assert "echo" in registry.describe()


def test_duplicate_tool_name_fails_fast_but_identical_redeclaration_is_idempotent() -> None:
    registry = make_registry()
    spec = registry.spec("echo")

    # 동일 계약 재선언(모듈 재로딩 시나리오)은 멱등
    registry.tool(
        name="echo",
        description=spec.description,
        parameters=spec.parameters,
    )(spec.handler)
    assert registry.tool_names() == ("echo",)

    # 다른 계약으로 같은 이름 등록은 즉시 예외
    with pytest.raises(ValueError, match="duplicate ai tool: echo"):

        @registry.tool(name="echo", description="다른 설명")
        async def other(context: ToolContext) -> dict:
            return {}


def test_execute_validates_arguments_and_calls_handler() -> None:
    registry = make_registry()

    result = asyncio.run(registry.execute("echo", make_context(), {"value": "hi", "upper": True}))
    assert result == {"value": "HI", "workspace": "ws-1"}

    with pytest.raises(ValueError, match="unknown arguments"):
        asyncio.run(registry.execute("echo", make_context(), {"value": "hi", "nope": 1}))

    with pytest.raises(ValueError, match="missing required arguments"):
        asyncio.run(registry.execute("echo", make_context(), {}))


def test_unknown_tool_lookup_fails_with_supported_list() -> None:
    registry = make_registry()

    with pytest.raises(ValueError, match="unknown ai tool: nope; registered: echo"):
        registry.spec("nope")


def test_global_registry_and_reader_exist() -> None:
    from packages.ai.tools import ai, registered_ai_tools

    assert isinstance(ai, ToolRegistry)
    assert registered_ai_tools() == ai.tools()
