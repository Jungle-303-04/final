from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass

from fastapi import HTTPException, Request
from redis.asyncio import Redis as AsyncRedis
from settings import Settings

from packages.config.constants import Auth
from packages.config.constants import Redis as RedisConfig
from packages.config.settings import env
from packages.contracts.interfaces import SessionStore, UserStore

PASSWORD_HASH_ALGORITHM = "pbkdf2_sha256"
PASSWORD_HASH_NAME = "sha256"
PASSWORD_HASH_ITERATIONS = 260000
PASSWORD_SALT_BYTES = 16


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


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str
    roles: list[str]


class RedisSessionStore:
    def __init__(self) -> None:
        self.url = env(Settings.REDIS_URL_ENV, RedisConfig.DEFAULT_URL)
        self.ttl_seconds = int(env(Settings.SESSION_TTL_ENV, Auth.DEFAULT_SESSION_TTL_SECONDS))
        self.client: AsyncRedis | None = None

    async def connect(self) -> None:
        self.client = AsyncRedis.from_url(self.url, decode_responses=True)
        await self.client.ping()

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def create_session(self, user_id: str, roles: list[str] | None = None) -> AuthSession:
        client = self._client()
        token = secrets.token_urlsafe(Settings.SESSION_TOKEN_BYTES)
        session = AuthSession(token=token, user_id=user_id, roles=roles or [Settings.OWNER_ROLE])
        await client.setex(
            f"{Settings.SESSION_KEY_PREFIX}:{token}",
            self.ttl_seconds,
            json.dumps({"user_id": session.user_id, "roles": session.roles}),
        )
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        if not token:
            return None
        raw = await self._client().get(f"{Settings.SESSION_KEY_PREFIX}:{token}")
        if not raw:
            return None
        payload = json.loads(raw)
        return AuthSession(
            token=token, user_id=payload["user_id"], roles=list(payload.get("roles", []))
        )

    async def delete_session(self, token: str) -> None:
        await self._client().delete(f"{Settings.SESSION_KEY_PREFIX}:{token}")

    async def check_rate_limit(
        self,
        key: str,
        limit: int = Settings.DEFAULT_RATE_LIMIT,
        window_seconds: int = Settings.RATE_LIMIT_WINDOW_SECONDS,
    ) -> None:
        redis_key = f"{Settings.RATE_LIMIT_KEY_PREFIX}:{key}"
        count = await self._client().incr(redis_key)
        if count == 1:
            await self._client().expire(redis_key, window_seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail=Settings.RATE_LIMIT_EXCEEDED_MESSAGE)

    def _client(self) -> AsyncRedis:
        if self.client is None:
            raise RuntimeError(Settings.REDIS_NOT_CONNECTED_MESSAGE)
        return self.client


class SessionAuthService:
    def __init__(self, sessions: SessionStore) -> None:
        self.sessions = sessions

    async def require_session(self, request: Request) -> AuthSession:
        token = extract_session_token(request)
        session = await self.sessions.get_session(token)
        if session is None:
            raise HTTPException(status_code=401, detail=Settings.AUTHENTICATION_REQUIRED_MESSAGE)
        await self.sessions.check_rate_limit(session.user_id)
        return session


class PasswordAuthService:
    def __init__(self, db: UserStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions

    async def login(self, email: str, password: str) -> AuthSession:
        user = self.db.get_user_by_email(email)
        if user is None or user["status"] != Settings.USER_STATUS_ACTIVE:
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        if not verify_password(password, str(user["password_hash"])):
            raise HTTPException(status_code=401, detail=Settings.INVALID_CREDENTIALS_MESSAGE)
        return await self.sessions.create_session(str(user["id"]), [Settings.OWNER_ROLE])

    async def logout(self, token: str | None) -> None:
        if token:
            await self.sessions.delete_session(token)
