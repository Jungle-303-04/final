"""alert-worker — alert.requested → alert.dispatched → optional command.requested.

현재는 사전 배포 알림 경계를 통과하면 즉시 자동 배포 이벤트를 이어줌.
나중에 승인/차단 정책은 check_alert_policy() 내부에 넣는다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from domains.alert.events import AlertDispatchedBody, AlertRejectedBody, AlertRequestedBody
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.alert.provider import AlertProvider
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("alert-worker")
LOGGER = get_logger(__name__)

ALERT_GATE_BLOCKED_REASON = "pre-deploy alert gate blocked"
ALERT_DISPATCH_FAILED_REASON = "alert dispatch failed"
ALERT_PROVIDER_ENV = "ALERT_PROVIDER"
LOG_PROVIDER_NAME = "log"
WEBHOOK_PROVIDER_NAME = "webhook"
ALERT_WEBHOOK_URL_ENV = "ALERT_WEBHOOK_URL"
ALERT_HTTP_TIMEOUT_SECONDS_ENV = "ALERT_HTTP_TIMEOUT_SECONDS"  # 웹훅 타임아웃 초(기본 10)
DEFAULT_ALERT_HTTP_TIMEOUT_SECONDS = "10"
# 웹훅 URL 부재는 부팅 실패가 아니라 요청 시점 실패 — 워커는 뜨고,
# 각 alert.requested 는 alert.rejected 경로로 흐름.
MISSING_WEBHOOK_URL_MESSAGE = (
    f"{ALERT_WEBHOOK_URL_ENV} 미설정 — webhook provider 는 전송 대상 URL 없이 "
    "알림을 전송할 수 없음. deploy env 에 웹훅 URL 을 설정해야 함"
)


def allow_after_alarm_gate(evt: AlertRequestedBody) -> bool:
    # TODO(alert): workspace/repo/cluster 정책, 승인, 조용한 시간, 심각도 라우팅 연결
    # TODO(alert): Slack/Email/PagerDuty 전송 확인 전 production 자동 배포 차단
    return True


@dataclass(frozen=True)
class AlertPolicyDecision:
    """알림 정책 판정 결과 — allowed=False 면 reason 으로 거부 이벤트를 냄."""

    allowed: bool
    reason: str = ""


def check_alert_policy(evt: AlertRequestedBody) -> AlertPolicyDecision:
    """전송 전 정책 검증 훅 — 지금은 알람 게이트만 보고 항상 허용함."""
    # TODO: 알림 정책(중복 억제/속도 제한/심각도 라우팅) 연결
    if not allow_after_alarm_gate(evt):
        return AlertPolicyDecision(allowed=False, reason=ALERT_GATE_BLOCKED_REASON)
    return AlertPolicyDecision(allowed=True)


def dispatched_body(alert: AlertRequestedBody, channel: str, mode: str) -> AlertDispatchedBody:
    return AlertDispatchedBody(
        cluster_id=alert.cluster_id,
        namespace=alert.namespace,
        severity=alert.severity,
        channel=channel,
        mode=mode,
        workspace_id=alert.workspace_id,
        application_id=alert.application_id,
        workflow_run_id=alert.workflow_run_id,
        binding_id=alert.binding_id,
        environment=alert.environment,
    )


class LogAlertProvider:
    """AlertProvider 구현 — 구조화 로그를 최소한의 정직한 싱크로 쓰는 기본 provider."""

    async def dispatch(self, alert: AlertRequestedBody) -> AlertDispatchedBody:
        LOGGER.info(
            "alert delivered to log sink",
            extra={
                "context": {
                    "cluster_id": alert.cluster_id,
                    "namespace": alert.namespace,
                    "severity": alert.severity,
                    "message": alert.message,
                    "reason": alert.reason,
                    "workspace_id": alert.workspace_id,
                }
            },
        )
        return dispatched_body(alert, channel=LOG_PROVIDER_NAME, mode=LOG_PROVIDER_NAME)


class WebhookAlertProvider:
    """AlertProvider 구현 — alert JSON 을 ALERT_WEBHOOK_URL 로 POST 함."""

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.transport = transport

    async def dispatch(self, alert: AlertRequestedBody) -> AlertDispatchedBody:
        url = env(ALERT_WEBHOOK_URL_ENV, "").strip()
        if not url:
            raise RuntimeError(MISSING_WEBHOOK_URL_MESSAGE)
        timeout = float(env(ALERT_HTTP_TIMEOUT_SECONDS_ENV, DEFAULT_ALERT_HTTP_TIMEOUT_SECONDS))
        async with httpx.AsyncClient(timeout=timeout, transport=self.transport) as client:
            response = await client.post(url, json=alert.to_body())
            response.raise_for_status()
        return dispatched_body(alert, channel=WEBHOOK_PROVIDER_NAME, mode=WEBHOOK_PROVIDER_NAME)


def build_alert_provider(name: str | None = None) -> AlertProvider:
    """전송 전략 팩토리 — ALERT_PROVIDER env 로 선택(기본 log), 미지 값은 fail-fast.

    webhook 의 URL 부재는 부팅 실패가 아니라 요청 시점 alert.rejected 로 처리함.
    """
    provider = (name or env(ALERT_PROVIDER_ENV, LOG_PROVIDER_NAME)).strip().lower()
    if provider == LOG_PROVIDER_NAME:
        return LogAlertProvider()
    if provider == WEBHOOK_PROVIDER_NAME:
        return WebhookAlertProvider()
    raise RuntimeError(f"{ALERT_PROVIDER_ENV} 값이 지원되지 않음: {provider}")


# 전송 전략 주입 지점 — env 로 선택(log 기본, webhook 선택 가능).
ALERT_PROVIDER: AlertProvider = build_alert_provider()


@app.on(AlertRequestedBody)
async def on_alert_requested(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    decision = check_alert_policy(evt)
    if not decision.allowed:
        yield AlertRejectedBody(reason=decision.reason, requested=evt.to_body())
        return

    try:
        dispatched = await ALERT_PROVIDER.dispatch(evt)
    except Exception as exc:  # noqa: BLE001 - 외부 전송은 무엇이든 실패 가능
        # 전송 확인 없이는 next_command 를 이어주지 않음(fail-closed).
        LOGGER.warning(
            "alert dispatch failed",
            extra={
                "context": {
                    "cluster_id": evt.cluster_id,
                    "severity": evt.severity,
                    "exception_type": type(exc).__name__,
                    "detail": str(exc),
                }
            },
        )
        yield AlertRejectedBody(reason=ALERT_DISPATCH_FAILED_REASON, requested=evt.to_body())
        return

    yield dispatched
    if evt.next_command is not None:
        yield evt.next_command


@app.on(AlertDispatchedBody)
async def on_alert_dispatched(evt: AlertDispatchedBody) -> None:
    # TODO: 알림 결과 후속 처리(재시도/에스컬레이션) 연결
    LOGGER.info(
        "alert dispatched",
        extra={
            "context": {
                "cluster_id": evt.cluster_id,
                "severity": evt.severity,
                "channel": evt.channel,
                "mode": evt.mode,
            }
        },
    )


@app.on(AlertRejectedBody)
async def on_alert_rejected(evt: AlertRejectedBody) -> None:
    # TODO: 알림 결과 후속 처리(재시도/에스컬레이션) 연결
    LOGGER.warning("alert rejected", extra={"context": {"reason": evt.reason}})


if __name__ == "__main__":
    app.run()
