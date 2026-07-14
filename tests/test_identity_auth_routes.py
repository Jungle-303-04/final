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

    def user_identity(self, _user_id: str) -> dict[str, str] | None:
        return self.identity

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


def test_session_refresh_route_is_guarded_by_require_session() -> None:
    route = next(
        route
        for route in identity_router.router.routes
        if isinstance(route, APIRoute)
        and route.path == "/auth/session/refresh"
        and "POST" in route.methods
    )

    assert any(dependency.call is require_session for dependency in route.dependant.dependencies)


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
