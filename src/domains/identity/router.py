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
from packages.contracts.gateway.requests import (
    LoginRequest,
    ResendEmailVerificationRequest,
    SignupRequest,
)
from packages.contracts.gateway.responses import (
    AuthSessionResponse,
    EmailVerificationResponse,
    LogoutResponse,
)
from packages.runtime.dependencies import get_events

router = APIRouter()
PUBLIC_BASE_URL_ENV = "PUBLIC_BASE_URL"
EMAIL_VERIFICATION_SUCCESS_REDIRECT = "/login?verified=1"


def _set_session_cookie(response: Response, session: Any) -> None:
    # 토큰을 JSON 으로 돌려주지 않고 httpOnly 쿠키로 심는다 → JS 가 못 읽어 XSS 탈취 차단.
    secure = env(Auth.COOKIE_SECURE_ENV, "1") != "0"
    response.set_cookie(
        key=Auth.SESSION_COOKIE_NAME,
        value=session.token,
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


def _authenticated_body(session: Any) -> AuthSessionResponse:
    return AuthSessionResponse(
        authenticated=True,
        user_id=session.user_id,
        roles=session.roles,
    )


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


async def _request_email_verification(request: Request, events: Any, challenge: Any) -> None:
    await events.accept_body(
        EmailVerificationRequestedBody(
            email=challenge.email,
            verification_url=_verification_url(request, challenge.token),
            expires_in_seconds=challenge.expires_in_seconds,
        )
    )


@router.get(gateway_routes.AUTH_SESSION_PATH, response_model=AuthSessionResponse)
async def session(current: Any = Depends(require_session)) -> AuthSessionResponse:
    return _authenticated_body(current)


@router.post(gateway_routes.AUTH_SIGNUP_PATH, response_model=EmailVerificationResponse)
async def signup(
    payload: SignupRequest,
    request: Request,
    password_auth: Any = Depends(get_password_auth),
    events: Any = Depends(get_events),
) -> EmailVerificationResponse:
    challenge = await password_auth.signup(
        payload.email,
        payload.password,
        payload.password_confirm,
        _client_key(request),
    )
    await _request_email_verification(request, events, challenge)
    return EmailVerificationResponse(
        accepted=True,
        verification_required=True,
        email=challenge.email,
    )


@router.post(
    gateway_routes.AUTH_RESEND_VERIFICATION_PATH,
    response_model=EmailVerificationResponse,
)
async def resend_verification(
    payload: ResendEmailVerificationRequest,
    request: Request,
    password_auth: Any = Depends(get_password_auth),
    events: Any = Depends(get_events),
) -> EmailVerificationResponse:
    challenge = await password_auth.resend_email_verification(
        payload.email, payload.password, _client_key(request)
    )
    if challenge is None:
        return EmailVerificationResponse(accepted=True, verification_required=False)
    await _request_email_verification(request, events, challenge)
    return EmailVerificationResponse(
        accepted=True,
        verification_required=True,
        email=challenge.email,
    )


@router.post(gateway_routes.AUTH_LOGIN_PATH, response_model=AuthSessionResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    password_auth: Any = Depends(get_password_auth),
) -> AuthSessionResponse:
    current = await password_auth.login(payload.email, payload.password)
    _set_session_cookie(response, current)
    return _authenticated_body(current)


@router.get(gateway_routes.AUTH_VERIFY_EMAIL_PATH)
async def verify_email(
    token: str = Query(min_length=1),
    redirect: str | None = None,
    password_auth: Any = Depends(get_password_auth),
) -> RedirectResponse:
    current = await password_auth.verify_email(token)
    response = RedirectResponse(url=_safe_redirect_path(redirect), status_code=303)
    _set_session_cookie(response, current)
    return response


@router.post(gateway_routes.AUTH_LOGOUT_PATH, response_model=LogoutResponse)
async def logout(
    response: Response,
    current: Any = Depends(require_session),
    password_auth: Any = Depends(get_password_auth),
) -> LogoutResponse:
    await password_auth.logout(current.token)
    _clear_session_cookie(response)
    return LogoutResponse(authenticated=False)
