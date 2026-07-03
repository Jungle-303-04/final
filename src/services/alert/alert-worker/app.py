"""alert-worker — alert.requested → alert.dispatched → optional command.requested.

현재는 사전 배포 알림 경계를 통과하면 즉시 자동 배포 이벤트를 이어줌.
나중에 승인/차단 정책은 allow_after_alarm_gate() 내부에 넣는다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.alert.events import AlertDispatchedBody, AlertRejectedBody, AlertRequestedBody
from packages.contracts.event_bus.bodies import EventBody
from packages.runtime.app import App, EventContext

app = App("alert-worker")

DEFAULT_ALERT_CHANNEL = "ops"
STUB_ALERT_MODE = "stub_alarm_adapter"
ALERT_GATE_BLOCKED_REASON = "pre-deploy alert gate blocked"


def allow_after_alarm_gate(evt: AlertRequestedBody) -> bool:
    # TODO(alert): workspace/repo/cluster 정책, 승인, 조용한 시간, 심각도 라우팅 연결
    # TODO(alert): Slack/Email/PagerDuty 전송 확인 전 production 자동 배포 차단
    return True


def build_dispatched_body(evt: AlertRequestedBody) -> AlertDispatchedBody:
    # TODO(alert): Slack/Email/PagerDuty 알림 전송과 provider delivery id 저장
    return AlertDispatchedBody(
        cluster_id=evt.cluster_id,
        namespace=evt.namespace,
        severity=evt.severity,
        channel=DEFAULT_ALERT_CHANNEL,
        mode=STUB_ALERT_MODE,
        workspace_id=evt.workspace_id,
        application_id=evt.application_id,
        workflow_run_id=evt.workflow_run_id,
        binding_id=evt.binding_id,
        environment=evt.environment,
    )


@app.on(AlertRequestedBody)
async def on_alert_requested(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    if not allow_after_alarm_gate(evt):
        yield AlertRejectedBody(reason=ALERT_GATE_BLOCKED_REASON, requested=evt.to_body())
        return

    yield build_dispatched_body(evt)
    if evt.next_command is not None:
        yield evt.next_command


if __name__ == "__main__":
    app.run()
