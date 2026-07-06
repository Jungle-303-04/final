"""alert 도메인 HTTP 라우터 — 워크스페이스별 알림 채널(라우팅 룰) 관리(admin 세션)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_admin_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import AlertChannelUpsertRequest
from packages.contracts.gateway.responses import (
    AlertChannelListResponse,
    AlertChannelResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.runtime.dependencies import get_db

router = APIRouter()
NOT_FOUND_CODE = 404
CHANNEL_NOT_FOUND = "alert channel not found"


@router.get(gateway_routes.ALERT_CHANNELS_PATH, response_model=AlertChannelListResponse)
async def list_alert_channels(
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> AlertChannelListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    channels = db.list_alert_channels(workspace_id)
    return AlertChannelListResponse(
        channels=[AlertChannelResponse(**channel) for channel in channels]
    )


@router.post(gateway_routes.ALERT_CHANNELS_PATH, response_model=AlertChannelResponse)
async def upsert_alert_channel(
    payload: AlertChannelUpsertRequest,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> AlertChannelResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    try:
        saved = db.upsert_alert_channel(
            {
                **payload.model_dump(exclude={"channel_id"}),
                **({"channel_id": payload.channel_id} if payload.channel_id else {}),
                "workspace_id": workspace_id,
            }
        )
    except LookupError as exc:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CHANNEL_NOT_FOUND) from exc
    return AlertChannelResponse(**saved)


@router.delete(gateway_routes.ALERT_CHANNEL_PATH, status_code=204, response_model=None)
async def delete_alert_channel(
    channel_id: str,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> None:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    if not db.delete_alert_channel(workspace_id, channel_id):
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CHANNEL_NOT_FOUND)
