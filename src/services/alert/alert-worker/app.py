"""alert-worker — alert.requested → alert.dispatched → optional command.requested.

현재는 사전 배포 알림 경계를 통과하면 즉시 자동 배포 이벤트를 이어줌.
나중에 승인/차단 정책은 allow_after_alarm_gate() 내부에 넣는다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.alert.events import AlertDispatchedBody, AlertRejectedBody, AlertRequestedBody
from packages.config.logs import get_logger
from packages.contracts.alert.provider import AlertProvider
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("alert-worker")
LOGGER = get_logger(__name__)

DEFAULT_ALERT_CHANNEL = "ops"
STUB_ALERT_MODE = "stub_alarm_adapter"
ALERT_GATE_BLOCKED_REASON = "pre-deploy alert gate blocked"


def allow_after_alarm_gate(evt: AlertRequestedBody) -> bool:
    # TODO(alert): workspace/repo/cluster 정책, 승인, 조용한 시간, 심각도 라우팅 연결
    # TODO(alert): Slack/Email/PagerDuty 전송 확인 전 production 자동 배포 차단
    return True


class StubAlertProvider:
    """AlertProvider 구현 — 외부 전송 없이 dispatched body 만 구성하는 스텁."""

    async def dispatch(self, alert: AlertRequestedBody) -> AlertDispatchedBody:
        # TODO(alert): Slack/Email/PagerDuty 알림 전송과 provider delivery id 저장
        return AlertDispatchedBody(
            cluster_id=alert.cluster_id,
            namespace=alert.namespace,
            severity=alert.severity,
            channel=DEFAULT_ALERT_CHANNEL,
            mode=STUB_ALERT_MODE,
            workspace_id=alert.workspace_id,
            application_id=alert.application_id,
            workflow_run_id=alert.workflow_run_id,
            binding_id=alert.binding_id,
            environment=alert.environment,
        )


# 전송 전략 주입 지점 — 지금은 스텁 provider 하나만 씀.
ALERT_PROVIDER: AlertProvider = StubAlertProvider()


@app.on(AlertRequestedBody)
async def on_alert_requested(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    if not allow_after_alarm_gate(evt):
        yield AlertRejectedBody(reason=ALERT_GATE_BLOCKED_REASON, requested=evt.to_body())
        return

    yield await ALERT_PROVIDER.dispatch(evt)
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
