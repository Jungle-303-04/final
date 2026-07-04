"""AI 공통부 — 포트(LlmClient)·게이트웨이·ABC 에이전트가 안전하게 동작."""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from packages.ai.agent import AiAgent
from packages.ai.llm import LlmGateway, build_llm_client


class _CannedLlm:
    """테스트 전용 대본 LLM — 프롬프트를 기록하고 고정 문자열을 돌려줌."""

    def __init__(self, canned_text: str = "ok") -> None:
        self.canned_text = canned_text
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        self.prompts.append(prompt)
        return self.canned_text

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        self.prompts.append(prompt)
        return {key: None for key in schema.get("properties", {})}


class _EchoAgent(AiAgent):
    def build_prompt(self, evt: Any) -> str:
        return f"summarize: {evt}"

    def parse_result(self, raw: str) -> Any:
        return {"summary": raw}


def test_llm_port_and_agent_run() -> None:
    canned = _CannedLlm(canned_text="ok")
    result = asyncio.run(_EchoAgent(canned).run("evidence"))
    assert result == {"summary": "ok"}
    assert canned.prompts == ["summarize: evidence"]  # prompt 기록


def test_build_llm_client_boots_without_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    # 자격 증명 없이도 게이트웨이 생성(부팅)은 성공해야 함 —
    # API 키 부재는 요청 시점 ValueError 로 워커 실패 이벤트 경로에 수렴함.
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    for name in ("LLM_API_KEY", "OPENAI_API_KEY"):
        monkeypatch.delenv(name, raising=False)

    client = build_llm_client()
    assert isinstance(client, LlmGateway)
    assert client.default_provider == "openai"
    with pytest.raises(ValueError, match="API_KEY"):
        asyncio.run(client.complete("x"))


def test_agent_requires_hooks() -> None:
    # ABC — build_prompt/parse_result 미구현이면 인스턴스화 단계에서 막힘.
    with pytest.raises(TypeError):
        AiAgent(_CannedLlm())  # type: ignore[abstract]
