from __future__ import annotations

import asyncio
import json

import pytest

from packages.storage.sessions import (
    MemorySessionStore,
    RateLimitExceeded,
    RedisSessionStore,
    RedisSessionStoreConfig,
)


class StubRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.get_calls = 0
        self.delete_calls = 0
        self.expire_calls: list[tuple[str, int]] = []

    async def getdel(self, key: str) -> str | None:
        return self.values.pop(key, None)

    async def get(self, key: str) -> str | None:
        self.get_calls += 1
        return self.values.get(key)

    async def delete(self, key: str) -> None:
        self.delete_calls += 1
        self.values.pop(key, None)

    async def expire(self, key: str, ttl_seconds: int) -> bool:
        self.expire_calls.append((key, ttl_seconds))
        return key in self.values


def session_config() -> RedisSessionStoreConfig:
    return RedisSessionStoreConfig(
        url="redis://localhost:6379/0",
        ttl_seconds=60,
        key_prefix="session",
        token_bytes=32,
        default_roles=("user",),
        default_workspace_id="default",
        rate_limit_key_prefix="rate",
        rate_limit=120,
        rate_limit_window_seconds=60,
        email_verification_key_prefix="email_verify",
        email_verification_ttl_seconds=3600,
        email_verification_token_bytes=32,
    )


def test_memory_session_store_supports_oss_single_controller_contract() -> None:
    async def run() -> None:
        store = MemorySessionStore(session_config())
        await store.connect()
        session = await store.create_session(
            "user-1",
            ["user"],
            "ws-1",
            display_name="Local User",
            email="local@example.com",
        )
        assert await store.get_session(session.token) == session
        assert await store.touch_session(session.token) is True

        token = await store.create_email_verification_token("user-1", "user@example.com")
        assert await store.consume_email_verification_token(token) == {
            "user_id": "user-1",
            "email": "user@example.com",
        }
        assert await store.consume_email_verification_token(token) is None

        await store.check_rate_limit("login", limit=1, window_seconds=60)
        with pytest.raises(RateLimitExceeded):
            await store.check_rate_limit("login", limit=1, window_seconds=60)

        await store.delete_session(session.token)
        assert await store.get_session(session.token) is None
        await store.close()

    asyncio.run(run())


def test_email_verification_token_is_consumed_once() -> None:
    store = RedisSessionStore(session_config())
    redis = StubRedisClient()
    redis.values["email_verify:token-1"] = json.dumps(
        {"user_id": "user-1", "email": "user@example.com"}
    )
    store.client = redis  # type: ignore[assignment]

    first = asyncio.run(store.consume_email_verification_token("token-1"))
    second = asyncio.run(store.consume_email_verification_token("token-1"))

    assert first == {"user_id": "user-1", "email": "user@example.com"}
    assert second is None
    assert redis.get_calls == 0
    assert redis.delete_calls == 0


def test_touch_session_extends_session_ttl_without_reading_payload() -> None:
    store = RedisSessionStore(session_config())
    redis = StubRedisClient()
    redis.values["session:token-1"] = json.dumps(
        {"user_id": "user-1", "roles": ["user"], "workspace_id": "default"}
    )
    store.client = redis  # type: ignore[assignment]

    touched = asyncio.run(store.touch_session("token-1"))

    assert touched is True
    assert redis.expire_calls == [("session:token-1", 60)]
    assert redis.get_calls == 0


def test_touch_session_returns_false_for_missing_token() -> None:
    store = RedisSessionStore(session_config())
    redis = StubRedisClient()
    store.client = redis  # type: ignore[assignment]

    touched = asyncio.run(store.touch_session("missing-token"))

    assert touched is False
    assert redis.expire_calls == [("session:missing-token", 60)]
