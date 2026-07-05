"""AI 에이전트 베이스(ABC) — 포트(LlmClient) 위에서 동작.

새 에이전트(services/ai/<agent>)는 AiAgent 를 상속해 build_prompt/parse_result 만 구현함.
ABC 라 두 훅을 구현하지 않으면 인스턴스화 단계에서 막힘(런타임 깊은 곳에서 터지지 않음).
run() 골격(이벤트→프롬프트→LLM→결과)은 공통 제공.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from packages.ai.llm import LlmClient


class AiAgent(ABC):
    def __init__(self, llm: LlmClient) -> None:
        self.llm = llm

    @abstractmethod
    def build_prompt(self, evt: Any, **context: Any) -> str:
        """이벤트(+선택 컨텍스트: history/locale 등) → LLM 프롬프트(에이전트별 구현)."""

    @abstractmethod
    def parse_result(self, raw: str) -> Any:
        """LLM 출력 → 결과 이벤트 바디(에이전트별 구현)."""

    async def run(self, evt: Any, **context: Any) -> Any:
        raw = await self.llm.complete(self.build_prompt(evt, **context))
        return self.parse_result(raw)
