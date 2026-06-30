from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator

from domains.command.policy import (
    DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_COMMAND_LEASE_SECONDS,
    DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    CommandConfig,
    ModelLookup,
    Policy,
    PolicyRuleConfig,
)
from domains.command.policy import Result as PolicyResult
from packages.config.constants import Command, CommandStatus, Sandbox, Target
from packages.contracts.event_bus.bodies import (
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    EventBody,
    LeaseMetadata,
    Plan,
    RetryPolicy,
    Route,
    RoutingConstraint,
)
from packages.contracts.gateway.fields import Gateway
from packages.contracts.stores import AgentCommandStore
from packages.runtime.app import EventContext

COMMAND_CONFIG = CommandConfig(
    service_name="command-worker",
    agent_route_channel="agent-poll",
    policy_steps=("validate policy", "route target cluster", "queue for agent"),
    default_namespace=Sandbox.NAMESPACE,
    default_cluster_id=Target.DEFAULT_CLUSTER_ID,
    default_command_action=Command.DEFAULT_ACTION,
    command_status_queued=CommandStatus.QUEUED,
    lease_seconds=DEFAULT_COMMAND_LEASE_SECONDS,
    heartbeat_interval_seconds=DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS,
    retry_max_attempts=DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
    retry_delay_seconds=DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    required_agent_capability="command_receiver",
    policy_rules=(
        PolicyRuleConfig(
            name="sandbox_namespace",
            field=Gateway.NAMESPACE,
            expected=Sandbox.NAMESPACE,
            default=Sandbox.NAMESPACE,
            reason="only sandbox namespace writes are allowed",
        ),
        PolicyRuleConfig(
            name="command_action_allowlist",
            field=Gateway.ACTION,
            allowed_values=(Command.DEFAULT_ACTION, Command.APPLY_MANIFEST_ACTION),
            default=Command.DEFAULT_ACTION,
            reason="unsupported command action",
        ),
    ),
)
POLICY = Policy.build(COMMAND_CONFIG.policy_rules)
NO_DIFF_REASON = "desired and actual images already match"


def evaluate_command_policy(command: CommandRequestedBody) -> PolicyResult:
    if command.diff.desired_image == command.diff.actual_image:
        return PolicyResult.reject(NO_DIFF_REASON)
    return POLICY.evaluate(ModelLookup(command))


def idempotency_key(command: CommandRequestedBody, correlation_id: str) -> str:
    payload = {
        "correlation_id": correlation_id,
        "workspace_id": command.workspace_id,
        "cluster_id": command.cluster_id,
        "action": command.action,
        "namespace": command.namespace,
        "diff": command.diff.to_body(),
    }
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(encoded.encode()).hexdigest()


def build_plan(command: CommandRequestedBody, correlation_id: str) -> Plan:
    key = idempotency_key(command, correlation_id)
    cluster_id = command.cluster_id or COMMAND_CONFIG.default_cluster_id
    workspace_id = command.workspace_id
    return Plan(
        command_id=f"cmd-{key[:32]}",
        idempotency_key=key,
        cluster_id=cluster_id,
        action=command.action or COMMAND_CONFIG.default_command_action,
        namespace=command.namespace or COMMAND_CONFIG.default_namespace,
        diff=command.diff.to_body(),
        steps=list(COMMAND_CONFIG.policy_steps),
        lease=LeaseMetadata(
            lease_seconds=COMMAND_CONFIG.lease_seconds,
            heartbeat_interval_seconds=COMMAND_CONFIG.heartbeat_interval_seconds,
        ),
        retry_policy=RetryPolicy(
            max_attempts=COMMAND_CONFIG.retry_max_attempts,
            retry_delay_seconds=COMMAND_CONFIG.retry_delay_seconds,
        ),
        routing_constraint=RoutingConstraint(
            channel=COMMAND_CONFIG.agent_route_channel,
            cluster_id=cluster_id,
            workspace_id=workspace_id,
            required_capability=COMMAND_CONFIG.required_agent_capability,
        ),
        workspace_id=workspace_id,
    )


def route_for_plan(plan: Plan) -> Route:
    return Route(channel=plan.routing_constraint.channel, cluster_id=plan.cluster_id)


async def queue_plan_for_agent(ctx: EventContext[AgentCommandStore], plan: Plan) -> None:
    await ctx.db.queue_agent_command(
        ctx.correlation_id, plan.to_body(), COMMAND_CONFIG.command_status_queued
    )


async def handle_command_requested(
    evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]
) -> AsyncIterator[EventBody]:
    result = evaluate_command_policy(evt)
    if not result.allowed:
        yield CommandRejectedBody(reason=result.require_reason(), requested=evt.to_body())
        return

    plan = build_plan(evt, ctx.correlation_id)
    yield CommandDispatchReadyBody(plan=plan)
    yield CommandDispatchedBody(plan=plan, route=route_for_plan(plan))
    await queue_plan_for_agent(ctx, plan)
    yield CommandQueuedForAgentBody(
        command_id=plan.command_id,
        cluster_id=plan.cluster_id,
        workspace_id=plan.workspace_id,
    )
