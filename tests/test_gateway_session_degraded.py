from __future__ import annotations

import time
from typing import Any

from conftest import ROOT, load_file
from fastapi.testclient import TestClient


def load_gateway_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "gateway" / "api-gateway" / "gateway.py",
        "test_api_gateway_session_degraded_module",
    )


def test_gateway_starts_fail_closed_during_session_redis_outage_and_recovers(
    monkeypatch,
) -> None:
    """A Redis outage may not bypass session authority or stop operation streaming."""

    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@postgresql:5432/service")
    gateway = load_gateway_module()
    import packages.runtime.operation_events as operation_events
    import packages.storage.sessions as session_storage

    recovery_allowed = {"value": False}
    session_urls: list[str] = []
    broker_urls: list[str] = []

    class UnavailableRedis:
        async def ping(self) -> None:
            raise ConnectionError("redis unavailable")

        async def aclose(self) -> None:
            return None

    class SessionRedis:
        async def ping(self) -> None:
            return None

        async def get(self, _key: str) -> None:
            return None

        async def aclose(self) -> None:
            return None

    class PubSub:
        async def psubscribe(self, *_channels: str) -> None:
            return None

        async def listen(self):
            while True:
                await __import__("asyncio").sleep(3600)
                yield None

        async def aclose(self) -> None:
            return None

    class BrokerRedis(SessionRedis):
        def pubsub(self, **_kwargs: object) -> PubSub:
            return PubSub()

    def session_client(_url: str, **_kwargs: object) -> UnavailableRedis | SessionRedis:
        session_urls.append(_url)
        return SessionRedis() if recovery_allowed["value"] else UnavailableRedis()

    def broker_client(_url: str) -> UnavailableRedis | BrokerRedis:
        broker_urls.append(_url)
        return BrokerRedis() if recovery_allowed["value"] else UnavailableRedis()

    class Database:
        def check_ready(self) -> None:
            return None

        async def dispose_async(self) -> None:
            return None

        def dispose(self) -> None:
            return None

    class EventBus:
        async def connect(self) -> None:
            return None

        async def close(self) -> None:
            return None

    async def wait_for_database(_db: Any) -> None:
        return None

    monkeypatch.setattr(gateway, "Database", Database)
    monkeypatch.setattr(gateway, "wait_for_database", wait_for_database)
    monkeypatch.setattr(gateway, "validate_test_scenario_catalog", lambda: None)
    monkeypatch.setattr(gateway, "assert_trusted_proxy_config_safe", lambda: None)
    monkeypatch.setattr(
        session_storage.AsyncRedis,
        "from_url",
        staticmethod(session_client),
    )
    monkeypatch.setattr(operation_events, "_redis_client", broker_client)
    monkeypatch.setattr(
        session_storage,
        "SESSION_STORE_RECONNECT_INITIAL_SECONDS",
        0.05,
        raising=False,
    )
    monkeypatch.setattr(
        session_storage,
        "SESSION_STORE_RECONNECT_MAX_SECONDS",
        0.05,
        raising=False,
    )
    monkeypatch.setattr(operation_events, "OPERATION_EVENT_RECONNECT_INITIAL_SECONDS", 0.05)
    monkeypatch.setattr(operation_events, "OPERATION_EVENT_RECONNECT_MAX_SECONDS", 0.05)

    service = gateway.ApiGateway(event_bus=EventBus())

    with TestClient(service.app, raise_server_exceptions=False) as client:
        assert session_urls and broker_urls
        assert session_urls[0] == broker_urls[0]
        assert client.get("/healthz").status_code == 200
        ready = client.get("/readyz")
        assert ready.status_code == 503
        assert ready.json() == {"detail": "session storage unavailable"}

        denied = client.get("/auth/session", headers={"x-session-token": "known-token"})
        assert denied.status_code == 503
        assert denied.json() == {"detail": "session storage unavailable"}
        assert denied.headers["retry-after"] == "1"

        recovery_allowed["value"] = True
        for _ in range(100):
            if (
                client.get("/readyz").status_code == 200
                and service.operation_events._client is not None
            ):
                break
            time.sleep(0.01)
        else:
            raise AssertionError("session store and operation broker did not recover")

        assert (
            client.get("/auth/session", headers={"x-session-token": "known-token"}).status_code
            == 401
        )
