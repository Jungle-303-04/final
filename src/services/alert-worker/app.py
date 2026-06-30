"""alert-worker — alert.requested → alert.dispatched → optional command.requested.

현재는 사전 배포 알림 경계를 통과하면 즉시 자동 배포 이벤트를 이어준다.
나중에 승인/차단 정책은 allow_after_alarm_gate() 내부에 넣는다.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from packages.contracts.event_bus.bodies import (
    AlertDispatchedBody,
    AlertRejectedBody,
    AlertRequestedBody,
    EventBody,
)
from packages.runtime.app import App, EventContext

app = App("alert-worker")

DEFAULT_ALERT_CHANNEL = "ops"
STUB_ALERT_MODE = "stub_alarm_adapter"
ALERT_GATE_BLOCKED_REASON = "pre-deploy alert gate blocked"


def allow_after_alarm_gate(evt: AlertRequestedBody) -> bool:
    # TODO(alert): plug in workspace/repo/cluster policy, approvals, quiet hours, and severity routing.
    # TODO(alert): block production auto deploy until Slack/Email/PagerDuty delivery is confirmed.
    return True


def build_dispatched(evt: AlertRequestedBody) -> AlertDispatchedBody:
    # TODO(alert): dispatch Slack/Email/PagerDuty notifications and persist provider delivery ids.
    return AlertDispatchedBody(
        cluster_id=evt.cluster_id,
        namespace=evt.namespace,
        severity=evt.severity,
        channel=DEFAULT_ALERT_CHANNEL,
        mode=STUB_ALERT_MODE,
    )


@app.on(AlertRequestedBody)
async def on_alert_requested(
    evt: AlertRequestedBody, ctx: EventContext[object]
) -> AsyncIterator[EventBody]:
    if not allow_after_alarm_gate(evt):
        yield AlertRejectedBody(reason=ALERT_GATE_BLOCKED_REASON, requested=evt.to_body())
        return

    yield build_dispatched(evt)
    if evt.next_command is not None:
        yield evt.next_command


if __name__ == "__main__":
    app.run()
