"""identity 보안 회귀 — OAuth callback 은 state 검증 실패 시 세션 발급을 거부한다. [P0]

state 미존재/불일치인데도 owner 세션을 내주던 인증 우회를 막는다.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest
from conftest import ROOT, load_file
from fastapi import HTTPException


class _FakeSessions:
    async def consume_oauth_state(self, state: Any) -> Any:
        return None  # 미존재/불일치 state

    async def create_session(self, user_id: str, roles: list[str]) -> Any:
        raise AssertionError("invalid state 인데 세션 생성됨 — P0 우회")


class _FakeDb:
    def save_oauth_account(self, payload: Any) -> Any:
        raise AssertionError("invalid state 인데 계정 저장됨 — P0 우회")


def test_oauth_callback_rejects_invalid_state() -> None:
    auth = load_file(ROOT / "src" / "services" / "api-gateway" / "auth.py", "svc_auth")
    service = auth.OAuthAuthService(_FakeDb(), _FakeSessions())

    async def run() -> None:
        with pytest.raises(HTTPException) as exc:
            await service.callback("github", {"state": "forged"})
        assert exc.value.status_code == 400

    asyncio.run(run())
