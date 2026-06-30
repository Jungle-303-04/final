"""gitops 인가 가드 — GitHub webhook HMAC-SHA256 서명 검증(fail-closed)."""

from __future__ import annotations

import hashlib
import hmac

from fastapi import HTTPException, Request

from packages.config.settings import env

WEBHOOK_SECRET_ENV = "GITHUB_WEBHOOK_SECRET"
SIGNATURE_HEADER = "x-hub-signature-256"
SIGNATURE_PREFIX = "sha256="


async def verify_github_signature(request: Request) -> None:
    """시크릿 미설정 또는 서명 불일치/누락이면 거부. 외부 입력이 파이프라인을 못 열게."""
    secret = env(WEBHOOK_SECRET_ENV, "")
    if not secret:
        raise HTTPException(status_code=503, detail="webhook secret not configured")
    body = await request.body()
    expected = SIGNATURE_PREFIX + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    supplied = request.headers.get(SIGNATURE_HEADER, "")
    if not hmac.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="invalid webhook signature")
