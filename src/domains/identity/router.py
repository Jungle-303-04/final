"""identity 도메인 HTTP 라우터 — 세션과 내부 로그인 경계."""

from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, Response
from fastapi.responses import RedirectResponse

from domains.identity.dependencies import get_password_auth, require_session
from packages.config.constants import Auth
from packages.config.settings import env
from packages.contracts.event_bus.bodies import EmailVerificationRequestedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import (
    LoginRequest,
    ResendEmailVerificationRequest,
    SignupRequest,
)
from packages.runtime.dependencies import get_events

router = APIRouter()
PUBLIC_BASE_URL_ENV = "PUBLIC_BASE_URL"
EMAIL_VERIFICATION_SUCCESS_REDIRECT = "/login?verified=1"


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


def _clear_session_cookie(response: Response) -> None:
    secure = env(Auth.COOKIE_SECURE_ENV, "1") != "0"
    response.delete_cookie(
        key=Auth.SESSION_COOKIE_NAME,
        httponly=True,
        secure=secure,
        samesite=Auth.COOKIE_SAMESITE,
    )


def _session_payload(session: Any) -> dict[str, Any]:
    return {
        Gateway.SESSION_TOKEN: session.token,
        Gateway.USER_ID: session.user_id,
        Gateway.ROLES: session.roles,
    }


def _authenticated_body(session: Any) -> dict[str, Any]:
    return {
        Gateway.AUTHENTICATED: True,
        Gateway.USER_ID: session.user_id,
        Gateway.ROLES: session.roles,
    }


def _verification_url(request: Request, token: str) -> str:
    query = urlencode({"token": token})
    public_base_url = env(PUBLIC_BASE_URL_ENV, "").rstrip("/")
    if public_base_url:
        return f"{public_base_url}{gateway_routes.AUTH_VERIFY_EMAIL_PATH}?{query}"
    return f"{request.url_for('verify_email')}?{query}"


def _safe_redirect_path(path: str | None) -> str:
    if not path:
        return EMAIL_VERIFICATION_SUCCESS_REDIRECT
    if not path.startswith("/") or path.startswith("//") or "://" in path:
        return EMAIL_VERIFICATION_SUCCESS_REDIRECT
    return path


def _client_key(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    if request.client is not None:
        return request.client.host
    return "unknown"


async def _request_email_verification(
    events: Any, email: str, verification_url: str, expires_in_seconds: int
) -> None:
    await events.accept_body(
        EmailVerificationRequestedBody(
            email=email,
            verification_url=verification_url,
            expires_in_seconds=expires_in_seconds,
        )
    )


@router.get(gateway_routes.AUTH_SESSION_PATH)
async def session(current: Any = Depends(require_session)) -> dict[str, Any]:
    return _authenticated_body(current)


@router.post(gateway_routes.AUTH_SIGNUP_PATH)
async def signup(
    payload: SignupRequest,
    request: Request,
    password_auth: Any = Depends(get_password_auth),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    challenge = await password_auth.signup(
        payload.email,
        payload.password,
        payload.password_confirm,
        _client_key(request),
    )
    verification_url = _verification_url(request, challenge.token)
    await _request_email_verification(
        events, challenge.email, verification_url, challenge.expires_in_seconds
    )
    return {
        Gateway.ACCEPTED: True,
        Gateway.VERIFICATION_REQUIRED: True,
        Gateway.EMAIL: challenge.email,
    }


@router.post(gateway_routes.AUTH_RESEND_VERIFICATION_PATH)
async def resend_verification(
    payload: ResendEmailVerificationRequest,
    request: Request,
    password_auth: Any = Depends(get_password_auth),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    challenge = await password_auth.resend_email_verification(
        payload.email, payload.password, _client_key(request)
    )
    if challenge is None:
        return {
            Gateway.ACCEPTED: True,
            Gateway.VERIFICATION_REQUIRED: False,
        }
    verification_url = _verification_url(request, challenge.token)
    await _request_email_verification(
        events, challenge.email, verification_url, challenge.expires_in_seconds
    )
    return {
        Gateway.ACCEPTED: True,
        Gateway.VERIFICATION_REQUIRED: True,
        Gateway.EMAIL: challenge.email,
    }


@router.post(gateway_routes.AUTH_LOGIN_PATH)
async def login(
    payload: LoginRequest,
    response: Response,
    password_auth: Any = Depends(get_password_auth),
) -> dict[str, Any]:
    current = await password_auth.login(payload.email, payload.password)
    _set_session_cookie(response, _session_payload(current))
    return _authenticated_body(current)


@router.get(gateway_routes.AUTH_VERIFY_EMAIL_PATH)
async def verify_email(
    token: str = Query(min_length=1),
    redirect: str | None = None,
    password_auth: Any = Depends(get_password_auth),
) -> RedirectResponse:
    current = await password_auth.verify_email(token)
    response = RedirectResponse(url=_safe_redirect_path(redirect), status_code=303)
    _set_session_cookie(response, _session_payload(current))
    return response


@router.post(gateway_routes.AUTH_LOGOUT_PATH)
async def logout(
    response: Response,
    current: Any = Depends(require_session),
    password_auth: Any = Depends(get_password_auth),
) -> dict[str, bool]:
    await password_auth.logout(current.token)
    _clear_session_cookie(response)
    return {Gateway.AUTHENTICATED: False}
