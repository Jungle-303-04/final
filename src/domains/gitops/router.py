"""gitops 도메인 HTTP 라우터 — GitHub webhook 입구(라우터 단위 HMAC 서명 검증)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from domains.gitops.dependencies import verify_github_signature
from packages.contracts.event_bus.bodies import GitWebhookReceivedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import GitHubWebhookRequest
from packages.contracts.gateway.responses import AcceptedEventResponse
from packages.runtime.dependencies import get_events

router = APIRouter(dependencies=[Depends(verify_github_signature)])


def build_git_webhook_body(payload: GitHubWebhookRequest) -> GitWebhookReceivedBody:
    # TODO(gitops): branch, repository, installation, delivery id field 정규화
    return GitWebhookReceivedBody(**payload.model_dump())


@router.post(gateway_routes.GITHUB_WEBHOOK_PATH, response_model=AcceptedEventResponse)
async def github_webhook(
    payload: GitHubWebhookRequest, events: Any = Depends(get_events)
) -> AcceptedEventResponse:
    accepted = await events.accept_body(build_git_webhook_body(payload))
    return AcceptedEventResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
        event=accepted.event.to_dict(),
    )
