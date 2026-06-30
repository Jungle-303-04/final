"""identity 보안 회귀 — 세션 쿠키와 agent 가드는 fail-closed 로 동작한다."""

from __future__ import annotations

import pytest
from conftest import ROOT, load_file
from fastapi import HTTPException, Request, Response


def test_require_agent_fail_closed_without_token(monkeypatch: pytest.MonkeyPatch) -> None:
    deps = load_file(ROOT / "src" / "domains" / "identity" / "dependencies.py", "id_deps")
    monkeypatch.delenv("AGENT_TOKEN", raising=False)  # 토큰 미설정
    request = Request({"type": "http", "headers": []})
    with pytest.raises(HTTPException) as exc:
        deps.require_agent(request)
    assert exc.value.status_code == 503  # 약한 기본값으로 열리지 않고 거부


def test_session_cookie_is_httponly(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")  # 로컬 http
    router = load_file(ROOT / "src" / "domains" / "identity" / "router.py", "id_router")
    response = Response()
    session = {"session_token": "secret-tok", "user_id": "u", "roles": ["owner"]}
    router._set_session_cookie(response, session)
    cookie = response.headers["set-cookie"].lower()
    assert "secret-tok" in cookie  # 쿠키로 전달
    assert "httponly" in cookie  # JS 가 못 읽음(XSS 탈취 차단)
    assert "samesite=lax" in cookie  # CSRF 완화
