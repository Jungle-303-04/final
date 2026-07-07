"""알림 채널 HTTP 전송 공용 함수 — router 사전검증과 worker 실제 발송이 같이 사용."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from domains.alert.events import AlertRequestedBody
from packages.config.settings import env

ALERT_HTTP_TIMEOUT_SECONDS_ENV = "ALERT_HTTP_TIMEOUT_SECONDS"
DEFAULT_ALERT_HTTP_TIMEOUT_SECONDS = "10"


@dataclass(frozen=True)
class AlertDeliveryResult:
    delivered: bool
    status_code: int | None = None
    error: str = ""


async def post_alert_webhook(
    url: str,
    alert: AlertRequestedBody | dict[str, Any],
    *,
    transport: httpx.AsyncBaseTransport | None = None,
) -> AlertDeliveryResult:
    timeout = float(env(ALERT_HTTP_TIMEOUT_SECONDS_ENV, DEFAULT_ALERT_HTTP_TIMEOUT_SECONDS))
    payload = alert.to_body() if isinstance(alert, AlertRequestedBody) else dict(alert)
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            response = await client.post(url, json=payload)
        if response.status_code >= 400:
            return AlertDeliveryResult(
                delivered=False,
                status_code=response.status_code,
                error=f"HTTP {response.status_code}",
            )
        return AlertDeliveryResult(delivered=True, status_code=response.status_code)
    except httpx.TimeoutException:
        return AlertDeliveryResult(delivered=False, error="timeout")
    except httpx.HTTPError as exc:
        return AlertDeliveryResult(delivered=False, error=type(exc).__name__)
