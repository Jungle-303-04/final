"""command-worker — 한 파일 서비스.

command.requested 를 받아 정책을 검사하고, 통과하면 실행 계획을 세워
에이전트 큐에 적재한다. 결과는 yield 로 흘린다(dispatch.ready →
dispatched → queued_for_agent). 정책 위반이면 rejected.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from command_config import CommandConfig, PolicyRuleConfig
from command_policy import ModelLookup, Policy

from packages.config.constants import Sandbox, Target
from packages.contracts.event_bus.payloads import (
    CommandDispatchedPayload,
    CommandDispatchReadyPayload,
    CommandQueuedForAgentPayload,
    CommandRejectedPayload,
    CommandRequestedPayload,
    EventPayload,
    Plan,
    Route,
)
from packages.contracts.gateway.fields import Gateway
from packages.runtime.app import App, EventContext

app = App("command-worker")

# 서비스 설정(상수) — settings.py 대신 여기.
CONFIG = CommandConfig(
    service_name="command-worker",
    agent_route_channel="agent-poll",
    policy_steps=("validate policy", "route target cluster", "queue for agent"),
    default_namespace=Sandbox.NAMESPACE,
    default_cluster_id=Target.DEFAULT_CLUSTER_ID,
    default_command_action="rollout_restart",
    command_status_queued="queued",
    policy_rules=(
        PolicyRuleConfig(
            name="sandbox_namespace",
            field=Gateway.NAMESPACE,
            expected=Sandbox.NAMESPACE,
            default=Sandbox.NAMESPACE,
            reason="only sandbox namespace writes are allowed",
        ),
    ),
)
POLICY = Policy.build(CONFIG.policy_rules)


def build_plan(command: ModelLookup) -> Plan:
    return Plan(
        command_id=str(uuid.uuid4()),
        cluster_id=command.value(Gateway.CLUSTER_ID, CONFIG.default_cluster_id),
        action=command.value(Gateway.ACTION, CONFIG.default_command_action),
        namespace=command.value(Gateway.NAMESPACE, CONFIG.default_namespace),
        steps=list(CONFIG.policy_steps),
    )


@app.sub(CommandRequestedPayload)
async def on_command_requested(
    evt: CommandRequestedPayload, ctx: EventContext
) -> AsyncIterator[EventPayload]:
    # 타입 payload 를 룰 입력(Lookup)으로 — dict 가 아니라 모델 기반.
    command = ModelLookup(evt)
    result = POLICY.evaluate(command)
    if not result.allowed:
        yield CommandRejectedPayload(
            reason=result.require_reason(), requested=evt.to_payload()
        )
        return

    plan = build_plan(command)
    yield CommandDispatchReadyPayload(plan=plan)
    yield CommandDispatchedPayload(
        plan=plan,
        route=Route(
            channel=CONFIG.agent_route_channel, cluster_id=plan.cluster_id
        ),
    )
    await ctx.db.queue_agent_command(
        ctx.correlation_id, plan.to_payload(), CONFIG.command_status_queued
    )
    yield CommandQueuedForAgentPayload(
        command_id=plan.command_id, cluster_id=plan.cluster_id
    )


if __name__ == "__main__":
    app.run()
