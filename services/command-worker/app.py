"""command-worker — 한 파일 서비스.

command.requested 를 받아 정책을 검사하고, 통과하면 실행 계획을 세워
에이전트 큐에 적재. 결과는 yield 로 흘림(dispatch.ready →
dispatched → queued_for_agent). 정책 위반이면 rejected.
"""

from __future__ import annotations

import uuid
from collections.abc import AsyncIterator

from command_config import CommandConfig, PolicyRuleConfig
from command_policy import ModelLookup, Policy

from packages.config.constants import Command, Sandbox, Target
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


@app.sub(CommandRequestedBody)
async def on_command_requested(
    evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]
) -> AsyncIterator[EventBody]:
    # 우현 원본 보존(CommandWorkflow.handle 전체 흐름):
    #
    # payload = evt["payload"]
    # namespace = payload.get("namespace", SANDBOX_NAMESPACE)
    # if namespace != SANDBOX_NAMESPACE:
    #     await self.events.publish(
    #         EventSubject.COMMAND_REJECTED,
    #         SERVICE_NAME,
    #         {"reason": SANDBOX_WRITE_REJECT_REASON, "requested": payload},
    #         evt["correlation_id"],
    #     )
    #     return
    #
    # plan = {
    #     "command_id": str(uuid.uuid4()),
    #     "cluster_id": payload.get("cluster_id", DEFAULT_TARGET_CLUSTER_ID),
    #     "action": payload.get("action", DEFAULT_COMMAND_ACTION),
    #     "namespace": namespace,
    #     "steps": POLICY_STEPS,
    # }
    # await self.events.publish(
    #     EventSubject.COMMAND_DISPATCH_READY,
    #     SERVICE_NAME,
    #     {"plan": plan},
    #     evt["correlation_id"],
    # )
    # await self.events.publish(
    #     EventSubject.COMMAND_DISPATCHED,
    #     SERVICE_NAME,
    #     {
    #         "plan": plan,
    #         "route": {"channel": AGENT_ROUTE_CHANNEL, "cluster_id": plan["cluster_id"]},
    #     },
    #     evt["correlation_id"],
    # )
    # self.commands.queue_agent_command(evt["correlation_id"], plan, COMMAND_STATUS_QUEUED)
    # await self.events.publish(
    #     EventSubject.COMMAND_QUEUED_FOR_AGENT,
    #     SERVICE_NAME,
    #     {"command_id": plan["command_id"], "cluster_id": plan["cluster_id"]},
    #     evt["correlation_id"],
    # )
    #
    # 현재 구조에서는 raw dict payload 대신 CommandRequestedBody를 받고,
    # publish 직접 호출 대신 yield Body로 런타임 dispatch에 맡긴다.
    # 타입 body 를 룰 입력(Lookup)으로 — dict 가 아니라 모델 기반.
    command = ModelLookup(evt)
    result = POLICY.evaluate(command)
    if not result.allowed:
        yield CommandRejectedBody(reason=result.require_reason(), requested=evt.to_body())
        return

    plan = build_plan(command)
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
