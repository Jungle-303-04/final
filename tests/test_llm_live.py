"""실제 LLM provider 연결 검증 — opt-in 통합 테스트.

OPENAI_API_KEY(또는 LLM_API_KEY)가 환경에 있을 때만 실행된다.
CI/로컬 기본 실행에서는 skip되므로 결정성에 영향을 주지 않는다.

실행 예:
    OPENAI_API_KEY=... LLM_PROVIDER=openai pytest tests/test_llm_live.py -q
"""

from __future__ import annotations

import asyncio
import os

import pytest

from packages.ai.llm import build_llm_client, describe_llm_client

pytestmark = pytest.mark.skipif(
    not (os.environ.get("OPENAI_API_KEY") or os.environ.get("LLM_API_KEY")),
    reason="실키 없음 — OPENAI_API_KEY 설정 시에만 실행되는 라이브 테스트",
)


def _client():
    os.environ.setdefault("LLM_PROVIDER", "openai")
    return build_llm_client()


def test_live_provider_is_configured() -> None:
    client = _client()
    info = describe_llm_client(client)
    assert info.get("provider") not in (None, "", "unconfigured")


def test_live_complete_returns_text() -> None:
    client = _client()
    result = asyncio.run(client.complete("Reply with exactly: pong"))
    assert isinstance(result, str)
    assert result.strip() != ""


def test_live_complete_json_returns_schema_shape() -> None:
    """RCA fallback이 의존하는 구조화(JSON) 응답 경로 검증."""
    client = _client()
    schema = {
        "type": "object",
        "properties": {
            "root_cause": {"type": "string"},
            "confidence": {"type": "number"},
        },
        "required": ["root_cause", "confidence"],
    }
    prompt = (
        "A Kubernetes pod is in CrashLoopBackOff with exit code 137. "
        "Return JSON with keys root_cause (string) and confidence (0..1)."
    )
    result = asyncio.run(client.complete_json(prompt, schema))
    assert isinstance(result, dict)
    assert "root_cause" in result
    assert "confidence" in result
