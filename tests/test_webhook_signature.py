"""gitops 보안 회귀 — GitHub webhook HMAC 서명 검증. [P1]

서명 없는/위조된 webhook 으로 배포 파이프라인을 트리거하던 구멍을 막음.
시크릿 미설정이면 무인증으로 열지 않고 거부(fail-closed).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
from collections.abc import Awaitable
from typing import Any

import pytest
from conftest import ROOT, load_file
from fastapi import HTTPException, Request

SECRET = "test-secret"
BODY = b'{"commit_sha":"abc"}'


def _deps() -> Any:
    return load_file(ROOT / "src" / "domains" / "gitops" / "dependencies.py", "gitops_deps")


def _request(body: bytes, signature: str | None) -> Request:
    headers = [] if signature is None else [(b"x-hub-signature-256", signature.encode())]

    async def receive() -> dict[str, Any]:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request({"type": "http", "headers": headers}, receive=receive)


def _sign(secret: str, body: bytes) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def _run(awaitable: Awaitable[None]) -> None:
    asyncio.run(awaitable)  # type: ignore[arg-type]


def test_valid_signature_passes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", SECRET)
    deps = _deps()
    _run(deps.verify_github_signature(_request(BODY, _sign(SECRET, BODY))))  # 통과(no raise)


def test_forged_signature_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", SECRET)
    deps = _deps()
    with pytest.raises(HTTPException) as exc:
        _run(deps.verify_github_signature(_request(BODY, "sha256=deadbeef")))
    assert exc.value.status_code == 401


def test_missing_signature_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GITHUB_WEBHOOK_SECRET", SECRET)
    deps = _deps()
    with pytest.raises(HTTPException) as exc:
        _run(deps.verify_github_signature(_request(BODY, None)))
    assert exc.value.status_code == 401


def test_missing_secret_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GITHUB_WEBHOOK_SECRET", raising=False)
    deps = _deps()
    with pytest.raises(HTTPException) as exc:
        _run(deps.verify_github_signature(_request(BODY, _sign(SECRET, BODY))))
    assert exc.value.status_code == 503  # 시크릿 없으면 무인증으로 열지 않음
