"""command-worker — 한 파일 서비스.

command.requested 를 받아 정책을 검사하고, 통과하면 실행 계획을 세워
에이전트 큐에 적재. 결과는 yield 로 흘림(dispatch.ready →
dispatched → queued_for_agent). 정책 위반이면 rejected.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator

from command_config import CommandConfig, PolicyRuleConfig
from command_policy import ModelLookup, Policy

from packages.config.constants import Command, CommandStatus, Sandbox, Target
from packages.contracts.event_bus.bodies import (
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    EventBody,
    Plan,
    Route,
)
from packages.contracts.gateway.fields import Gateway
from packages.contracts.stores import AgentCommandStore
from packages.runtime.app import App, EventContext

app = App("command-worker")

# 서비스 설정(상수) — settings.py 대신 여기.
CONFIG = CommandConfig(
    service_name="command-worker",
    agent_route_channel="agent-poll",
    policy_steps=("validate policy", "route target cluster", "queue for agent"),
    default_namespace=Sandbox.NAMESPACE,
    default_cluster_id=Target.DEFAULT_CLUSTER_ID,
    default_command_action=Command.DEFAULT_ACTION,
    command_status_queued=CommandStatus.QUEUED,
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


def idempotency_key(command: CommandRequestedBody, correlation_id: str) -> str:
    payload = {
        "correlation_id": correlation_id,
        "cluster_id": command.cluster_id,
        "action": command.action,
        "namespace": command.namespace,
        "diff": command.diff.to_body(),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def build_plan(command: CommandRequestedBody, correlation_id: str) -> Plan:
    key = idempotency_key(command, correlation_id)
    return Plan(
        command_id=f"cmd-{key[:32]}",
        idempotency_key=key,
        cluster_id=command.cluster_id or CONFIG.default_cluster_id,
        action=command.action or CONFIG.default_command_action,
        namespace=command.namespace or CONFIG.default_namespace,
        steps=list(CONFIG.policy_steps),
    )


@app.sub(CommandRequestedBody)
async def on_command_requested(
    evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]
) -> AsyncIterator[EventBody]:
    result = POLICY.evaluate(ModelLookup(evt))
    if not result.allowed:
        yield CommandRejectedBody(reason=result.require_reason(), requested=evt.to_body())
        return

    plan = build_plan(evt, ctx.correlation_id)
    yield CommandDispatchReadyBody(plan=plan)
    yield CommandDispatchedBody(
        plan=plan, route=Route(channel=CONFIG.agent_route_channel, cluster_id=plan.cluster_id)
    )
    await ctx.db.queue_agent_command(
        ctx.correlation_id, plan.to_body(), CONFIG.command_status_queued
    )
    yield CommandQueuedForAgentBody(command_id=plan.command_id, cluster_id=plan.cluster_id)


if __name__ == "__main__":
    app.run()
