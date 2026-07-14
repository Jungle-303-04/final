from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, Request
from passwords import default_display_name, hash_password, normalize_email, verify_password
from rate_limits import (
    AuthRateLimiter,
    check_email_rate_limit_policy,
    login_rate_limit_policy,
    resend_verification_cooldown_policy,
    resend_verification_rate_limit_policy,
    signup_rate_limit_policy,
)
from settings import Settings

from packages.config.constants import Auth
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, ServiceRole, UserStatus
from packages.contracts.interfaces import SessionStore, UserStore
from packages.security.trusted_proxy import TRUSTED_PROXY_SESSION_TOKEN, trusted_proxy_identity
from packages.storage.sessions import AuthSession, RateLimitExceeded


@dataclass(frozen=True)
class EmailVerificationChallenge:
    user_id: str
    email: str
    token: str
    expires_in_seconds: int


@dataclass(frozen=True)
class EmailVerificationResult:
    user_id: str
    status: str
    roles: list[str]
    workspace_id: str | None
    session: AuthSession | None


def extract_session_token(request: Request) -> str | None:
    authorization = request.headers.get(Settings.AUTHORIZATION_HEADER, "")
    if authorization.lower().startswith(Settings.BEARER_PREFIX):
        return authorization.split(" ", 1)[1].strip()
    if request.headers.get(Settings.SESSION_TOKEN_HEADER):
        return request.headers[Settings.SESSION_TOKEN_HEADER]
    if request.cookies.get(Auth.SESSION_COOKIE_NAME):
        return request.cookies[Auth.SESSION_COOKIE_NAME]
    return None


class SessionAuthService:
    def __init__(self, sessions: SessionStore) -> None:
        self.sessions = sessions

    async def require_session(self, request: Request) -> AuthSession:
        proxy_identity = trusted_proxy_identity(request.headers)
        if proxy_identity is not None:
            return AuthSession(
                token=TRUSTED_PROXY_SESSION_TOKEN,
                user_id=proxy_identity.user_id,
                roles=[ServiceRole.SERVICE_ADMIN.value],
                workspace_id=proxy_identity.workspace_id,
            )
        token = extract_session_token(request)
        session = await self.sessions.get_session(token)
        if session is None:
            raise HTTPException(status_code=401, detail=Settings.AUTHENTICATION_REQUIRED_MESSAGE)
        try:
            await self.sessions.check_rate_limit(session.user_id)
        except RateLimitExceeded:
            raise HTTPException(
                status_code=429, detail=Settings.RATE_LIMIT_EXCEEDED_MESSAGE
            ) from None
        return session


class PasswordAuthService:
    def __init__(self, db: UserStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions
        self.rate_limiter = AuthRateLimiter(sessions)

    async def signup(
        self, email: str, password: str, password_confirm: str, client_key: str
    ) -> EmailVerificationChallenge:
        await self.rate_limiter.check(signup_rate_limit_policy(), email, client_key)
        if password != password_confirm:
            raise HTTPException(
                status_code=400, detail=Settings.PASSWORD_CONFIRMATION_MISMATCH_MESSAGE
            )
        normalized_email = normalize_email(email)
        if self.db.get_user_by_email(normalized_email) is not None:
            raise HTTPException(status_code=409, detail=Settings.USER_ALREADY_EXISTS_MESSAGE)
        user = self.db.create_user(
            user_id=f"user-{uuid.uuid4()}",
            email=normalized_email,
            password_hash=hash_password(password),
            display_name=default_display_name(normalized_email),
            status=UserStatus.PENDING_EMAIL_VERIFICATION.value,
            role=ServiceRole.USER.value,
        )
        if user is None:
            raise HTTPException(status_code=409, detail=Settings.USER_ALREADY_EXISTS_MESSAGE)
        user_id = user_id_from_record(user)
        token = await self.sessions.create_email_verification_token(user_id, normalized_email)
        return EmailVerificationChallenge(
            user_id=user_id,
            email=normalized_email,
            token=token,
            expires_in_seconds=Settings.EMAIL_VERIFICATION_TTL_SECONDS,
        )

    async def check_email_available(self, email: str, client_key: str) -> bool:
        await self.rate_limiter.check(check_email_rate_limit_policy(), email, client_key)
        return self.db.get_user_by_email(normalize_email(email)) is None

    async def login(self, email: str, password: str, client_key: str) -> AuthSession:
        await self.rate_limiter.check(login_rate_limit_policy(), email, client_key)
        user = self.db.get_user_by_email(normalize_email(email))
        if user is None:
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        if not verify_password(password, str(user["password_hash"])):
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        status = str(user["status"])
        if status == UserStatus.PENDING_EMAIL_VERIFICATION.value:
            raise auth_http_error(403, "email_unverified", "이메일 인증이 필요합니다.")
        if status == UserStatus.PENDING_APPROVAL.value:
            raise auth_http_error(403, "approval_pending", "관리자 승인을 기다리는 계정입니다.")
        if status != UserStatus.ACTIVE.value:
            raise auth_http_error(
                401, "invalid_credentials", "이메일 또는 비밀번호가 올바르지 않습니다."
            )
        user_id = user_id_from_record(user)
        return await self.sessions.create_session(
            user_id,
            roles_from_record(user),
            workspace_id_from_record(user) or self.db.get_default_workspace_id_for_user(user_id),
            display_name=str(user["display_name"]),
            email=str(user["email"]),
        )

    async def resend_email_verification(
        self, email: str, password: str, client_key: str
    ) -> EmailVerificationChallenge | None:
        await self.rate_limiter.check(resend_verification_rate_limit_policy(), email, client_key)
        normalized_email = normalize_email(email)
        user = self.db.get_user_by_email(normalized_email)
        if user is None or not verify_password(password, str(user.get("password_hash"))):
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        status = str(user["status"])
        if status == UserStatus.ACTIVE.value:
            return None
        if status != UserStatus.PENDING_EMAIL_VERIFICATION.value:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)

        user_id = user_id_from_record(user)
        try:
            await self.rate_limiter.check(
                resend_verification_cooldown_policy(), normalized_email, client_key
            )
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {}
            retry_after = detail.get("retry_after") or Settings.RESEND_EMAIL_COOLDOWN_SECONDS
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "resend_cooldown",
                    "detail": "인증 메일은 잠시 후 다시 보낼 수 있습니다.",
                    "retry_after": retry_after,
                },
            ) from None
        token = await self.sessions.create_email_verification_token(user_id, normalized_email)
        return EmailVerificationChallenge(
            user_id=user_id,
            email=normalized_email,
            token=token,
            expires_in_seconds=Settings.EMAIL_VERIFICATION_TTL_SECONDS,
        )

    async def verify_email(self, token: str) -> EmailVerificationResult:
        payload = await self.sessions.consume_email_verification_token(token)
        if payload is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        user = self.db.complete_email_verification(str(payload["user_id"]))
        if user is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        user_id = user_id_from_record(user)
        roles = roles_from_record(user)
        status = str(user["status"])
        workspace_id = (
            workspace_id_from_record(user)
            or self.db.get_default_workspace_id_for_user(user_id)
            or DEFAULT_WORKSPACE_ID
        )
        session = None
        if status == UserStatus.ACTIVE.value:
            session = await self.sessions.create_session(
                user_id,
                roles,
                workspace_id,
                display_name=str(user["display_name"]),
                email=str(user["email"]),
            )
        return EmailVerificationResult(
            user_id=user_id,
            status=status,
            roles=roles,
            workspace_id=workspace_id,
            session=session,
        )

    async def approve_user(self, user_id: str, workspace_id: str) -> dict[str, object]:
        user = self.db.approve_user(user_id, workspace_id)
        if user is None:
            raise HTTPException(status_code=404, detail=Settings.USER_NOT_FOUND_MESSAGE)
        return user

    async def logout(self, token: str | None) -> None:
        if token:
            await self.sessions.delete_session(token)

    def user_identity(self, user_id: str) -> dict[str, str] | None:
        user = self.db.get_user_by_id(user_id)
        if user is None:
            return None
        return {
            "display_name": str(user["display_name"]),
            "email": str(user["email"]),
        }


def user_id_from_record(user: dict[str, object]) -> str:
    return str(user.get("user_id") or user["id"])


def roles_from_record(user: dict[str, object]) -> list[str]:
    role = user.get("role") or ServiceRole.USER.value
    if isinstance(role, ServiceRole):
        return [role.value]
    return [str(role)]


def workspace_id_from_record(user: dict[str, object]) -> str | None:
    workspace_id = user.get("workspace_id")
    return str(workspace_id) if workspace_id else None


def auth_http_error(status_code: int, code: str, detail: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail={"code": code, "detail": detail})
