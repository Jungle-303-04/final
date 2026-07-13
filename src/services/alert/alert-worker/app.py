"""alert-worker — alert.requested → alert.dispatched → optional command.requested."""

from __future__ import annotations

import inspect
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from domains.alert.delivery import post_alert_webhook
from domains.alert.events import AlertDispatchedBody, AlertRejectedBody, AlertRequestedBody
from domains.alert.repository import severity_matches
from packages.config.logs import get_logger
from packages.config.settings import env
from packages.contracts.alert.provider import AlertProvider
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("alert-worker")
LOGGER = get_logger(__name__)

ALERT_DISPATCH_FAILED_REASON = "alert dispatch failed"
ALERT_PROVIDER_ENV = "ALERT_PROVIDER"
LOG_PROVIDER_NAME = "log"
WEBHOOK_PROVIDER_NAME = "webhook"
ALERT_WEBHOOK_URL_ENV = "ALERT_WEBHOOK_URL"
ALERT_HTTP_TIMEOUT_SECONDS_ENV = "ALERT_HTTP_TIMEOUT_SECONDS"  # 웹훅 타임아웃 초(기본 10)
DEFAULT_ALERT_HTTP_TIMEOUT_SECONDS = "10"
ALERT_BLOCKED_SEVERITIES_ENV = "ALERT_BLOCKED_SEVERITIES"
ALERT_AUTO_COMMAND_ENVIRONMENTS_ENV = "ALERT_AUTO_COMMAND_ENVIRONMENTS"
DEFAULT_ALERT_AUTO_COMMAND_ENVIRONMENTS = "sandbox,staging"
ALERT_SEVERITY_BLOCKED_REASON = "alert severity blocked by policy"
AUTO_COMMAND_ENVIRONMENT_DENIED_REASON = "auto command not allowed for environment"
# 웹훅 URL 부재는 부팅 실패가 아니라 요청 시점 실패 — 워커는 뜨고,
# 각 alert.requested 는 alert.rejected 경로로 흐름.
MISSING_WEBHOOK_URL_MESSAGE = (
    f"{ALERT_WEBHOOK_URL_ENV} 미설정 — webhook provider 는 전송 대상 URL 없이 "
    "알림을 전송할 수 없음. deploy env 에 웹훅 URL 을 설정해야 함"
)


def csv_values(value: str) -> set[str]:
    return {item.strip().lower() for item in value.split(",") if item.strip()}


@dataclass(frozen=True)
class AlertPolicyDecision:
    """알림 정책 판정 결과 — allowed=False 면 reason 으로 거부 이벤트를 냄."""

    allowed: bool
    reason: str = ""


def check_alert_policy(evt: AlertRequestedBody) -> AlertPolicyDecision:
    """전송 전 정책 검증 — env 정책으로 severity와 자동 명령 환경을 제한."""
    blocked_severities = csv_values(env(ALERT_BLOCKED_SEVERITIES_ENV, ""))
    if evt.severity.strip().lower() in blocked_severities:
        return AlertPolicyDecision(allowed=False, reason=ALERT_SEVERITY_BLOCKED_REASON)
    allowed_auto_command_envs = csv_values(
        env(ALERT_AUTO_COMMAND_ENVIRONMENTS_ENV, DEFAULT_ALERT_AUTO_COMMAND_ENVIRONMENTS)
    )
    if evt.next_command is not None and evt.environment.lower() not in allowed_auto_command_envs:
        return AlertPolicyDecision(
            allowed=False,
            reason=AUTO_COMMAND_ENVIRONMENT_DENIED_REASON,
        )
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


async def dispatch_to_channel(
    alert: AlertRequestedBody, channel: dict[str, object]
) -> AlertDispatchedBody:
    """워크스페이스 채널 1개로 webhook 발송 — 채널 이름이 dispatched.channel 이 된다."""
    result = await post_alert_webhook(str(channel["url"]), alert)
    if not result.delivered:
        raise RuntimeError(result.error or "alert webhook failed")
    return dispatched_body(alert, channel=str(channel["name"]), mode=WEBHOOK_PROVIDER_NAME)


async def matching_channels(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> list[dict[str, object]]:
    """워크스페이스의 enabled 채널 중 min_severity 를 충족하는 것 — 저장소 없으면 빈 목록."""
    lister = getattr(ctx.db, "list_alert_channels", None)
    if lister is None:
        return []
    # 위치 인자만 사용 — 테스트 대역(범용 spy)과의 호환을 위해 kwargs 를 강제하지 않는다.
    loaded = lister(evt.workspace_id)
    channels = await loaded if inspect.isawaitable(loaded) else loaded
    channels = channels or []
    return [
        dict(channel)
        for channel in channels
        if bool(channel.get("enabled", True))
        and severity_matches(str(channel.get("min_severity", "warning")), evt.severity)
    ]


@app.on(AlertRequestedBody)
async def on_alert_requested(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    decision = check_alert_policy(evt)
    if not decision.allowed:
        LOGGER.warning("alert rejected", extra={"context": {"reason": decision.reason}})
        yield AlertRejectedBody(reason=decision.reason, requested=evt.to_body())
        return

    # 라우팅 룰 — 워크스페이스 채널이 있으면 severity 매칭 채널 전부로 발송.
    # 채널이 하나도 없으면 기존 전역 provider(env) 폴백: 도입 전과 동작 동일.
    channels = await matching_channels(evt, ctx)
    if channels:
        delivered = 0
        for channel in channels:
            try:
                yield await dispatch_to_channel(evt, channel)
                delivered += 1
            except Exception as exc:  # noqa: BLE001 - 채널별 실패는 다른 채널을 막지 않음
                LOGGER.warning(
                    "alert channel dispatch failed",
                    extra={
                        "context": {
                            "channel": channel.get("name"),
                            "severity": evt.severity,
                            "exception_type": type(exc).__name__,
                        }
                    },
                )
        if delivered == 0:
            # 전 채널 실패 — 전송 확인 없이는 next_command 를 이어주지 않음(fail-closed).
            yield AlertRejectedBody(reason=ALERT_DISPATCH_FAILED_REASON, requested=evt.to_body())
            return
        if evt.next_command is not None:
            yield evt.next_command
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

    LOGGER.info(
        "alert dispatched",
        extra={
            "context": {
                "cluster_id": dispatched.cluster_id,
                "severity": dispatched.severity,
                "channel": dispatched.channel,
                "mode": dispatched.mode,
            }
        },
    )
    yield dispatched
    if evt.next_command is not None:
        yield evt.next_command


if __name__ == "__main__":
    app.run()
