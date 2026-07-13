from __future__ import annotations

import json
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Protocol

from redis.asyncio import Redis as AsyncRedis


@dataclass(frozen=True)
class AuthSession:
    token: str
    user_id: str
    roles: list[str]
    workspace_id: str


@dataclass(frozen=True)
class RedisSessionStoreConfig:
    url: str
    ttl_seconds: int
    key_prefix: str
    token_bytes: int
    default_roles: tuple[str, ...]
    default_workspace_id: str
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


class SessionStore(Protocol):
    async def connect(self) -> None: ...

    async def close(self) -> None: ...

    async def create_session(
        self,
        user_id: str,
        roles: list[str] | None = None,
        workspace_id: str | None = None,
    ) -> AuthSession: ...

    async def get_session(self, token: str | None) -> AuthSession | None: ...

    async def touch_session(self, token: str | None) -> bool: ...

    async def delete_session(self, token: str) -> None: ...

    async def check_rate_limit(
        self,
        key: str,
        limit: int | None = None,
        window_seconds: int | None = None,
    ) -> None: ...

    async def check_escalating_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        lock_steps_seconds: tuple[int, ...],
        strike_ttl_seconds: int,
    ) -> None: ...

    async def create_email_verification_token(self, user_id: str, email: str) -> str: ...

    async def consume_email_verification_token(
        self, token: str | None
    ) -> dict[str, str] | None: ...


class MemorySessionStore:
    """Single-controller OSS session store; process-local and intentionally non-HA."""

    def __init__(self, config: RedisSessionStoreConfig) -> None:
        self.config = config
        self.connected = False
        self.sessions: dict[str, tuple[float, AuthSession]] = {}
        self.verifications: dict[str, tuple[float, dict[str, str]]] = {}
        self.rate_events: dict[str, deque[float]] = defaultdict(deque)
        self.strikes: dict[str, tuple[float, int]] = {}
        self.locks: dict[str, float] = {}

    async def connect(self) -> None:
        self.connected = True

    async def close(self) -> None:
        self.connected = False
        self.sessions.clear()
        self.verifications.clear()
        self.rate_events.clear()
        self.strikes.clear()
        self.locks.clear()

    async def create_session(
        self,
        user_id: str,
        roles: list[str] | None = None,
        workspace_id: str | None = None,
    ) -> AuthSession:
        self._require_connected()
        token = secrets.token_urlsafe(self.config.token_bytes)
        session = AuthSession(
            token=token,
            user_id=user_id,
            roles=roles or list(self.config.default_roles),
            workspace_id=workspace_id or self.config.default_workspace_id,
        )
        self.sessions[token] = (time.monotonic() + self.config.ttl_seconds, session)
        return session

    async def get_session(self, token: str | None) -> AuthSession | None:
        self._require_connected()
        if not token:
            return None
        stored = self.sessions.get(token)
        if stored is None:
            return None
        expires_at, session = stored
        if expires_at <= time.monotonic():
            self.sessions.pop(token, None)
            return None
        return session

    async def touch_session(self, token: str | None) -> bool:
        session = await self.get_session(token)
        if session is None:
            return False
        self.sessions[session.token] = (
            time.monotonic() + self.config.ttl_seconds,
            session,
        )
        return True

    async def delete_session(self, token: str) -> None:
        self._require_connected()
        self.sessions.pop(token, None)

    async def check_rate_limit(
        self,
        key: str,
        limit: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        self._require_connected()
        threshold = limit if limit is not None else self.config.rate_limit
        window = (
            window_seconds if window_seconds is not None else self.config.rate_limit_window_seconds
        )
        now = time.monotonic()
        events = self.rate_events[key]
        while events and events[0] <= now - window:
            events.popleft()
        events.append(now)
        if len(events) > threshold:
            raise RateLimitExceeded

    async def check_escalating_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        lock_steps_seconds: tuple[int, ...],
        strike_ttl_seconds: int,
    ) -> None:
        self._require_connected()
        now = time.monotonic()
        locked_until = self.locks.get(key, 0.0)
        if locked_until > now:
            raise RateLimitExceeded(max(1, int(locked_until - now)))
        try:
            await self.check_rate_limit(f"escalating:{key}", limit, window_seconds)
        except RateLimitExceeded:
            strike_expires_at, strike_count = self.strikes.get(key, (0.0, 0))
            if strike_expires_at <= now:
                strike_count = 0
            strike_count += 1
            self.strikes[key] = (now + strike_ttl_seconds, strike_count)
            lock_seconds = lock_steps_seconds[min(strike_count, len(lock_steps_seconds)) - 1]
            self.locks[key] = now + lock_seconds
            raise RateLimitExceeded(lock_seconds) from None

    async def create_email_verification_token(self, user_id: str, email: str) -> str:
        self._require_connected()
        token = secrets.token_urlsafe(self.config.email_verification_token_bytes)
        self.verifications[token] = (
            time.monotonic() + self.config.email_verification_ttl_seconds,
            {"user_id": user_id, "email": email},
        )
        return token

    async def consume_email_verification_token(self, token: str | None) -> dict[str, str] | None:
        self._require_connected()
        if not token:
            return None
        stored = self.verifications.pop(token, None)
        if stored is None:
            return None
        expires_at, payload = stored
        return payload if expires_at > time.monotonic() else None

    def _require_connected(self) -> None:
        if not self.connected:
            raise RedisSessionStoreNotConnected("memory session store is not connected")


class RedisSessionStore:
    def __init__(self, config: RedisSessionStoreConfig) -> None:
        self.config = config
        self.client: AsyncRedis | None = None

    async def connect(self) -> None:
        # 타임아웃/헬스체크 없으면 half-open(죽은) 연결에서 명령이 무한 대기함
        # (control-plane 재시작·엔드포인트 churn 후 로그인 setex 가 영원히 멈추던 원인).
        # socket_timeout 으로 응답을 유한하게 끊고, health_check_interval 로 idle 연결을
        # 쓰기 전에 ping 검증, keepalive/retry 로 끊긴 연결을 자동 복구함.
        self.client = AsyncRedis.from_url(
            self.config.url,
            decode_responses=True,
            socket_timeout=5,
            socket_connect_timeout=5,
            socket_keepalive=True,
            health_check_interval=30,
            retry_on_timeout=True,
        )
        await self.client.ping()

    async def close(self) -> None:
        if self.client is not None:
            await self.client.aclose()

    async def create_session(
        self,
        user_id: str,
        roles: list[str] | None = None,
        workspace_id: str | None = None,
    ) -> AuthSession:
        token = secrets.token_urlsafe(self.config.token_bytes)
        session = AuthSession(
            token=token,
            user_id=user_id,
            roles=roles or list(self.config.default_roles),
            workspace_id=workspace_id or self.config.default_workspace_id,
        )
        await self._client().setex(
            f"{self.config.key_prefix}:{token}",
            self.config.ttl_seconds,
            json.dumps(
                {
                    "user_id": session.user_id,
                    "roles": session.roles,
                    "workspace_id": session.workspace_id,
                }
            ),
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
            workspace_id=payload.get("workspace_id", self.config.default_workspace_id),
        )

    async def touch_session(self, token: str | None) -> bool:
        if not token:
            return False
        return bool(
            await self._client().expire(
                f"{self.config.key_prefix}:{token}",
                self.config.ttl_seconds,
            )
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
        raw = await self._client().getdel(key)
        if not raw:
            return None
        payload = json.loads(raw)
        return {"user_id": str(payload["user_id"]), "email": str(payload["email"])}

    def _client(self) -> AsyncRedis:
        if self.client is None:
            raise RedisSessionStoreNotConnected("Redis session store is not connected")
        return self.client
