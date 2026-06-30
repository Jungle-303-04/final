"""identity 도메인 HTTP 라우터 — 세션과 내부 로그인 경계."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Response

from domains.identity.dependencies import require_session
from packages.config.constants import Auth
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway

router = APIRouter()


def _set_session_cookie(response: Response, session: dict[str, Any]) -> None:
    # 토큰을 JSON 으로 돌려주지 않고 httpOnly 쿠키로 심는다 → JS 가 못 읽어 XSS 탈취 차단.
    secure = env(Auth.COOKIE_SECURE_ENV, "1") != "0"
    response.set_cookie(
        key=Auth.SESSION_COOKIE_NAME,
        value=session[Gateway.SESSION_TOKEN],
        httponly=True,
        secure=secure,
        samesite=Auth.COOKIE_SAMESITE,
        max_age=int(env(Auth.SESSION_TTL_ENV, Auth.DEFAULT_SESSION_TTL_SECONDS)),
    )


@router.get(gateway_routes.AUTH_SESSION_PATH)
async def session(current: Any = Depends(require_session)) -> dict[str, Any]:
    return {
        Gateway.AUTHENTICATED: True,
        Gateway.USER_ID: current.user_id,
        Gateway.ROLES: current.roles,
    }
