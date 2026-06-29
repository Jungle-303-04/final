from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

ROOT_DIR = Path(__file__).resolve().parents[1]
AUTH_PATH = ROOT_DIR / "services" / "api-gateway" / "auth.py"


def load_auth_module():
    spec = importlib.util.spec_from_file_location("test_api_gateway_auth", AUTH_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {AUTH_PATH}")
    module = importlib.util.module_from_spec(spec)
    previous_settings = sys.modules.pop("settings", None)
    sys.path.insert(0, str(AUTH_PATH.parent))
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(AUTH_PATH.parent))
        sys.modules.pop("settings", None)
        sys.modules.pop(spec.name, None)
        if previous_settings is not None:
            sys.modules["settings"] = previous_settings


class FakeUserStore:
    def __init__(self, users: dict[str, dict[str, Any]]) -> None:
        self.users = users

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        return self.users.get(email)


class FakeSessionStore:
    def __init__(self, auth_module) -> None:
        self.auth_module = auth_module
        self.sessions: dict[str, Any] = {}

    async def create_session(self, user_id: str, roles: list[str] | None = None) -> Any:
        # Redis 대신 dict에 저장해서 PasswordAuthService 흐름만 검증한다.
        token = f"token-{len(self.sessions) + 1}"
        session = self.auth_module.AuthSession(token, user_id, roles or ["owner"])
        self.sessions[token] = session
        return session

    async def get_session(self, token: str | None) -> Any | None:
        return self.sessions.get(token or "")

    async def delete_session(self, token: str) -> None:
        self.sessions.pop(token, None)


def test_hash_password_does_not_store_plain_password() -> None:
    auth = load_auth_module()

    password_hash = auth.hash_password("local-password")

    assert password_hash != "local-password"
    assert "local-password" not in password_hash
    assert auth.verify_password("local-password", password_hash)
    assert not auth.verify_password("wrong-password", password_hash)


def test_password_login_creates_session() -> None:
    async def run() -> None:
        auth = load_auth_module()
        password_hash = auth.hash_password("local-password")
        users = FakeUserStore(
            {
                "local@example.com": {
                    "id": "local-user",
                    "email": "local@example.com",
                    "password_hash": password_hash,
                    "display_name": "Local User",
                    "status": "active",
                }
            }
        )
        sessions = FakeSessionStore(auth)
        service = auth.PasswordAuthService(users, sessions)

        session = await service.login("local@example.com", "local-password")

        assert session.user_id == "local-user"
        assert session.roles == ["owner"]
        assert await sessions.get_session(session.token) == session

    asyncio.run(run())


def test_password_login_rejects_wrong_password() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = FakeUserStore(
            {
                "local@example.com": {
                    "id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "active",
                }
            }
        )
        service = auth.PasswordAuthService(users, FakeSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.login("local@example.com", "wrong-password")
        assert exc.value.status_code == 401
        assert exc.value.detail == "invalid email or password"

    asyncio.run(run())


def test_password_logout_deletes_session() -> None:
    async def run() -> None:
        auth = load_auth_module()
        sessions = FakeSessionStore(auth)
        service = auth.PasswordAuthService(FakeUserStore({}), sessions)
        session = await sessions.create_session("local-user", ["owner"])

        await service.logout(session.token)

        assert await sessions.get_session(session.token) is None

    asyncio.run(run())
