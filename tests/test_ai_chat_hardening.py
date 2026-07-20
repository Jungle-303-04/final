"""AI 채팅 경로 보강 검증 — i18n 카탈로그, 히스토리 주입, 실패 경로, 플레이북 등록."""

from __future__ import annotations

from pathlib import Path

import pytest

from domains.ai.agent import build_system_prompt
from domains.ai.messages import DEFAULT_LOCALE, registered_message_keys, text
from packages.ai.engine import ConversationEngine
from packages.ai.tools import ToolContext, ToolRegistry

ROOT_DIR = Path(__file__).resolve().parents[1]


class _EchoLlm:
    async def complete(self, prompt: str) -> str:
        self.last_prompt = prompt
        return "ok"


def test_message_catalog_locales_and_fallback() -> None:
    assert text("chat.empty_response") == "No response generated."
    assert text("chat.empty_response", "ko") == "생성된 응답이 없습니다."
    # 미등록 로케일은 기본 로케일 폴백
    assert text("chat.empty_response", "fr") == text("chat.empty_response", DEFAULT_LOCALE)
    assert "진단을 생성하지 못했습니다" in text("chat.failure.rate_limited.fallback", "ko")
    assert "rate-limited" in text("chat.failure.rate_limited.fallback", "en")

    with pytest.raises(KeyError, match="unknown message key"):
        text("chat.nonexistent")


def test_every_message_key_has_default_locale() -> None:
    for key in registered_message_keys():
        assert text(key, DEFAULT_LOCALE)


def test_prompt_includes_history_and_locale() -> None:
    import asyncio

    llm = _EchoLlm()
    engine = ConversationEngine(llm, ToolRegistry())

    class Evt:
        agent = "ops"
        conversation_id = "c1"
        workspace_id = "w1"
        context = {"locale": "ko"}

    history = [
        {"role": "user", "content": "first question"},
        {"role": "assistant", "content": "first answer"},
    ]
    asyncio.run(
        engine.respond(
            system_prompt=build_system_prompt(Evt(), "ko"),
            history=history,
            user_message="왜 파드가 재시작되나요?",
            context=ToolContext(db=None, workspace_id="w1", user_id="u1"),
        )
    )

    prompt = llm.last_prompt
    assert text("chat.system_prompt", "ko").splitlines()[0] in prompt
    assert "[user] first question" in prompt
    assert "[assistant] first answer" in prompt
    assert "왜 파드가 재시작되나요?" in prompt


def test_playbook_builtin_rules_are_discovered() -> None:
    """playbooks 자동 발견으로 내장 원인/복구 룰이 실제 등록되는지 확인(죽은 파일 방지)."""
    from services.ai.agent.playbooks.recovery import registered_recovery_rules
    from services.ai.agent.recovery import catalog  # noqa: F401  # load_rule_modules 유발

    rules = registered_recovery_rules()
    assert len(rules) >= 3
    rule_types = {type(rule).__name__ for rule in rules}
    # 폴백(AlwaysAvailable) 룰이 반드시 포함 — 매칭 실패 시 안전망 보장
    assert "AlwaysAvailableRecoveryRule" in rule_types


def test_unit_of_work_joins_active_transaction(monkeypatch) -> None:
    """중첩 unit_of_work 가 새 트랜잭션을 열지 않고 합류하는지(원자성 A1)."""
    from packages.storage import engine as engine_module

    class _Conn:
        pass

    sentinel = _Conn()
    token = engine_module._ACTIVE_CONN.set(sentinel)
    try:
        database_connection = object.__new__(engine_module.DatabaseConnection)
        with engine_module.DatabaseConnection.unit_of_work(database_connection) as conn:
            assert conn is sentinel
    finally:
        engine_module._ACTIVE_CONN.reset(token)
