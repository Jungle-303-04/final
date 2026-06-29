"""identity 도메인 HTTP 라우터 — 세션·OAuth(향후 email/password 로그인 추가)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Request

from domains.identity.dependencies import get_auth, require_session
from packages.config.constants import Auth, GitHub
from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.fields import Gateway
from packages.contracts.gateway.requests import OAuthCallbackRequest
from packages.runtime.dependencies import get_events

router = APIRouter()

DEFAULT_SCOPES = "profile,email"


@router.get(gateway_routes.AUTH_SESSION_PATH)
async def session(current: Any = Depends(require_session)) -> dict[str, Any]:
    return {
        Gateway.AUTHENTICATED: True,
        Gateway.USER_ID: current.user_id,
        Gateway.ROLES: current.roles,
    }


@router.get(gateway_routes.OAUTH_START_PATH)
async def oauth_start(
    provider: str,
    request: Request,
    user_id: str = Auth.LOCAL_USER_ID,
    scopes: str = DEFAULT_SCOPES,
    auth: Any = Depends(get_auth),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    scope_list = [s.strip() for s in scopes.split(",") if s.strip()]
    if provider == GitHub.PROVIDER and GitHub.REQUIRED_SCOPE not in scope_list:
        scope_list.append(GitHub.REQUIRED_SCOPE)
    response = await auth.start(provider, user_id, scope_list)
    await events.accept(
        EventSubject.OAUTH_START_REQUESTED,
        {
            Gateway.PROVIDER: provider,
            Gateway.USER_ID: user_id,
            Gateway.SCOPES: scope_list,
            Gateway.STATE: response[Gateway.STATE],
        },
    )
    return response


@router.post(gateway_routes.OAUTH_CALLBACK_PATH)
async def oauth_callback(
    provider: str,
    payload: OAuthCallbackRequest,
    auth: Any = Depends(get_auth),
    events: Any = Depends(get_events),
) -> dict[str, Any]:
    result = await auth.callback(provider, payload.model_dump())
    account = result[Gateway.ACCOUNT]
    accepted = await events.accept(EventSubject.OAUTH_CONNECTED, account)
    return {
        Gateway.ACCEPTED: True,
        Gateway.EVENT_ID: accepted.event.event_id,
        Gateway.TOKEN_REF: account[Gateway.TOKEN_REF],
        Gateway.SESSION: result[Gateway.SESSION],
    }
