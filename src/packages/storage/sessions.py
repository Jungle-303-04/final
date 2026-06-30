from __future__ import annotations

import json
import secrets
from dataclasses import dataclass

from redis.asyncio import Redis as AsyncRedis


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str
    roles: list[str]


@dataclass(frozen=True)
class RedisSessionStoreConfig:
    url: str
    ttl_seconds: int
    key_prefix: str
    token_bytes: int
    default_roles: tuple[str, ...]
    rate_limit_key_prefix: str
    rate_limit: int
    rate_limit_window_seconds: int
    email_verification_key_prefix: str
    email_verification_ttl_seconds: int
    email_verification_token_bytes: int


class RateLimitExceeded(Exception):
    def __init__(self, retry_after_seconds: int | None = None) -> None:
        super().__init__("rate limit exceeded")
        self.retry_after_seconds = retry_after_seconds


class RedisSessionStoreNotConnected(RuntimeError):
    pass


class RedisSessionStore:
    def __init__(self, config: RedisSessionStoreConfig) -> None:
        self.config = config
        self.client: AsyncRedis | None = None

    async def connect(self) -> None:
        self.client = AsyncRedis.from_url(self.config.url, decode_responses=True)
        await self.client.ping()

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def create_session(self, user_id: str, roles: list[str] | None = None) -> AuthSession:
        token = secrets.token_urlsafe(self.config.token_bytes)
        session = AuthSession(
            token=token,
            user_id=user_id,
            roles=roles or list(self.config.default_roles),
        )
        await self._client().setex(
            f"{self.config.key_prefix}:{token}",
            self.config.ttl_seconds,
            json.dumps({"user_id": session.user_id, "roles": session.roles}),
        )
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        if not token:
            return None
        raw = await self._client().get(f"{self.config.key_prefix}:{token}")
        if not raw:
            return None
        payload = json.loads(raw)
        return AuthSession(
            token=token,
            user_id=payload["user_id"],
            roles=list(payload.get("roles", [])),
        )

    async def delete_session(self, token: str) -> None:
        await self._client().delete(f"{self.config.key_prefix}:{token}")

    async def check_rate_limit(
        self,
        key: str,
        limit: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        threshold = limit if limit is not None else self.config.rate_limit
        window = (
            window_seconds if window_seconds is not None else self.config.rate_limit_window_seconds
        )
        redis_key = f"{self.config.rate_limit_key_prefix}:{key}"
        count = await self._client().incr(redis_key)
        if count == 1:
            await self._client().expire(redis_key, window)
        if count > threshold:
            raise RateLimitExceeded

    async def check_escalating_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        lock_steps_seconds: tuple[int, ...],
        strike_ttl_seconds: int,
    ) -> None:
        client = self._client()
        lock_key = f"{self.config.rate_limit_key_prefix}:lock:{key}"
        retry_after = await client.ttl(lock_key)
        if retry_after > 0:
            raise RateLimitExceeded(retry_after)

        counter_key = f"{self.config.rate_limit_key_prefix}:count:{key}"
        count = await client.incr(counter_key)
        if count == 1:
            await client.expire(counter_key, window_seconds)
        if count <= limit:
            return

        strike_key = f"{self.config.rate_limit_key_prefix}:strike:{key}"
        strike_count = await client.incr(strike_key)
        if strike_count == 1:
            await client.expire(strike_key, strike_ttl_seconds)
        lock_seconds = lock_steps_seconds[min(strike_count, len(lock_steps_seconds)) - 1]
        await client.setex(lock_key, lock_seconds, str(strike_count))
        raise RateLimitExceeded(lock_seconds)

    async def create_email_verification_token(self, user_id: str, email: str) -> str:
        token = secrets.token_urlsafe(self.config.email_verification_token_bytes)
        await self._client().setex(
            f"{self.config.email_verification_key_prefix}:{token}",
            self.config.email_verification_ttl_seconds,
            json.dumps({"user_id": user_id, "email": email}),
        )
        return token

    async def consume_email_verification_token(self, token: str | None) -> dict[str, str] | None:
        if not token:
            return None
        key = f"{self.config.email_verification_key_prefix}:{token}"
        raw = await self._client().get(key)
        if not raw:
            return None
        await self._client().delete(key)
        payload = json.loads(raw)
        return {"user_id": str(payload["user_id"]), "email": str(payload["email"])}

    def _client(self) -> AsyncRedis:
        if self.client is None:
            raise RedisSessionStoreNotConnected("Redis session store is not connected")
        return self.client
