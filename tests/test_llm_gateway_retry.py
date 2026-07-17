"""LlmGateway 재시도/JSON 견고성 회귀 테스트."""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from packages.ai.llm import (
    LlmGateway,
    LlmProviderSettings,
    _retry_after_seconds,
    _strip_json_fences,
)


def _settings(max_retries: int = 2) -> LlmProviderSettings:
    return LlmProviderSettings(
        provider="openai",
        base_url="http://llm.test",
        api_key="test-key",
        api_key_env=None,
        model="test-model",
        timeout_seconds=1.0,
        max_retries=max_retries,
        default_max_tokens=64,
    )


class _ScriptedAdapter:
    """호출마다 미리 정한 결과(예외 또는 문자열)를 돌려주는 테스트용 adapter."""

    def __init__(self, results: list[Any]) -> None:
        self.results = results
        self.calls = 0

    async def complete(self, request: Any) -> str:
        result = self.results[min(self.calls, len(self.results) - 1)]
        self.calls += 1
        if isinstance(result, Exception):
            raise result
        return str(result)


def _gateway(adapter: _ScriptedAdapter, max_retries: int = 2) -> LlmGateway:
    return LlmGateway(
        default_provider="openai",
        settings_loader=lambda provider: _settings(max_retries),
        adapters={"openai": adapter},
    )


def _http_status_error(status_code: int, headers: dict[str, str] | None = None) -> Exception:
    request = httpx.Request("POST", "http://llm.test/chat/completions")
    response = httpx.Response(status_code, request=request, headers=headers or {})
    return httpx.HTTPStatusError("failed", request=request, response=response)


def test_retries_connect_error_then_succeeds() -> None:
    adapter = _ScriptedAdapter([httpx.ConnectError("dns failure"), "ok"])
    result = asyncio.run(_gateway(adapter).complete("prompt"))
    assert result == "ok"
    assert adapter.calls == 2


def test_retries_429_and_gives_up_after_max_retries() -> None:
    adapter = _ScriptedAdapter([_http_status_error(429)] * 5)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(_gateway(adapter, max_retries=1).complete("prompt"))
    assert adapter.calls == 2  # 최초 1회 + 재시도 1회


def test_does_not_retry_client_error() -> None:
    adapter = _ScriptedAdapter([_http_status_error(400)])
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(_gateway(adapter).complete("prompt"))
    assert adapter.calls == 1


def test_complete_json_strips_code_fences() -> None:
    adapter = _ScriptedAdapter(['```json\n{"answer": 42}\n```'])
    result = asyncio.run(_gateway(adapter).complete_json("prompt", schema={"type": "object"}))
    assert result == {"answer": 42}


def test_complete_json_retries_invalid_json_once() -> None:
    adapter = _ScriptedAdapter(["not-json", '{"ok": true}'])
    result = asyncio.run(_gateway(adapter).complete_json("prompt", schema={"type": "object"}))
    assert result == {"ok": True}
    assert adapter.calls == 2


def test_complete_json_raises_after_repeated_invalid_json() -> None:
    adapter = _ScriptedAdapter(["not-json", "still-not-json"])
    with pytest.raises(ValueError, match="valid JSON"):
        asyncio.run(_gateway(adapter).complete_json("prompt", schema={"type": "object"}))


def test_completion_only_adapter_falls_back_for_turn_completion() -> None:
    adapter = _ScriptedAdapter(["fallback ok"])
    gateway = _gateway(adapter)

    assert gateway.supports_tool_calls() is False
    result = asyncio.run(
        gateway.complete_turn(
            system_prompt="system",
            messages=(),
            tools=(),
        )
    )

    assert result.content == "fallback ok"
    assert result.tool_calls == ()
    assert adapter.calls == 1


def test_retry_after_header_parsing() -> None:
    request = httpx.Request("POST", "http://llm.test")

    def response(headers: dict[str, str]) -> httpx.Response:
        return httpx.Response(429, request=request, headers=headers)

    assert _retry_after_seconds(response({"retry-after": "3"})) == 3.0
    assert _retry_after_seconds(response({"retry-after": "9999"})) == 30.0  # 상한 캡
    assert _retry_after_seconds(response({"retry-after": "0"})) is None
    assert _retry_after_seconds(response({"retry-after": "soon"})) is None
    assert _retry_after_seconds(response({})) is None


def test_strip_json_fences_passthrough() -> None:
    assert _strip_json_fences('{"a": 1}') == '{"a": 1}'
    assert _strip_json_fences("```json\n{}\n```") == "{}"
    assert _strip_json_fences("```\n[]\n```") == "[]"
