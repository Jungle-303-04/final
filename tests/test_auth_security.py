"""identity 보안 회귀 — 세션 쿠키와 agent 가드는 fail-closed 로 동작한다."""

from __future__ import annotations

from types import SimpleNamespace

import pytest
from conftest import ROOT, load_file
from fastapi import HTTPException, Request, Response


class AgentAuthDb:
    def __init__(self, deps: object) -> None:
        self.deps = deps

    def authenticate_cluster_agent(self, token_hash: str) -> dict[str, str] | None:
        if token_hash == self.deps.hash_agent_token("agent-secret"):
            return {"workspace_id": "workspace-1", "cluster_id": "cluster-1"}
        return None


def request_with_agent_token(token: str | None, db: object) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if token is not None:
        headers.append((b"x-agent-token", token.encode()))
    app = SimpleNamespace(state=SimpleNamespace(db=db))
    return Request({"type": "http", "headers": headers, "app": app})


def test_require_cluster_agent_uses_registered_token_identity() -> None:
    deps = load_file(ROOT / "src" / "domains" / "identity" / "dependencies.py", "id_deps")
    identity = deps.require_cluster_agent(
        request_with_agent_token("agent-secret", AgentAuthDb(deps))
    )

    assert identity.workspace_id == "workspace-1"
    assert identity.cluster_id == "cluster-1"


def test_require_cluster_agent_fail_closed_without_registered_token() -> None:
    deps = load_file(ROOT / "src" / "domains" / "identity" / "dependencies.py", "id_deps")
    with pytest.raises(HTTPException) as exc:
        deps.require_cluster_agent(request_with_agent_token("wrong-token", AgentAuthDb(deps)))
    assert exc.value.status_code == 401

    with pytest.raises(HTTPException) as missing:
        deps.require_cluster_agent(request_with_agent_token(None, AgentAuthDb(deps)))
    assert missing.value.status_code == 401


def test_session_cookie_is_httponly(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COOKIE_SECURE", "0")  # 로컬 http
    router = load_file(ROOT / "src" / "domains" / "identity" / "router.py", "id_router")
    response = Response()
    session = SimpleNamespace(
        token="secret-tok", user_id="u", roles=["service_admin"], workspace_id="default"
    )
    router._set_session_cookie(response, session)
    cookie = response.headers["set-cookie"].lower()
    assert "secret-tok" in cookie  # 쿠키로 전달
    assert "httponly" in cookie  # JS 가 못 읽음(XSS 탈취 차단)
    assert "samesite=lax" in cookie  # CSRF 완화
