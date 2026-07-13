"""alert 도메인 HTTP 라우터 — 워크스페이스별 알림 채널(라우팅 룰) 관리(admin 세션)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.alert.delivery import post_alert_webhook
from domains.alert.events import AlertRequestedBody
from domains.identity.dependencies import require_admin_session
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import AlertChannelTestRequest, AlertChannelUpsertRequest
from packages.contracts.gateway.responses import (
    AlertChannelListResponse,
    AlertChannelResponse,
    AlertChannelTestResponse,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID
from packages.runtime.dependencies import get_db
from packages.security.outbound_url import UnsafeOutboundUrlError, validate_outbound_url_syntax

router = APIRouter()
NOT_FOUND_CODE = 404
CHANNEL_NOT_FOUND = "alert channel not found"
UNSAFE_WEBHOOK_URL_CODE = "unsafe_webhook_url"
UNSAFE_WEBHOOK_URL_DETAIL = "안전하지 않은 웹훅 URL입니다."


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
        validate_outbound_url_syntax(payload.url)
    except UnsafeOutboundUrlError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": UNSAFE_WEBHOOK_URL_CODE, "detail": UNSAFE_WEBHOOK_URL_DETAIL},
        ) from exc
    require_alert_channel_activation_test(payload, workspace_id, db)
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


def require_alert_channel_activation_test(
    payload: AlertChannelUpsertRequest,
    workspace_id: str,
    db: Any,
) -> None:
    if not payload.enabled:
        return
    if not payload.channel_id:
        raise HTTPException(
            status_code=409,
            detail="save the alert channel disabled, test delivery, then enable it",
        )
    getter = getattr(db, "get_alert_channel", None)
    existing = getter(workspace_id, payload.channel_id) if callable(getter) else None
    if existing is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CHANNEL_NOT_FOUND)
    if str(existing.get("url") or "") != payload.url:
        raise HTTPException(
            status_code=409,
            detail="test the updated webhook URL before enabling the alert channel",
        )
    if str(existing.get("last_test_status") or "").lower() != "passed":
        raise HTTPException(
            status_code=409,
            detail="a successful alert channel delivery test is required before enabling it",
        )


@router.post(gateway_routes.ALERT_CHANNEL_TEST_PATH, response_model=AlertChannelTestResponse)
async def test_alert_channel(
    payload: AlertChannelTestRequest,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> AlertChannelTestResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    alert = AlertRequestedBody(
        cluster_id="validation",
        namespace="validation",
        severity=payload.severity,
        message=payload.message,
        reason="alert channel validation",
        workspace_id=workspace_id,
    )
    result = await post_alert_webhook(payload.url, alert)
    if result.delivered:
        channel = record_channel_test_result(
            db,
            workspace_id,
            payload.channel_id,
            status="passed",
            detail="테스트 알림을 전송했습니다.",
            status_code=result.status_code,
        )
        return AlertChannelTestResponse(
            valid=True,
            delivered=True,
            detail="테스트 알림을 전송했습니다.",
            status_code=result.status_code,
            channel=channel,
        )
    if result.error == UNSAFE_WEBHOOK_URL_CODE:
        code = UNSAFE_WEBHOOK_URL_CODE
        detail = UNSAFE_WEBHOOK_URL_DETAIL
    else:
        code = "timeout" if result.error == "timeout" else "delivery_failed"
        detail = "테스트 알림 전송에 실패했습니다."
    channel = record_channel_test_result(
        db,
        workspace_id,
        payload.channel_id,
        status="failed",
        detail=detail,
        status_code=result.status_code,
    )
    return AlertChannelTestResponse(
        valid=False,
        delivered=False,
        code=code,
        detail=detail,
        status_code=result.status_code,
        channel=channel,
    )


def record_channel_test_result(
    db: Any,
    workspace_id: str,
    channel_id: str,
    *,
    status: str,
    detail: str,
    status_code: int | None,
) -> AlertChannelResponse | None:
    if not channel_id:
        return None
    recorder = getattr(db, "record_alert_channel_test", None)
    if not callable(recorder):
        return None
    try:
        row = recorder(
            workspace_id,
            channel_id,
            status=status,
            detail=detail,
            status_code=status_code,
        )
    except LookupError as exc:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CHANNEL_NOT_FOUND) from exc
    return AlertChannelResponse(**row)


@router.delete(gateway_routes.ALERT_CHANNEL_PATH, status_code=204, response_model=None)
async def delete_alert_channel(
    channel_id: str,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> None:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    if not db.delete_alert_channel(workspace_id, channel_id):
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CHANNEL_NOT_FOUND)
