from __future__ import annotations

import asyncio
from typing import Any

import pytest

from packages.ai.llm import LlmMessage, LlmToolCall, LlmToolDefinition, LlmTurnResponse
from packages.ai.metrics import (
    LlmInvocationMetric,
    estimate_tokens,
    estimated_cost_micros,
    metered_llm_client,
    turn_options_for_metrics,
    turn_response_for_metrics,
)


class StubLlm:
    def __init__(self, *, response: str = "done", error: Exception | None = None) -> None:
        self.response = response
        self.error = error

    async def complete(self, prompt: str, **options: Any) -> str:
        if self.error is not None:
            raise self.error
        return self.response

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        if self.error is not None:
            raise self.error
        return {"ok": True}

    def metadata(self, *, provider: str | None = None) -> dict[str, Any]:
        return {"provider": "openai", "model": "gpt-test"}


class NativeStubLlm(StubLlm):
    def supports_tool_calls(self) -> bool:
        return True

    async def complete_turn(self, **options: Any) -> LlmTurnResponse:
        if self.error is not None:
            raise self.error
        return LlmTurnResponse(
            content="",
            tool_calls=(LlmToolCall(id="call-1", name="lookup", arguments={"key": "pods"}),),
        )


class Recorder:
    def __init__(self) -> None:
        self.samples: list[LlmInvocationMetric] = []

    async def record_llm_invocation_metric(self, sample: LlmInvocationMetric) -> None:
        self.samples.append(sample)


def test_estimated_tokens_and_cost_use_configured_prices(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LLM_INPUT_COST_PER_1M_TOKENS", "0.15")
    monkeypatch.setenv("LLM_OUTPUT_COST_PER_1M_TOKENS", "0.50")

    assert estimate_tokens("abcd") == 1
    assert estimate_tokens("abcde") == 2
    assert estimated_cost_micros(10, 5) == 4


def test_metered_llm_records_successful_completion() -> None:
    async def run() -> Recorder:
        recorder = Recorder()
        client = metered_llm_client(
            StubLlm(response="hello"),
            recorder,
            workspace_id="ws-1",
            event_id="evt-1",
            correlation_id="corr-1",
            causation_id="parent-1",
        )

        assert await client.complete("say hello") == "hello"
        return recorder

    recorder = asyncio.run(run())
    sample = recorder.samples[0]
    assert sample.workspace_id == "ws-1"
    assert sample.provider == "openai"
    assert sample.model == "gpt-test"
    assert sample.operation == "complete"
    assert sample.status == "succeeded"
    assert sample.event_id == "evt-1"
    assert sample.correlation_id == "corr-1"
    assert sample.causation_id == "parent-1"
    assert sample.total_tokens == sample.prompt_tokens + sample.completion_tokens


def test_metered_llm_proxies_native_tool_turns() -> None:
    async def run() -> Recorder:
        recorder = Recorder()
        client = metered_llm_client(NativeStubLlm(), recorder, workspace_id="ws-1")

        assert client.supports_tool_calls() is True
        output = await client.complete_turn(
            system_prompt="system",
            messages=(LlmMessage(role="user", content="lookup"),),
            tools=(
                LlmToolDefinition(
                    name="lookup",
                    description="lookup",
                    input_schema={"type": "object", "properties": {}},
                ),
            ),
        )
        assert output.tool_calls[0].name == "lookup"
        return recorder

    recorder = asyncio.run(run())
    sample = recorder.samples[0]
    assert sample.operation == "complete_turn"
    assert sample.status == "succeeded"


def test_native_turn_metrics_redact_sensitive_values() -> None:
    measured_prompt = turn_options_for_metrics(
        {
            "system_prompt": "authorization: Bearer system-secret",
            "messages": (
                LlmMessage(
                    role="tool",
                    content='{"token":"message-secret","status":"ok"}',
                    tool_name="lookup",
                ),
            ),
            "tools": (
                LlmToolDefinition(
                    name="lookup",
                    description="uses password=tool-secret",
                    input_schema={"type": "object", "properties": {}},
                ),
            ),
        }
    )
    measured_response = turn_response_for_metrics(
        LlmTurnResponse(
            content="api_key=response-secret",
            tool_calls=(LlmToolCall(id="call-1", name="lookup"),),
        )
    )

    combined = f"{measured_prompt}\n{measured_response}"
    assert "system-secret" not in combined
    assert "message-secret" not in combined
    assert "tool-secret" not in combined
    assert "response-secret" not in combined
    assert "[REDACTED]" in combined


def test_metered_llm_records_failed_json_completion() -> None:
    async def run() -> Recorder:
        recorder = Recorder()
        client = metered_llm_client(
            StubLlm(error=ValueError("bad json")), recorder, workspace_id="ws-1"
        )

        with pytest.raises(ValueError, match="bad json"):
            await client.complete_json("return json", {"type": "object"})
        return recorder

    recorder = asyncio.run(run())
    sample = recorder.samples[0]
    assert sample.operation == "complete_json"
    assert sample.status == "failed"
    assert sample.error_type == "ValueError"
