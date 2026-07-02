from __future__ import annotations

import asyncio
import json

from packages.storage.sessions import RedisSessionStore, RedisSessionStoreConfig


class FakeRedisClient:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}
        self.get_calls = 0
        self.delete_calls = 0

    async def getdel(self, key: str) -> str | None:
        return self.values.pop(key, None)

    async def get(self, key: str) -> str | None:
        self.get_calls += 1
        return self.values.get(key)

    async def delete(self, key: str) -> None:
        self.delete_calls += 1
        self.values.pop(key, None)


def session_config() -> RedisSessionStoreConfig:
    return RedisSessionStoreConfig(
        url="redis://localhost:6379/0",
        ttl_seconds=60,
        key_prefix="session",
        token_bytes=32,
        default_roles=("member",),
        default_workspace_id="default",
        rate_limit_key_prefix="rate",
        rate_limit=120,
        rate_limit_window_seconds=60,
        email_verification_key_prefix="email_verify",
        email_verification_ttl_seconds=3600,
        email_verification_token_bytes=32,
    )


def test_email_verification_token_is_consumed_once() -> None:
    store = RedisSessionStore(session_config())
    redis = FakeRedisClient()
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
