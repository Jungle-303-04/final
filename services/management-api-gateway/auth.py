from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from redis.asyncio import Redis

from packages.config.constants import (
    DEFAULT_REDIS_URL,
    DEFAULT_SESSION_TTL_SECONDS,
    SESSION_COOKIE_NAME,
)
from packages.config.settings import env
from packages.contracts.interfaces import OAuthAccountStore, SessionStore

REDIS_URL_ENV = "REDIS_URL"
SESSION_TTL_ENV = "SESSION_TTL_SECONDS"
SESSION_KEY_PREFIX = "session"
OAUTH_STATE_KEY_PREFIX = "oauth_state"
RATE_LIMIT_KEY_PREFIX = "rate"
OAUTH_STATE_TTL_SECONDS = 600
SESSION_TOKEN_BYTES = 32
DEFAULT_RATE_LIMIT = 120
RATE_LIMIT_WINDOW_SECONDS = 60
OWNER_ROLE = "owner"
AUTHORIZATION_HEADER = "authorization"
BEARER_PREFIX = "bearer "
SESSION_TOKEN_HEADER = "x-session-token"
OAUTH_AUTHORIZE_BASE_URL = "https://oauth.example.local"
RATE_LIMIT_EXCEEDED_MESSAGE = "rate limit exceeded"
AUTHENTICATION_REQUIRED_MESSAGE = "authentication required"
REDIS_NOT_CONNECTED_MESSAGE = "Redis session store is not connected"


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str
    roles: list[str]


class RedisSessionStore:
    def __init__(self) -> None:
        self.url = env(REDIS_URL_ENV, DEFAULT_REDIS_URL)
        self.ttl_seconds = int(env(SESSION_TTL_ENV, DEFAULT_SESSION_TTL_SECONDS))
        self.client: Redis | None = None

    async def connect(self) -> None:
        self.client = Redis.from_url(self.url, decode_responses=True)
        await self.client.ping()

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def create_session(self, user_id: str, roles: list[str] | None = None) -> AuthSession:
        client = self._client()
        token = secrets.token_urlsafe(SESSION_TOKEN_BYTES)
        session = AuthSession(token=token, user_id=user_id, roles=roles or [OWNER_ROLE])
        await client.setex(
            f"{SESSION_KEY_PREFIX}:{token}",
            self.ttl_seconds,
            json.dumps({"user_id": session.user_id, "roles": session.roles}),
        )
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        if not token:
            return None
        raw = await self._client().get(f"{SESSION_KEY_PREFIX}:{token}")
        if not raw:
            return None
        payload = json.loads(raw)
        return AuthSession(
            token=token, user_id=payload["user_id"], roles=list(payload.get("roles", []))
        )

    async def save_oauth_state(self, state: str, payload: dict[str, Any]) -> None:
        await self._client().setex(
            f"{OAUTH_STATE_KEY_PREFIX}:{state}", OAUTH_STATE_TTL_SECONDS, json.dumps(payload)
        )

    async def consume_oauth_state(self, state: str | None) -> dict[str, Any] | None:
        if not state:
            return None
        key = f"{OAUTH_STATE_KEY_PREFIX}:{state}"
        raw = await self._client().get(key)
        if raw:
            await self._client().delete(key)
            return dict(json.loads(raw))
        return None

    async def check_rate_limit(
        self,
        key: str,
        limit: int = DEFAULT_RATE_LIMIT,
        window_seconds: int = RATE_LIMIT_WINDOW_SECONDS,
    ) -> None:
        redis_key = f"{RATE_LIMIT_KEY_PREFIX}:{key}"
        count = await self._client().incr(redis_key)
        if count == 1:
            await self._client().expire(redis_key, window_seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail=RATE_LIMIT_EXCEEDED_MESSAGE)

    def _client(self) -> Redis:
        if self.client is None:
            raise RuntimeError(REDIS_NOT_CONNECTED_MESSAGE)
        return self.client


class OAuthAuthService:
    def __init__(self, db: OAuthAccountStore, sessions: SessionStore) -> None:
        self.db = db
        self.sessions = sessions

    async def start(self, provider: str, user_id: str, scopes: list[str]) -> dict[str, Any]:
        state = str(uuid.uuid4())
        await self.sessions.save_oauth_state(
            state, {"provider": provider, "user_id": user_id, "scopes": scopes}
        )
        return {
            "provider": provider,
            "state": state,
            "authorization_url": f"{OAUTH_AUTHORIZE_BASE_URL}/{provider}/authorize?state={state}",
        }

    async def callback(self, provider: str, payload: dict[str, Any]) -> dict[str, Any]:
        state_payload = await self.sessions.consume_oauth_state(payload.get("state"))
        merged = {**(state_payload or {}), **payload, "provider": provider}
        account = self.db.save_oauth_account(merged)
        session = await self.sessions.create_session(account["user_id"], [OWNER_ROLE])
        return {
            "account": account,
            "session": {
                "session_token": session.token,
                "user_id": session.user_id,
                "roles": session.roles,
            },
        }

    async def require_session(self, request: Request) -> AuthSession:
        token = self._extract_token(request)
        session = await self.sessions.get_session(token)
        if session is None:
            raise HTTPException(status_code=401, detail=AUTHENTICATION_REQUIRED_MESSAGE)
        await self.sessions.check_rate_limit(session.user_id)
        return session

    @staticmethod
    def _extract_token(request: Request) -> str | None:
        authorization = request.headers.get(AUTHORIZATION_HEADER, "")
        if authorization.lower().startswith(BEARER_PREFIX):
            return authorization.split(" ", 1)[1].strip()
        if request.headers.get(SESSION_TOKEN_HEADER):
            return request.headers[SESSION_TOKEN_HEADER]
        if request.cookies.get(SESSION_COOKIE_NAME):
            return request.cookies[SESSION_COOKIE_NAME]
        return None
