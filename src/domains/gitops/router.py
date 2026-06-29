"""gitops 도메인 HTTP 라우터 — GitHub webhook 입구(라우터 단위 HMAC 서명 검증)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from domains.gitops.dependencies import verify_github_signature
from packages.contracts.event_bus.bodies import GitWebhookReceivedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import GitHubWebhookRequest
from packages.runtime.dependencies import get_events

router = APIRouter(dependencies=[Depends(verify_github_signature)])


@router.post(gateway_routes.GITHUB_WEBHOOK_PATH)
async def github_webhook(
    payload: GitHubWebhookRequest, events: Any = Depends(get_events)
) -> dict[str, Any]:
    accepted = await events.accept_body(GitWebhookReceivedBody(**payload.model_dump()))
    return accepted.response(include_event=True)
