from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from fastapi import Request, Response

from domains.identity import router as identity_router
from packages.contracts.gateway.requests import (
    LoginRequest,
    ResendEmailVerificationRequest,
    SignupRequest,
)


class FakeEvents:
    def __init__(self) -> None:
        self.bodies: list[Any] = []

    async def accept_body(self, body: Any) -> None:
        self.bodies.append(body)


class FakePasswordAuth:
    def __init__(self) -> None:
        self.deleted: str | None = None
        self.calls: list[tuple[str, tuple[Any, ...]]] = []

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

    async def login(self, email: str, password: str) -> Any:
        self.calls.append(("login", (email, password)))
        return SimpleNamespace(
            token="login-token",
            user_id="user-1",
            roles=["admin"],
            workspace_id="default",
        )

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
            roles=["admin"],
            workspace_id="default",
            session=SimpleNamespace(
                token="verified-session-token",
                user_id="user-1",
                roles=["admin"],
                workspace_id="default",
            ),
        )

    async def approve_user(self, user_id: str, workspace_id: str) -> Any:
        self.calls.append(("approve_user", (user_id, workspace_id)))
        return {
            "user_id": user_id,
            "status": "active",
            "role": "member",
            "workspace_id": workspace_id,
        }


def test_signup_requests_email_verification_without_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://app.example.test")
    password_auth = FakePasswordAuth()
    events = FakeEvents()
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
        "https://app.example.test/auth/verify-email?token="
    )
    assert events.bodies[0].expires_in_seconds == 3600


def test_resend_verification_requests_email_without_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://app.example.test")
    password_auth = FakePasswordAuth()
    events = FakeEvents()
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
        "https://app.example.test/auth/verify-email?token=email-token-2"
    )


def test_login_sets_httponly_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    response = Response()
    password_auth = FakePasswordAuth()

    async def run() -> Any:
        return await identity_router.login(
            LoginRequest(email="local@example.com", password="local-password"),
            response=response,
            password_auth=password_auth,
        )

    body = asyncio.run(run())
    cookie = response.headers["set-cookie"].lower()

    assert body.authenticated is True
    assert body.workspace_id == "default"
    assert "service_session=login-token" in cookie
    assert "httponly" in cookie


def test_verify_email_redirects_and_sets_httponly_session_cookie(monkeypatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")
    password_auth = FakePasswordAuth()

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
    password_auth = FakePasswordAuth()

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
    password_auth = FakePasswordAuth()

    async def pending_verify(_token: str) -> Any:
        return SimpleNamespace(
            user_id="user-2",
            status="pending_approval",
            roles=["member"],
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
    password_auth = FakePasswordAuth()

    async def run() -> Any:
        return await identity_router.approve_user(
            user_id="user-2",
            current=SimpleNamespace(
                token="login-token",
                user_id="admin-user",
                roles=["admin"],
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
    password_auth = FakePasswordAuth()

    async def run() -> Any:
        return await identity_router.logout(
            response=response,
            current=SimpleNamespace(
                token="login-token",
                user_id="user-1",
                roles=["admin"],
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
