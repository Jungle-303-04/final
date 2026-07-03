"""LLM port and adapters.

All AI agents depend on the `LlmClient` port. Local and CI default to a
deterministic fake client; deployed environments can opt into an
OpenAI-compatible HTTP chat-completions adapter with environment variables.
"""

from __future__ import annotations

import json
from typing import Any, Protocol

import httpx

from packages.config.settings import env

LLM_PROVIDER_ENV = "LLM_PROVIDER"
LLM_BASE_URL_ENV = "LLM_BASE_URL"
LLM_API_KEY_ENV = "LLM_API_KEY"
LLM_MODEL_ENV = "LLM_MODEL"
LLM_TIMEOUT_SECONDS_ENV = "LLM_TIMEOUT_SECONDS"
DEFAULT_LLM_PROVIDER = "fake"
DEFAULT_LLM_BASE_URL = "https://api.openai.com/v1"
DEFAULT_LLM_MODEL = "gpt-4o-mini"
DEFAULT_LLM_TIMEOUT_SECONDS = "30"


class LlmClient(Protocol):
    """Abstract LLM port used by agents."""

    async def complete(self, prompt: str, **options: Any) -> str: ...

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any: ...


class FakeLlmClient:
    """Deterministic fake adapter for local development and tests."""

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


class OpenAiCompatibleLlmClient:
    """HTTP adapter for OpenAI-compatible chat-completions APIs."""

    def __init__(
        self,
        *,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float,
    ) -> None:
        if not api_key:
            raise ValueError(f"{LLM_API_KEY_ENV} is required for HTTP LLM provider")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    async def complete(self, prompt: str, **options: Any) -> str:
        data = await self._chat_completion(
            prompt,
            response_format=options.pop("response_format", None),
            **options,
        )
        choices = data.get("choices") or []
        if not choices:
            raise ValueError("LLM response did not include choices")
        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str):
            raise ValueError("LLM response message content is missing")
        return content

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        json_prompt = (
            f"{prompt}\n\n"
            "Return only JSON that matches this JSON Schema:\n"
            f"{json.dumps(schema, ensure_ascii=False, sort_keys=True)}"
        )
        raw = await self.complete(
            json_prompt,
            response_format={"type": "json_object"},
            **options,
        )
        return json.loads(raw)

    async def _chat_completion(
        self,
        prompt: str,
        *,
        response_format: dict[str, Any] | None = None,
        **options: Any,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": options.pop("model", self.model),
            "messages": [{"role": "user", "content": prompt}],
            "temperature": options.pop("temperature", 0.2),
        }
        if response_format is not None:
            payload["response_format"] = response_format
        payload.update(options)
        headers = {
            "authorization": f"Bearer {self.api_key}",
            "content-type": "application/json",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.post(
                f"{self.base_url}/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()


def build_llm_client() -> LlmClient:
    provider = env(LLM_PROVIDER_ENV, DEFAULT_LLM_PROVIDER).strip().lower()
    if provider in ("", "fake"):
        return FakeLlmClient()
    if provider in ("http", "openai", "openai-compatible"):
        return OpenAiCompatibleLlmClient(
            base_url=env(LLM_BASE_URL_ENV, DEFAULT_LLM_BASE_URL),
            api_key=env(LLM_API_KEY_ENV, ""),
            model=env(LLM_MODEL_ENV, DEFAULT_LLM_MODEL),
            timeout_seconds=float(env(LLM_TIMEOUT_SECONDS_ENV, DEFAULT_LLM_TIMEOUT_SECONDS)),
        )
    raise ValueError(f"unsupported LLM provider: {provider}")
