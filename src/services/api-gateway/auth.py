from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass

from fastapi import HTTPException, Request
from settings import Settings

from packages.config.constants import Auth
from packages.contracts.interfaces import SessionStore, UserStore
from packages.storage.sessions import AuthSession, RateLimitExceeded

PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_NAME = "sha256"
PASSWORD_HASH_ITERATIONS = 260000
PASSWORD_SALT_BYTES = 16


@dataclass(frozen=True)
class EmailVerificationChallenge:
    user_id: str
    email: str
    token: str
    expires_in_seconds: int


def _encode_token(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_token(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        PASSWORD_HASH_NAME,
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"{PASSWORD_HASH_ALGORITHM}"
        f"${PASSWORD_HASH_ITERATIONS}"
        f"${_encode_token(salt)}"
        f"${_encode_token(digest)}"
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, iterations, salt_value, digest_value = password_hash.split("$", 3)
        if algorithm != PASSWORD_HASH_ALGORITHM:
            return False
        salt = _decode_token(salt_value)
        expected = _decode_token(digest_value)
        actual = hashlib.pbkdf2_hmac(
            PASSWORD_HASH_NAME,
            password.encode("utf-8"),
            salt,
            int(iterations),
        )
    except (binascii.Error, TypeError, ValueError):
        return False
    return hmac.compare_digest(actual, expected)


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

    async def signup(
        self, email: str, password: str, password_confirm: str, client_key: str
    ) -> EmailVerificationChallenge:
        await self._check_auth_rate_limits(
            "signup",
            email,
            client_key,
            Settings.SIGNUP_EMAIL_RATE_LIMIT,
            Settings.SIGNUP_IP_RATE_LIMIT,
        )
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
            status=Settings.USER_STATUS_PENDING_EMAIL_VERIFICATION,
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
        if user["status"] == Settings.USER_STATUS_PENDING_EMAIL_VERIFICATION:
            raise HTTPException(
                status_code=403, detail=Settings.EMAIL_VERIFICATION_REQUIRED_MESSAGE
            )
        if user["status"] != Settings.USER_STATUS_ACTIVE:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        if not verify_password(password, str(user["password_hash"])):
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        return await self.sessions.create_session(user_id_from_record(user), [Settings.OWNER_ROLE])

    async def resend_email_verification(
        self, email: str, password: str, client_key: str
    ) -> EmailVerificationChallenge | None:
        await self._check_auth_rate_limits(
            "resend",
            email,
            client_key,
            Settings.RESEND_EMAIL_RATE_LIMIT,
            Settings.RESEND_IP_RATE_LIMIT,
        )
        normalized_email = normalize_email(email)
        user = self.db.get_user_by_email(normalized_email)
        if user is None or not verify_password(password, str(user.get("password_hash"))):
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        if user["status"] == Settings.USER_STATUS_ACTIVE:
            return None
        if user["status"] != Settings.USER_STATUS_PENDING_EMAIL_VERIFICATION:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)

        user_id = user_id_from_record(user)
        token = await self.sessions.create_email_verification_token(user_id, normalized_email)
        return EmailVerificationChallenge(
            user_id=user_id,
            email=normalized_email,
            token=token,
            expires_in_seconds=Settings.EMAIL_VERIFICATION_TTL_SECONDS,
        )

    async def _check_auth_rate_limits(
        self,
        scope: str,
        email: str,
        client_key: str,
        email_limit: int,
        client_limit: int,
    ) -> None:
        email_key = f"auth:{scope}:email:{email_rate_key(email)}"
        client_rate_key = f"auth:{scope}:client:{stable_rate_key(client_key)}"
        lock_steps = (
            Settings.AUTH_ABUSE_FIRST_LOCK_SECONDS,
            Settings.AUTH_ABUSE_SECOND_LOCK_SECONDS,
            Settings.AUTH_ABUSE_THIRD_LOCK_SECONDS,
        )
        try:
            await self.sessions.check_escalating_rate_limit(
                email_key,
                email_limit,
                Settings.AUTH_ABUSE_RATE_WINDOW_SECONDS,
                lock_steps,
                Settings.AUTH_ABUSE_STRIKE_TTL_SECONDS,
            )
            await self.sessions.check_escalating_rate_limit(
                client_rate_key,
                client_limit,
                Settings.AUTH_ABUSE_RATE_WINDOW_SECONDS,
                lock_steps,
                Settings.AUTH_ABUSE_STRIKE_TTL_SECONDS,
            )
        except RateLimitExceeded:
            raise HTTPException(
                status_code=429, detail=Settings.RATE_LIMIT_EXCEEDED_MESSAGE
            ) from None

    async def verify_email(self, token: str) -> AuthSession:
        payload = await self.sessions.consume_email_verification_token(token)
        if payload is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        user = self.db.activate_user(str(payload["user_id"]))
        if user is None:
            raise HTTPException(status_code=400, detail=Settings.EMAIL_VERIFICATION_INVALID_MESSAGE)
        return await self.sessions.create_session(user_id_from_record(user), [Settings.OWNER_ROLE])

    async def logout(self, token: str | None) -> None:
        if token:
            await self.sessions.delete_session(token)


def normalize_email(email: str) -> str:
    return email.strip().lower()


def email_rate_key(email: str) -> str:
    return stable_rate_key(normalize_email(email))


def stable_rate_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def default_display_name(email: str) -> str:
    return email.split("@", 1)[0]


def user_id_from_record(user: dict[str, object]) -> str:
    return str(user.get("user_id") or user["id"])
