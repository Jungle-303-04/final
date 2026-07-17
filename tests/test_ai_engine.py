"""ConversationEngine 검증 — 도구 호출 루프/오류 회신/루프 상한/JSON 폴백."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from packages.ai.engine import MAX_TOOL_CALLS_LIMIT, ConversationEngine, EngineResult
from packages.ai.tools import ToolContext, ToolRegistry
from packages.security.log_lines import MAX_LOG_LINE_LENGTH, TRUNCATED_LOG_LINE_SUFFIX


class ScriptedLlm:
    """응답 대본을 순서대로 재생하는 테스트용 LLM(대본 초과 시 마지막 응답 반복)."""

    def __init__(self, *replies: str) -> None:
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        self.prompts.append(prompt)
        index = min(len(self.prompts) - 1, len(self.replies) - 1)
        return self.replies[index]


def make_registry() -> ToolRegistry:
    registry = ToolRegistry()

    @registry.tool(
        name="lookup",
        description="워크스페이스 값 조회",
        parameters={"key": {"type": "string", "description": "조회 키", "required": True}},
    )
    async def lookup(context: ToolContext, key: str) -> dict:
        return {"key": key, "value": f"{context.workspace_id}:{key}-value"}

    return registry


def make_context() -> ToolContext:
    return ToolContext(
        db=None,
        workspace_id="ws-1",
        user_id="user-1",
        cluster_id=None,
        locale="ko",
    )


def respond(engine: ConversationEngine, message: str = "질문") -> EngineResult:
    return asyncio.run(
        engine.respond(
            system_prompt="system",
            history=[{"role": "user", "content": "이전 질문"}],
            user_message=message,
            context=make_context(),
        )
    )


def final(content: str) -> str:
    return json.dumps({"type": "final", "content": content}, ensure_ascii=False)


def tool_call(tool: str, **arguments: Any) -> str:
    return json.dumps({"type": "tool_call", "tool": tool, "arguments": arguments})


def test_no_tool_final_answer() -> None:
    llm = ScriptedLlm(final("바로 답변"))
    engine = ConversationEngine(llm, make_registry())

    result = respond(engine)

    assert result.content == "바로 답변"
    assert result.tool_trace == []
    assert result.raw_length == len(llm.replies[0])
    # 시스템 프롬프트에 도구 안내 섹션과 히스토리가 포함됨
    assert "lookup" in llm.prompts[0]
    assert "[user] 이전 질문" in llm.prompts[0]


def test_single_tool_call_loop_feeds_result_back() -> None:
    llm = ScriptedLlm(tool_call("lookup", key="pods"), final("파드 답변"))
    engine = ConversationEngine(llm, make_registry())

    result = respond(engine)

    assert result.content == "파드 답변"
    assert result.tool_trace == [
        {
            "tool": "lookup",
            "arguments": {"key": "pods"},
            "ok": True,
            "result": {"key": "pods", "value": "ws-1:pods-value"},
        }
    ]
    # 2번째 호출 프롬프트에 도구 실행 결과가 transcript 로 회신됨
    assert "[tool:lookup]" in llm.prompts[1]
    assert "ws-1:pods-value" in llm.prompts[1]


def test_unknown_tool_error_is_fed_back_to_llm() -> None:
    llm = ScriptedLlm(tool_call("nope"), final("복구된 답변"))
    engine = ConversationEngine(llm, make_registry())

    result = respond(engine)

    assert result.content == "복구된 답변"
    assert result.tool_trace[0]["ok"] is False
    assert "unknown ai tool: nope" in result.tool_trace[0]["error"]
    assert "unknown ai tool: nope" in llm.prompts[1]


def test_tool_trace_and_transcript_redact_sensitive_values() -> None:
    registry = ToolRegistry()

    @registry.tool(
        name="leaky",
        description="returns sensitive-looking values",
        parameters={"token": {"type": "string", "description": "secret token", "required": True}},
    )
    async def leaky(_context: ToolContext, token: str) -> dict:
        return {
            "password": "result-password",
            "note": f"authorization: Bearer response-secret token={token}",
            "contacts": ["admin@example.com"],
        }

    llm = ScriptedLlm(tool_call("leaky", token="input-secret"), final("redacted answer"))
    engine = ConversationEngine(llm, registry)

    result = respond(engine)

    serialized_trace = json.dumps(result.tool_trace, ensure_ascii=False)
    second_prompt = llm.prompts[1]
    for leaked in (
        "input-secret",
        "result-password",
        "response-secret",
        "admin@example.com",
    ):
        assert leaked not in serialized_trace
        assert leaked not in second_prompt
    assert result.tool_trace[0]["arguments"]["token"] == "[REDACTED]"
    assert result.tool_trace[0]["result"]["password"] == "[REDACTED]"
    assert "[REDACTED]" in second_prompt


def test_non_object_tool_arguments_are_rejected_before_execution() -> None:
    registry = ToolRegistry()
    calls = 0

    @registry.tool(name="zero_arg", description="no-op", parameters={})
    async def zero_arg(_context: ToolContext) -> dict:
        nonlocal calls
        calls += 1
        return {"called": True}

    llm = ScriptedLlm(
        json.dumps({"type": "tool_call", "tool": "zero_arg", "arguments": ["bad"]}),
        final("handled"),
    )
    engine = ConversationEngine(llm, registry)

    result = respond(engine)

    assert calls == 0
    assert result.content == "handled"
    assert result.tool_trace[0]["ok"] is False
    assert result.tool_trace[0]["error"] == "tool arguments must be an object"
    assert "tool arguments must be an object" in llm.prompts[1]


def test_tool_trace_and_transcript_truncate_large_values() -> None:
    registry = ToolRegistry()
    large_value = "x" * (MAX_LOG_LINE_LENGTH + 100)

    @registry.tool(name="large", description="large result", parameters={})
    async def large(_context: ToolContext) -> dict:
        return {"message": large_value}

    llm = ScriptedLlm(tool_call("large"), final("bounded"))
    engine = ConversationEngine(llm, registry)

    result = respond(engine)

    message = result.tool_trace[0]["result"]["message"]
    assert len(message) == MAX_LOG_LINE_LENGTH
    assert message.endswith(TRUNCATED_LOG_LINE_SUFFIX)
    assert large_value not in llm.prompts[1]


def test_max_tool_call_cutoff_forces_final_answer() -> None:
    # 대본이 끝까지 tool_call 만 반복 — 상한(2) 이후 강제 최종 답변 요구
    llm = ScriptedLlm(tool_call("lookup", key="a"))
    engine = ConversationEngine(llm, make_registry(), max_tool_calls=2)

    result = respond(engine)

    assert len(result.tool_trace) == 2
    assert len(llm.prompts) == 3  # 도구 2회 + 강제 최종 1회
    assert "Tool call budget exhausted" in llm.prompts[2]
    # 강제 최종 호출에서도 tool_call 을 고집하면 원문을 답변으로 폴백
    assert result.content == tool_call("lookup", key="a")


def test_max_tool_calls_is_bounded() -> None:
    for invalid in (0, MAX_TOOL_CALLS_LIMIT + 1, True, 1.5):
        with pytest.raises(ValueError, match="max_tool_calls"):
            ConversationEngine(  # type: ignore[arg-type]
                ScriptedLlm(final("unused")),
                make_registry(),
                max_tool_calls=invalid,
            )


def test_malformed_json_is_treated_as_final_content() -> None:
    llm = ScriptedLlm("그냥 평문 답변 {깨진 json")
    engine = ConversationEngine(llm, make_registry())

    result = respond(engine)

    assert result.content == "그냥 평문 답변 {깨진 json"
    assert result.tool_trace == []


def test_llm_timeout_is_deadline_aware() -> None:
    class SlowLlm:
        async def complete(self, prompt: str, **options: Any) -> str:
            await asyncio.sleep(0.2)
            return final("늦은 답변")

    engine = ConversationEngine(SlowLlm(), make_registry())

    async def go() -> None:
        await engine.respond(
            system_prompt="system",
            history=[],
            user_message="질문",
            context=make_context(),
            llm_timeout_seconds=0.01,
        )

    with pytest.raises(TimeoutError):
        asyncio.run(go())
