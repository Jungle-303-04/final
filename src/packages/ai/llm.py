"""LLM 포트(Protocol) + fake 어댑터.

모든 AI 에이전트가 `LlmClient` 포트에 의존한다. 실제 provider 어댑터는 팀원이 구현하고,
개발/테스트는 `FakeLlmClient`(결정적, 네트워크 無)를 쓴다. NotImplementedError 지뢰 없음 —
실수로 연결돼도 런타임이 터지지 않는다(기본이 Fake).
"""

from __future__ import annotations

from typing import Any, Protocol


class LlmClient(Protocol):
    """에이전트가 의존하는 추상 LLM 포트. provider 어댑터로 구현한다."""

    async def complete(self, prompt: str, **options: Any) -> str: ...

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any: ...


class FakeLlmClient:
    """결정적 fake 어댑터 — 개발/테스트용. 호출 prompt 를 기록하고 정해진 값을 돌려준다."""

    def __init__(self, canned_text: str = "fake-llm-response") -> None:
        self.canned_text = canned_text
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        self.prompts.append(prompt)
        return self.canned_text

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        self.prompts.append(prompt)
        # 스키마 키를 None 으로 채운 골격(실제 추론 대신 형태만 보장).
        return {key: None for key in schema.get("properties", {})}


def build_llm_client() -> LlmClient:
    """기본 LLM 클라이언트.

    TODO(ai): 환경설정(provider·model·api_key)으로 실제 어댑터(OpenAI/Anthropic/로컬) 반환 +
    공통 가드(타임아웃·재시도·토큰/비용 상한·구조화 출력 검증·PII 마스킹) 적용.
    현재는 안전한 Fake 반환 — 미구현이어도 런타임이 터지지 않는다.
    """
    return FakeLlmClient()
