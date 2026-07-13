from __future__ import annotations

import asyncio
from typing import Any

import pytest

from packages.ai.metrics import (
    LlmInvocationMetric,
    estimate_tokens,
    estimated_cost_micros,
    metered_llm_client,
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
