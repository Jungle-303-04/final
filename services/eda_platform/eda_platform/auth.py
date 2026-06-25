from __future__ import annotations

import json
import secrets
import uuid
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request
from redis.asyncio import Redis

from eda_platform.core import Database, env


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str
    roles: list[str]


class RedisSessionStore:
    def __init__(self) -> None:
        self.url = env("REDIS_URL", "redis://redis:6379/0")
        self.ttl_seconds = int(env("SESSION_TTL_SECONDS", "86400"))
        self.client: Redis | None = None

    async def connect(self) -> None:
        self.client = Redis.from_url(self.url, decode_responses=True)
        await self.client.ping()

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def create_session(self, user_id: str, roles: list[str] | None = None) -> AuthSession:
        client = self._client()
        token = secrets.token_urlsafe(32)
        session = AuthSession(token=token, user_id=user_id, roles=roles or ["owner"])
        await client.setex(
            f"session:{token}",
            self.ttl_seconds,
            json.dumps({"user_id": session.user_id, "roles": session.roles}),
        )
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        if not token:
            return None
        raw = await self._client().get(f"session:{token}")
        if not raw:
            return None
        payload = json.loads(raw)
        return AuthSession(
            token=token, user_id=payload["user_id"], roles=list(payload.get("roles", []))
        )

    async def save_oauth_state(self, state: str, payload: dict[str, Any]) -> None:
        await self._client().setex(f"oauth_state:{state}", 600, json.dumps(payload))

    async def consume_oauth_state(self, state: str | None) -> dict[str, Any] | None:
        if not state:
            return None
        key = f"oauth_state:{state}"
        raw = await self._client().get(key)
        if raw:
            await self._client().delete(key)
            return dict(json.loads(raw))
        return None

    async def check_rate_limit(self, key: str, limit: int = 120, window_seconds: int = 60) -> None:
        redis_key = f"rate:{key}"
        count = await self._client().incr(redis_key)
        if count == 1:
            await self._client().expire(redis_key, window_seconds)
        if count > limit:
            raise HTTPException(status_code=429, detail="rate limit exceeded")

    def _client(self) -> Redis:
        if self.client is None:
            raise RuntimeError("Redis session store is not connected")
        return self.client


class OAuthAuthService:
    def __init__(self, db: Database, sessions: RedisSessionStore) -> None:
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
            "authorization_url": f"https://oauth.example.local/{provider}/authorize?state={state}",
        }

    async def callback(self, provider: str, payload: dict[str, Any]) -> dict[str, Any]:
        state_payload = await self.sessions.consume_oauth_state(payload.get("state"))
        merged = {**(state_payload or {}), **payload, "provider": provider}
        account = self.db.save_oauth_account(merged)
        session = await self.sessions.create_session(account["user_id"], ["owner"])
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
            raise HTTPException(status_code=401, detail="authentication required")
        await self.sessions.check_rate_limit(session.user_id)
        return session

    @staticmethod
    def _extract_token(request: Request) -> str | None:
        authorization = request.headers.get("authorization", "")
        if authorization.lower().startswith("bearer "):
            return authorization.split(" ", 1)[1].strip()
        if request.headers.get("x-session-token"):
            return request.headers["x-session-token"]
        if request.cookies.get("eda_session"):
            return request.cookies["eda_session"]
        return None
