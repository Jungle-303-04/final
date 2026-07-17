from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from fastapi import Request, Response
from fastapi.routing import APIRoute

from domains.identity import router as identity_router
from domains.identity.dependencies import require_session
from packages.contracts.gateway.requests import (
    EmailCheckRequest,
    LoginRequest,
    ResendEmailVerificationRequest,
    SignupRequest,
    WorkspaceSwitchRequest,
)


class StubEvents:
    def __init__(self) -> None:
        self.bodies: list[Any] = []

    async def accept_body(self, body: Any) -> None:
        self.bodies.append(body)


class StubPasswordAuth:
    def __init__(self) -> None:
        self.deleted: str | None = None
        self.calls: list[tuple[str, tuple[Any, ...]]] = []
        self.sessions = SimpleNamespace(touched=[])

        async def touch_session(token: str | None) -> bool:
            self.sessions.touched.append(token)
            return bool(token)

        self.sessions.touch_session = touch_session
        self.email_available = True
        self.identity = {
            "display_name": "Local User",
            "email": "local@example.com",
        }

        self.session_authority = {
            **self.identity,
            "groups": ["group-platform", "group-release"],
            "roles": ["user"],
        }
        self.workspaces = [
            {"workspace_id": "default", "name": "Default", "slug": "default"},
            {"workspace_id": "workspace-b", "name": "Workspace B", "slug": "workspace-b"},
        ]

    def user_identity(self, _user_id: str) -> dict[str, str] | None:
        return self.identity

    def session_identity(self, _user_id: str, _workspace_id: str) -> dict[str, Any] | None:
        return self.session_authority

    def list_authorized_workspaces(self, _current: Any) -> list[dict[str, str]]:
        return self.workspaces

    async def switch_workspace(self, current: Any, workspace_id: str) -> Any:
        self.calls.append(("switch_workspace", (current.token, workspace_id)))
        return SimpleNamespace(
            token="switched-token",
            user_id=current.user_id,
            roles=list(current.roles),
            workspace_id=workspace_id,
            display_name="Local User",
            email="local@example.com",
            auth_mode=getattr(current, "auth_mode", "password"),
        )

    async def signup(
        self, email: str, password: str, password_confirm: str, client_key: str
    ) -> Any:
        self.calls.append(("signup", (email, password, password_confirm, client_key)))
        return SimpleNamespace(
            token="email-token",
            user_id="user-1",
            email="local@example.com",
            expires_in_seconds=3600,
        )

    async def login(self, email: str, password: str, client_key: str) -> Any:
        self.calls.append(("login", (email, password, client_key)))
        return SimpleNamespace(
            token="login-token",
            user_id="user-1",
            roles=["service_admin"],
            workspace_id="default",
            display_name="Local User",
            email="local@example.com",
        )

    async def check_email_available(self, email: str, client_key: str) -> bool:
        self.calls.append(("check_email_available", (email, client_key)))
        return self.email_available

    async def resend_email_verification(self, email: str, password: str, client_key: str) -> Any:
        self.calls.append(("resend_email_verification", (email, password, client_key)))
        return SimpleNamespace(
            token="email-token-2",
            user_id="user-1",
            email="local@example.com",
            expires_in_seconds=3600,
        )

    async def logout(self, token: str | None) -> None:
        self.deleted = token

    async def verify_email(self, token: str) -> Any:
        self.calls.append(("verify_email", (token,)))
        return SimpleNamespace(
            user_id="user-1",
            status="active",
            roles=["service_admin"],
            workspace_id="default",
            session=SimpleNamespace(
                token="verified-session-token",
                user_id="user-1",
                roles=["service_admin"],
                workspace_id="default",
            ),
        )

    async def approve_user(self, user_id: str, workspace_id: str) -> Any:
        self.calls.append(("approve_user", (user_id, workspace_id)))
        return {
            "user_id": user_id,
            "status": "active",
            "role": "user",
            "workspace_id": workspace_id,
        }


def test_signup_requests_email_verification_without_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://app.example.test")
    password_auth = StubPasswordAuth()
    events = StubEvents()
    request = Request({"type": "http", "headers": []})

    async def run() -> Any:
        return await identity_router.signup(
            SignupRequest(
                email="local@example.com",
                password="local-password",
                password_confirm="local-password",
            ),
            password_auth=password_auth,
            events=events,
            request=request,
        )

    body = asyncio.run(run())

    assert body.accepted is True
    assert body.verification_required is True
    assert body.email == "local@example.com"
    assert events.bodies[0].email == "local@example.com"
    assert events.bodies[0].verification_url.startswith(
        "https://app.example.test/api/auth/verify-email?token="
    )
    assert events.bodies[0].expires_in_seconds == 3600


def test_resend_verification_requests_email_without_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://app.example.test")
    password_auth = StubPasswordAuth()
    events = StubEvents()
    request = Request({"type": "http", "headers": []})

    async def run() -> Any:
        return await identity_router.resend_verification(
            ResendEmailVerificationRequest(
                email="local@example.com",
                password="local-password",
            ),
            password_auth=password_auth,
            events=events,
            request=request,
        )

    body = asyncio.run(run())

    assert body.accepted is True
    assert body.verification_required is True
    assert events.bodies[0].verification_url.startswith(
        "https://app.example.test/api/auth/verify-email?token=email-token-2"
    )


def test_check_email_reports_availability_without_session() -> None:
    password_auth = StubPasswordAuth()
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 12345)})

    async def run() -> Any:
        return await identity_router.check_email(
            EmailCheckRequest(email="local@example.com"),
            request=request,
            password_auth=password_auth,
        )

    body = asyncio.run(run())

    assert body.available is True
    assert password_auth.calls == [("check_email_available", ("local@example.com", "127.0.0.1"))]


def test_check_email_reports_existing_account() -> None:
    password_auth = StubPasswordAuth()
    password_auth.email_available = False
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 12345)})

    async def run() -> Any:
        return await identity_router.check_email(
            EmailCheckRequest(email="local@example.com"),
            request=request,
            password_auth=password_auth,
        )

    body = asyncio.run(run())

    assert body.available is False
    assert body.reason_code == "already_registered"
    assert body.detail == "이미 가입된 이메일입니다."


def test_login_sets_httponly_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    monkeypatch.delenv("SESSION_TTL_SECONDS", raising=False)
    response = Response()
    password_auth = StubPasswordAuth()
    request = Request({"type": "http", "headers": [], "client": ("127.0.0.1", 12345)})

    async def run() -> Any:
        return await identity_router.login(
            LoginRequest(email="local@example.com", password="local-password"),
            request=request,
            response=response,
            password_auth=password_auth,
        )

    body = asyncio.run(run())
    cookie = response.headers["set-cookie"].lower()

    assert body.authenticated is True
    assert body.workspace_id == "default"
    assert body.display_name == "Local User"
    assert body.email == "local@example.com"
    assert password_auth.calls == [("login", ("local@example.com", "local-password", "127.0.0.1"))]
    assert "service_session=login-token" in cookie
    assert "httponly" in cookie
    assert "max-age=7200" in cookie


def test_existing_session_resolves_human_profile_identity() -> None:
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(
        token="existing-token",
        user_id="user-1",
        roles=["service_admin"],
        workspace_id="default",
    )

    body = asyncio.run(identity_router.session(current=current, password_auth=password_auth))

    assert body.display_name == "Local User"
    assert body.email == "local@example.com"


def test_password_session_exposes_storage_owned_auth_context_without_source_only_role() -> None:
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(
        token="existing-token",
        user_id="user-1",
        roles=["stale-session-role"],
        workspace_id="default",
    )

    body = asyncio.run(identity_router.session(current=current, password_auth=password_auth))

    assert body.auth_enabled is True
    assert body.auth_mode == "password"
    assert body.user_id == "user-1"
    assert body.groups == ["group-platform", "group-release"]
    assert body.roles == ["user"]
    assert body.logout.action == "end_session"
    assert body.logout.supported is True
    assert body.logout.reauthentication_expected is False
    assert "cloud_role" not in body.model_dump()
    assert "redirect_url" not in body.logout.model_dump()


def test_trusted_proxy_session_exposes_non_terminating_logout_semantics() -> None:
    password_auth = StubPasswordAuth()
    password_auth.session_authority = None
    current = SimpleNamespace(
        token="mtls-dev-console",
        user_id="operator-dev",
        roles=["service_admin"],
        workspace_id="default",
    )

    body = asyncio.run(identity_router.session(current=current, password_auth=password_auth))

    assert body.auth_enabled is True
    assert body.auth_mode == "trusted_proxy"
    assert body.groups == []
    assert body.roles == ["service_admin"]
    assert body.logout.action == "upstream_identity_required"
    assert body.logout.supported is False
    assert body.logout.reauthentication_expected is True


def test_session_refresh_route_is_guarded_by_require_session() -> None:
    route = next(
        route
        for route in identity_router.router.routes
        if isinstance(route, APIRoute)
        and route.path == "/auth/session/refresh"
        and "POST" in route.methods
    )

    assert any(dependency.call is require_session for dependency in route.dependant.dependencies)


def test_workspace_routes_are_guarded_by_require_session() -> None:
    routes = {
        route.path: route for route in identity_router.router.routes if isinstance(route, APIRoute)
    }

    for path in ("/auth/workspaces", "/auth/workspaces/switch"):
        assert any(
            dependency.call is require_session for dependency in routes[path].dependant.dependencies
        )


def test_workspace_catalog_returns_only_authorized_store_records() -> None:
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(workspace_id="default")

    body = asyncio.run(
        identity_router.list_workspaces(current=current, password_auth=password_auth)
    )

    assert body.current_workspace_id == "default"
    assert [item.workspace_id for item in body.items] == ["default", "workspace-b"]


def test_workspace_switch_sets_secure_scoped_cookie_and_returns_refreshed_authority(
    monkeypatch,
) -> None:
    monkeypatch.delenv("COOKIE_SECURE", raising=False)
    response = Response()
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(
        token="proxy-scoped-token",
        user_id="operator-dev",
        roles=["service_admin"],
        workspace_id="default",
        auth_mode="trusted_proxy",
    )

    body = asyncio.run(
        identity_router.switch_workspace(
            WorkspaceSwitchRequest(workspace_id="workspace-b"),
            response=response,
            current=current,
            password_auth=password_auth,
        )
    )
    cookie = response.headers["set-cookie"].lower()

    assert body.workspace_id == "workspace-b"
    assert body.auth_mode == "trusted_proxy"
    assert password_auth.calls == [("switch_workspace", ("proxy-scoped-token", "workspace-b"))]
    assert "service_session=switched-token" in cookie
    assert "httponly" in cookie
    assert "secure" in cookie
    assert "samesite=lax" in cookie
    assert "path=/" in cookie


def test_session_refresh_touches_store_and_resets_httponly_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    monkeypatch.delenv("SESSION_TTL_SECONDS", raising=False)
    response = Response()
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(
        token="login-token",
        user_id="user-1",
        roles=["service_admin"],
        workspace_id="default",
    )

    async def run() -> Any:
        return await identity_router.refresh_session(
            response=response,
            current=current,
            password_auth=password_auth,
        )

    body = asyncio.run(run())
    cookie = response.headers["set-cookie"].lower()

    assert body.authenticated is True
    assert body.user_id == "user-1"
    assert password_auth.sessions.touched == ["login-token"]
    assert "service_session=login-token" in cookie
    assert "httponly" in cookie
    assert "max-age=7200" in cookie


def test_mtls_proxy_session_refresh_does_not_create_redis_session_or_cookie() -> None:
    response = Response()
    password_auth = StubPasswordAuth()
    current = SimpleNamespace(
        token="mtls-dev-console",
        user_id="operator-dev",
        roles=["service_admin"],
        workspace_id="default",
    )

    body = asyncio.run(
        identity_router.refresh_session(
            response=response,
            current=current,
            password_auth=password_auth,
        )
    )

    assert body.authenticated is True
    assert body.user_id == "operator-dev"
    assert password_auth.sessions.touched == []
    assert "set-cookie" not in response.headers


def test_verify_email_redirects_and_sets_httponly_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    password_auth = StubPasswordAuth()

    async def run() -> Any:
        return await identity_router.verify_email(
            token="email-token",
            redirect="/dashboard",
            password_auth=password_auth,
        )

    response = asyncio.run(run())
    cookie = response.headers["set-cookie"].lower()

    assert response.status_code == 303
    assert response.headers["location"] == "/dashboard"
    assert "service_session=verified-session-token" in cookie
    assert "httponly" in cookie


def test_verify_email_rejects_external_redirect(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    password_auth = StubPasswordAuth()

    async def run() -> Any:
        return await identity_router.verify_email(
            token="email-token",
            redirect="https://evil.example.test",
            password_auth=password_auth,
        )

    response = asyncio.run(run())

    assert response.status_code == 303
    assert response.headers["location"] == "/login?verified=1"


def test_verify_email_pending_approval_redirects_without_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    password_auth = StubPasswordAuth()

    async def pending_verify(_token: str) -> Any:
        return SimpleNamespace(
            user_id="user-2",
            status="pending_approval",
            roles=["user"],
            workspace_id="default",
            session=None,
        )

    password_auth.verify_email = pending_verify  # type: ignore[method-assign]

    async def run() -> Any:
        return await identity_router.verify_email(
            token="email-token",
            redirect="/dashboard",
            password_auth=password_auth,
        )

    response = asyncio.run(run())

    assert response.status_code == 303
    assert response.headers["location"] == "/login?verified=1&approval=pending"
    assert "set-cookie" not in response.headers


def test_admin_can_approve_pending_user() -> None:
    password_auth = StubPasswordAuth()

    async def run() -> Any:
        return await identity_router.approve_user(
            user_id="user-2",
            current=SimpleNamespace(
                token="login-token",
                user_id="admin-user",
                roles=["service_admin"],
                workspace_id="default",
            ),
            password_auth=password_auth,
        )

    body = asyncio.run(run())

    assert body.accepted is True
    assert body.user_id == "user-2"
    assert body.status == "active"
    assert body.workspace_id == "default"


def test_logout_deletes_session_and_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    response = Response()
    password_auth = StubPasswordAuth()

    async def run() -> Any:
        return await identity_router.logout(
            response=response,
            current=SimpleNamespace(
                token="login-token",
                user_id="user-1",
                roles=["service_admin"],
                workspace_id="default",
            ),
            password_auth=password_auth,
        )

    body = asyncio.run(run())
    cookie = response.headers["set-cookie"].lower()

    assert body.authenticated is False
    assert password_auth.deleted == "login-token"
    assert "service_session=" in cookie
    assert "max-age=0" in cookie
