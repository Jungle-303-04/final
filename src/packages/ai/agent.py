"""AI 에이전트 베이스 — TODO 스텁(팀원 구현 대상).

새 AI 에이전트(services/ai/<agent>)가 공통으로 쓰는 골격. 이벤트 입력 → 프롬프트 구성 →
LLM 호출(guard 포함) → 구조화 결과 → 결과 이벤트 발행. 각 에이전트는 prompt/파싱만 다르게.
"""

from __future__ import annotations

from typing import Any

from packages.ai.llm import LlmClient


class AiAgent:
    """[TODO] 이벤트 구동 AI 에이전트 베이스.

    구현:
      - run(evt): build_prompt(evt) → llm.complete_json(...) → to_result_event(...).
      - 가드: 입력 evidence 정규화, 출력 스키마 검증, 실패 시 DLQ/재시도 위임.
      - 비용/지연 메트릭 기록.
    """

    def __init__(self, llm: LlmClient) -> None:
        self.llm = llm

    def build_prompt(self, evt: Any) -> str:
        raise NotImplementedError("TODO: 에이전트별 프롬프트 구성")

    def to_result(self, raw: Any) -> Any:
        raise NotImplementedError("TODO: LLM 출력 → 결과 이벤트 바디")
