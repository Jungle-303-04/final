"""AI 공통부 — 포트(LlmClient)·fake 어댑터·ABC 에이전트가 안전하게 동작."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from packages.ai.agent import AiAgent
from packages.ai.llm import FakeLlmClient, build_llm_client


class _EchoAgent(AiAgent):
    def build_prompt(self, evt: Any) -> str:
        return f"summarize: {evt}"

    def parse_result(self, raw: str) -> Any:
        return {"summary": raw}


def test_fake_llm_and_agent_run() -> None:
    fake = FakeLlmClient(canned_text="ok")
    result = asyncio.run(_EchoAgent(fake).run("evidence"))
    assert result == {"summary": "ok"}
    assert fake.prompts == ["summarize: evidence"]  # prompt 기록


def test_build_llm_client_is_runnable_fake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    # 미구현이어도 NotImplementedError 로 터지지 않고 Fake 가 응답.
    out = asyncio.run(build_llm_client().complete("x"))
    assert isinstance(out, str)


def test_agent_requires_hooks() -> None:
    # ABC — build_prompt/parse_result 미구현이면 인스턴스화 단계에서 막힘.
    with pytest.raises(TypeError):
        AiAgent(FakeLlmClient())  # type: ignore[abstract]
