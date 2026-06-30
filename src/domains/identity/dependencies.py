"""identity 인가 가드(필터) — Depends 로 라우터/라우트에 선언적으로 적용.

클로저로 매 핸들러에서 검사하는 대신, 가드를 한 곳에 정의하고
APIRouter(dependencies=[Depends(require_*)]) 또는 라우트 인자로 선언한다.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from packages.config.settings import env

AGENT_TOKEN_ENV = "AGENT_TOKEN"
AGENT_TOKEN_HEADER = "x-agent-token"
AGENT_AUTH_REQUIRED_MESSAGE = "agent authentication required"
AGENT_AUTH_NOT_CONFIGURED_MESSAGE = "agent auth not configured"


def get_password_auth(request: Request) -> Any:
    return request.app.state.password_auth


async def require_session(request: Request) -> Any:
    """사용자 세션 가드 — 유효 세션 필요(없으면 401)."""
    return await request.app.state.auth.require_session(request)


def require_agent(request: Request) -> None:
    """agent 토큰 가드 — fail-closed. AGENT_TOKEN 미설정이면 약한 기본값으로 열지 않고 거부."""
    expected = env(AGENT_TOKEN_ENV, "")
    if not expected:
        raise HTTPException(status_code=503, detail=AGENT_AUTH_NOT_CONFIGURED_MESSAGE)
    if request.headers.get(AGENT_TOKEN_HEADER) != expected:
        raise HTTPException(status_code=401, detail=AGENT_AUTH_REQUIRED_MESSAGE)
