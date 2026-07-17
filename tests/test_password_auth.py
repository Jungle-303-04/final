from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException, Request

ROOT_DIR = Path(__file__).resolve().parents[1]
AUTH_PATH = ROOT_DIR / "src" / "services" / "gateway" / "api-gateway" / "auth.py"


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


def test_session_identity_uses_active_user_role_and_workspace_groups() -> None:
    auth = load_auth_module()
    users = StubUserStore(
        {
            "operator@example.com": {
                "user_id": "user-1",
                "email": "operator@example.com",
                "display_name": "Operator",
                "status": "active",
                "role": "user",
                "workspace_id": "workspace-a",
                "groups": ["group-release", "group-platform"],
            },
        }
    )
    service = auth.PasswordAuthService(users, StubSessionStore(auth))

    assert service.session_identity("user-1", "workspace-a") == {
        "display_name": "Operator",
        "email": "operator@example.com",
        "groups": ["group-release", "group-platform"],
        "roles": ["user"],
    }


class StubUserStore:
    def __init__(self, users: dict[str, dict[str, Any]]) -> None:
        self.users = users
        self.organization_members: dict[str, dict[str, str]] = {}

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        return self.users.get(email)

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        return self._find_user(user_id)

    def create_user(
        self,
        user_id: str,
        email: str,
        password_hash: str,
        display_name: str,
        status: str,
        role: str,
    ) -> dict[str, Any] | None:
        if email in self.users:
            return None
        user = {
            "user_id": user_id,
            "email": email,
            "password_hash": password_hash,
            "display_name": display_name,
            "status": status,
            "role": role,
        }
        self.users[email] = user
        return user

    def complete_email_verification(self, user_id: str) -> dict[str, Any] | None:
        user = self._find_user(user_id)
        if user is None:
            return None
        if self._has_organization_owner():
            user["status"] = "pending_approval"
            user["role"] = "user"
            return user
        user["status"] = "active"
        user["role"] = "service_admin"
        user["workspace_id"] = "default"
        self.organization_members[user_id] = {"workspace_id": "default", "role": "owner"}
        return user

    def approve_user(self, user_id: str, workspace_id: str) -> dict[str, Any] | None:
        user = self._find_user(user_id)
        if user is None or user.get("status") != "pending_approval":
            return None
        user["status"] = "active"
        user["role"] = "user"
        user["workspace_id"] = workspace_id
        self.organization_members[user_id] = {"workspace_id": workspace_id, "role": "member"}
        return user

    def get_default_workspace_id_for_user(self, user_id: str) -> str | None:
        if user_id in self.organization_members:
            return self.organization_members[user_id]["workspace_id"]
        user = self._find_user(user_id)
        if user is not None and user.get("workspace_id"):
            return str(user["workspace_id"])
        return None

    def list_active_group_ids_for_user(self, user_id: str, workspace_id: str) -> list[str]:
        user = self._find_user(user_id)
        if user is None or user.get("workspace_id") != workspace_id:
            return []
        return [str(group_id) for group_id in user.get("groups", [])]

    def _find_user(self, user_id: str) -> dict[str, Any] | None:
        for user in self.users.values():
            if user.get("user_id") == user_id or user.get("id") == user_id:
                return user
        return None

    def _has_organization_owner(self) -> bool:
        return any(member["role"] == "owner" for member in self.organization_members.values())


class StubSessionStore:
    def __init__(self, auth_module) -> None:
        self.auth_module = auth_module
        self.sessions: dict[str, Any] = {}
        self.email_tokens: dict[str, dict[str, str]] = {}
        self.rate_checks: list[tuple[Any, ...]] = []
        self.block_rate_limit = False

    async def create_session(
        self,
        user_id: str,
        roles: list[str] | None = None,
        workspace_id: str | None = None,
        display_name: str | None = None,
        email: str | None = None,
    ) -> Any:
        # Redis 대신 dict에 저장해서 PasswordAuthService 흐름만 검증.
        token = f"token-{len(self.sessions) + 1}"
        session = self.auth_module.AuthSession(
            token,
            user_id,
            roles or [self.auth_module.ServiceRole.USER.value],
            workspace_id or "default",
            display_name,
            email,
        )
        self.sessions[token] = session
        return session

    async def get_session(self, token: str | None) -> Any | None:
        return self.sessions.get(token or "")

    async def delete_session(self, token: str) -> None:
        self.sessions.pop(token, None)

    async def check_rate_limit(
        self,
        key: str,
        limit: int | None = None,
        window_seconds: int | None = None,
    ) -> None:
        self.rate_checks.append(("plain", key, limit, window_seconds))
        if self.block_rate_limit:
            raise self.auth_module.RateLimitExceeded

    async def check_escalating_rate_limit(
        self,
        key: str,
        limit: int,
        window_seconds: int,
        lock_steps_seconds: tuple[int, ...],
        strike_ttl_seconds: int,
    ) -> None:
        self.rate_checks.append(
            ("escalating", key, limit, window_seconds, lock_steps_seconds, strike_ttl_seconds)
        )
        if self.block_rate_limit:
            raise self.auth_module.RateLimitExceeded(lock_steps_seconds[0])

    async def create_email_verification_token(self, user_id: str, email: str) -> str:
        token = f"email-token-{len(self.email_tokens) + 1}"
        self.email_tokens[token] = {"user_id": user_id, "email": email}
        return token

    async def consume_email_verification_token(self, token: str | None) -> dict[str, str] | None:
        return self.email_tokens.pop(token or "", None)


def test_hash_password_does_not_store_plain_password() -> None:
    auth = load_auth_module()

    password_hash = auth.hash_password("local-password")

    assert password_hash != "local-password"
    assert "local-password" not in password_hash
    assert auth.verify_password("local-password", password_hash)
    assert not auth.verify_password("wrong-password", password_hash)


def test_session_auth_requires_real_session_by_default(monkeypatch) -> None:
    async def run() -> None:
        monkeypatch.delenv("TRUSTED_PROXY_AUTH_SECRET", raising=False)
        auth = load_auth_module()
        sessions = StubSessionStore(auth)
        service = auth.SessionAuthService(sessions)
        request = Request({"type": "http", "headers": []})

        with pytest.raises(HTTPException) as exc:
            await service.require_session(request)

        assert exc.value.status_code == 401
        assert exc.value.detail == auth.Settings.AUTHENTICATION_REQUIRED_MESSAGE

    asyncio.run(run())


def test_session_auth_accepts_mtls_proxy_identity(monkeypatch) -> None:
    async def run() -> None:
        proxy_secret = "a" * 64
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", proxy_secret)
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", "operator-dev")
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", "workspace-dev")
        auth = load_auth_module()
        sessions = StubSessionStore(auth)
        service = auth.SessionAuthService(sessions)
        request = Request(
            {
                "type": "http",
                "headers": [(b"x-kubeheal-internal-auth", proxy_secret.encode())],
            }
        )

        session = await service.require_session(request)

        assert session.token == "mtls-dev-console"
        assert session.user_id == "operator-dev"
        assert session.workspace_id == "workspace-dev"
        assert session.roles == [auth.ServiceRole.SERVICE_ADMIN.value]
        assert sessions.rate_checks == []

    asyncio.run(run())


def test_session_auth_rejects_invalid_mtls_proxy_secret(monkeypatch) -> None:
    async def run() -> None:
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_SECRET", "a" * 64)
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_USER_ID", "operator-dev")
        monkeypatch.setenv("TRUSTED_PROXY_AUTH_WORKSPACE_ID", "workspace-dev")
        auth = load_auth_module()
        sessions = StubSessionStore(auth)
        service = auth.SessionAuthService(sessions)
        request = Request(
            {
                "type": "http",
                "headers": [(b"x-kubeheal-internal-auth", b"wrong")],
            }
        )

        with pytest.raises(HTTPException) as exc:
            await service.require_session(request)
        assert exc.value.status_code == 401

    asyncio.run(run())


def test_password_login_creates_session() -> None:
    async def run() -> None:
        auth = load_auth_module()
        password_hash = auth.hash_password("local-password")
        users = StubUserStore(
            {
                "local@example.com": {
                    "id": "local-user",
                    "email": "local@example.com",
                    "password_hash": password_hash,
                    "display_name": "Local User",
                    "status": "active",
                    "role": "user",
                }
            }
        )
        sessions = StubSessionStore(auth)
        service = auth.PasswordAuthService(users, sessions)

        session = await service.login("local@example.com", "local-password", "127.0.0.1")

        assert session.user_id == "local-user"
        assert session.roles == ["user"]
        assert session.display_name == "Local User"
        assert session.email == "local@example.com"
        assert await sessions.get_session(session.token) == session
        assert len(sessions.rate_checks) == 2

    asyncio.run(run())


def test_password_signup_creates_pending_user_and_verification_token() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore({})
        sessions = StubSessionStore(auth)
        service = auth.PasswordAuthService(users, sessions)

        challenge = await service.signup(
            "LOCAL@example.com", "local-password", "local-password", "127.0.0.1"
        )

        user = users.get_user_by_email("local@example.com")
        assert user is not None
        assert user["display_name"] == "local"
        assert user["status"] == "pending_email_verification"
        assert user["role"] == "user"
        assert user["password_hash"] != "local-password"
        assert auth.verify_password("local-password", user["password_hash"])
        assert challenge.user_id == user["user_id"]
        assert challenge.token == "email-token-1"
        assert sessions.sessions == {}
        assert len(sessions.rate_checks) == 2

    asyncio.run(run())


def test_password_signup_assigns_member_even_after_bootstrap_admin() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "admin@example.com": {
                    "user_id": "admin-user",
                    "email": "admin@example.com",
                    "password_hash": auth.hash_password("admin-password"),
                    "display_name": "Admin",
                    "status": "active",
                    "role": "service_admin",
                }
            }
        )
        sessions = StubSessionStore(auth)
        service = auth.PasswordAuthService(users, sessions)

        await service.signup("member@example.com", "local-password", "local-password", "127.0.0.1")

        member = users.get_user_by_email("member@example.com")
        assert member is not None
        assert member["role"] == "user"

    asyncio.run(run())


def test_password_signup_rejects_password_confirmation_mismatch() -> None:
    async def run() -> None:
        auth = load_auth_module()
        service = auth.PasswordAuthService(StubUserStore({}), StubSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.signup(
                "local@example.com", "local-password", "different-password", "127.0.0.1"
            )
        assert exc.value.status_code == 400
        assert exc.value.detail == "password confirmation does not match"

    asyncio.run(run())


def test_password_signup_rejects_duplicate_email() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "active",
                    "role": "service_admin",
                }
            }
        )
        service = auth.PasswordAuthService(users, StubSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.signup(
                "LOCAL@example.com", "local-password", "local-password", "127.0.0.1"
            )
        assert exc.value.status_code == 409
        assert exc.value.detail == "user already exists"

    asyncio.run(run())


def test_password_signup_rate_limit_blocks_before_user_lookup() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore({})
        sessions = StubSessionStore(auth)
        sessions.block_rate_limit = True
        service = auth.PasswordAuthService(users, sessions)

        with pytest.raises(HTTPException) as exc:
            await service.signup(
                "local@example.com", "local-password", "local-password", "127.0.0.1"
            )
        assert exc.value.status_code == 429
        assert users.users == {}

    asyncio.run(run())


def test_password_login_rate_limit_blocks_before_password_check() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "active",
                    "role": "service_admin",
                }
            }
        )
        sessions = StubSessionStore(auth)
        sessions.block_rate_limit = True
        service = auth.PasswordAuthService(users, sessions)

        with pytest.raises(HTTPException) as exc:
            await service.login("local@example.com", "local-password", "127.0.0.1")
        assert exc.value.status_code == 429
        assert sessions.sessions == {}

    asyncio.run(run())


def test_resend_verification_requires_pending_password_and_issues_new_token() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "pending_email_verification",
                    "role": "service_admin",
                }
            }
        )
        sessions = StubSessionStore(auth)
        service = auth.PasswordAuthService(users, sessions)

        challenge = await service.resend_email_verification(
            "local@example.com", "local-password", "127.0.0.1"
        )

        assert challenge is not None
        assert challenge.token == "email-token-1"
        assert challenge.user_id == "local-user"

    asyncio.run(run())


def test_password_login_rejects_pending_email_verification() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "pending_email_verification",
                    "role": "service_admin",
                }
            }
        )
        service = auth.PasswordAuthService(users, StubSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.login("local@example.com", "local-password", "127.0.0.1")
        assert exc.value.status_code == 403
        assert exc.value.detail["code"] == "email_unverified"

    asyncio.run(run())


def test_verify_email_activates_user_and_creates_session() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "pending_email_verification",
                    "role": "user",
                }
            }
        )
        sessions = StubSessionStore(auth)
        sessions.email_tokens["email-token-1"] = {
            "user_id": "local-user",
            "email": "local@example.com",
        }
        service = auth.PasswordAuthService(users, sessions)

        result = await service.verify_email("email-token-1")

        assert users.get_user_by_email("local@example.com")["status"] == "active"
        assert result.session is not None
        session = result.session
        assert session.user_id == "local-user"
        assert session.roles == ["service_admin"]
        assert session.workspace_id == "default"
        assert result.workspace_id == "default"
        assert await sessions.get_session(session.token) == session
        assert "email-token-1" not in sessions.email_tokens

    asyncio.run(run())


def test_verify_email_after_bootstrap_requires_admin_approval() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "member@example.com": {
                    "user_id": "member-user",
                    "email": "member@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Member",
                    "status": "pending_email_verification",
                    "role": "user",
                }
            }
        )
        users.organization_members["admin-user"] = {"workspace_id": "default", "role": "owner"}
        sessions = StubSessionStore(auth)
        sessions.email_tokens["email-token-1"] = {
            "user_id": "member-user",
            "email": "member@example.com",
        }
        service = auth.PasswordAuthService(users, sessions)

        result = await service.verify_email("email-token-1")

        user = users.get_user_by_email("member@example.com")
        assert user is not None
        assert user["status"] == "pending_approval"
        assert user["role"] == "user"
        assert result.session is None
        assert result.workspace_id == "default"
        assert sessions.sessions == {}

    asyncio.run(run())


def test_password_login_rejects_pending_approval() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "user_id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "pending_approval",
                    "role": "user",
                }
            }
        )
        service = auth.PasswordAuthService(users, StubSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.login("local@example.com", "local-password", "127.0.0.1")
        assert exc.value.status_code == 403
        assert exc.value.detail["code"] == "approval_pending"

    asyncio.run(run())


def test_admin_approval_activates_member_in_workspace() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "member@example.com": {
                    "user_id": "member-user",
                    "email": "member@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Member",
                    "status": "pending_approval",
                    "role": "user",
                }
            }
        )
        service = auth.PasswordAuthService(users, StubSessionStore(auth))

        user = await service.approve_user("member-user", "default")

        assert user["status"] == "active"
        assert user["role"] == "user"
        assert users.get_default_workspace_id_for_user("member-user") == "default"

    asyncio.run(run())


def test_password_login_rejects_wrong_password() -> None:
    async def run() -> None:
        auth = load_auth_module()
        users = StubUserStore(
            {
                "local@example.com": {
                    "id": "local-user",
                    "email": "local@example.com",
                    "password_hash": auth.hash_password("local-password"),
                    "display_name": "Local User",
                    "status": "active",
                    "role": "user",
                }
            }
        )
        service = auth.PasswordAuthService(users, StubSessionStore(auth))

        with pytest.raises(HTTPException) as exc:
            await service.login("local@example.com", "wrong-password", "127.0.0.1")
        assert exc.value.status_code == 401
        assert exc.value.detail["code"] == "invalid_credentials"

    asyncio.run(run())


def test_password_logout_deletes_session() -> None:
    async def run() -> None:
        auth = load_auth_module()
        sessions = StubSessionStore(auth)
        service = auth.PasswordAuthService(StubUserStore({}), sessions)
        session = await sessions.create_session("local-user", ["service_admin"])

        await service.logout(session.token)

        assert await sessions.get_session(session.token) is None

    asyncio.run(run())
