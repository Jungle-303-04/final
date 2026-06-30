from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import HTTPException, Request
from passwords import default_display_name, hash_password, normalize_email, verify_password
from rate_limits import (
    AuthRateLimiter,
    resend_verification_rate_limit_policy,
    signup_rate_limit_policy,
)
from settings import Settings

from packages.config.constants import Auth
from packages.contracts.identity import AccountRole, UserStatus
from packages.contracts.interfaces import SessionStore, UserStore
from packages.storage.sessions import AuthSession, RateLimitExceeded


@dataclass(frozen=True)
class EmailVerificationChallenge:
    user_id: str
    email: str
    token: str
    expires_in_seconds: int


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
        role = self._new_user_role()
        user = self.db.create_user(
            user_id=f"user-{uuid.uuid4()}",
            email=normalized_email,
            password_hash=hash_password(password),
            display_name=default_display_name(normalized_email),
            status=UserStatus.PENDING_EMAIL_VERIFICATION.value,
            role=role.value,
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

    async def login(self, email: str, password: str) -> AuthSession:
        user = self.db.get_user_by_email(normalize_email(email))
        if user is None:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        status = str(user["status"])
        if status == UserStatus.PENDING_EMAIL_VERIFICATION.value:
            raise HTTPException(
                status_code=403, detail=Settings.EMAIL_VERIFICATION_REQUIRED_MESSAGE
            )
        if status != UserStatus.ACTIVE.value:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        if not verify_password(password, str(user["password_hash"])):
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        return await self.sessions.create_session(
            user_id_from_record(user), roles_from_record(user)
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
        token = await self.sessions.create_email_verification_token(user_id, normalized_email)
        return EmailVerificationChallenge(
            user_id=user_id,
            email=normalized_email,
            token=token,
            expires_in_seconds=Settings.EMAIL_VERIFICATION_TTL_SECONDS,
        )

    async def verify_email(self, token: str) -> AuthSession:
        payload = await self.sessions.consume_email_verification_token(token)
        if payload is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        user = self.db.activate_user(str(payload["user_id"]))
        if user is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        return await self.sessions.create_session(
            user_id_from_record(user), roles_from_record(user)
        )

    async def logout(self, token: str | None) -> None:
        if token:
            await self.sessions.delete_session(token)

    def _new_user_role(self) -> AccountRole:
        if self.db.has_user_accounts():
            return AccountRole.MEMBER
        return AccountRole.ADMIN


def user_id_from_record(user: dict[str, object]) -> str:
    return str(user.get("user_id") or user["id"])


def roles_from_record(user: dict[str, object]) -> list[str]:
    role = user.get("role") or AccountRole.MEMBER.value
    if isinstance(role, AccountRole):
        return [role.value]
    return [str(role)]
