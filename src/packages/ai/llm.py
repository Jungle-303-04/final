"""LLM 클라이언트 경계 — TODO 스텁(팀원 구현 대상).

모든 AI 에이전트가 같은 클라이언트/가드를 쓰도록 여기에 둔다. provider(OpenAI/Anthropic/로컬)는
어댑터로 갈아끼운다. 구조화 출력·비용/토큰 상한·재시도/타임아웃을 한 곳에서 관리.
"""

from __future__ import annotations

from typing import Any, Protocol


class LlmClient(Protocol):
    """에이전트가 의존하는 추상 LLM 클라이언트(어댑터로 구현)."""

    async def complete(self, prompt: str, **options: Any) -> str: ...

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any: ...


def build_llm_client() -> LlmClient:
    """[TODO] 환경설정(provider·model·api_key)으로 LlmClient 구성.

    구현:
      - provider 어댑터 선택(OpenAI/Anthropic/로컬), 키는 secret 주입.
      - 공통 가드: 타임아웃·재시도(지수 백오프)·토큰/비용 상한·구조화 출력 검증·PII 마스킹.
    """
    raise NotImplementedError("TODO: LLM 클라이언트 구성")
