from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator

from domains.command.actions import allowed_command_actions, command_action_spec
from domains.command.events import (
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    LeaseMetadata,
    Plan,
    RetryPolicy,
    Route,
    RoutingConstraint,
)
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
from packages.contracts.event_bus.bodies import EventBody
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
            allowed_values=allowed_command_actions(),
            default=Command.DEFAULT_ACTION,
            reason="unsupported command action",
        ),
    ),
)
POLICY = Policy.build(COMMAND_CONFIG.policy_rules)
NAMESPACE_MISMATCH_REASON = "command namespace must match diff namespace"
MANIFEST_NAMESPACE_MISMATCH_REASON = "manifest namespace must match command namespace"
ACTION_NAMESPACE_REASON = "namespace not allowed for this command action"


def desired_manifest_namespace(command: CommandRequestedBody) -> str | None:
    metadata = command.diff.desired_manifest.get("metadata")
    if not isinstance(metadata, dict):
        return None
    namespace = metadata.get(Gateway.NAMESPACE)
    if namespace in (None, ""):
        return None
    return str(namespace)


def evaluate_command_policy(command: CommandRequestedBody) -> PolicyResult:
    if command.diff.is_image_only_noop():
        return PolicyResult.reject(Sandbox.NO_DIFF_REASON)
    if command.namespace != command.diff.namespace:
        return PolicyResult.reject(NAMESPACE_MISMATCH_REASON)
    manifest_namespace = desired_manifest_namespace(command)
    if manifest_namespace is not None and manifest_namespace != command.namespace:
        return PolicyResult.reject(MANIFEST_NAMESPACE_MISMATCH_REASON)
    result = POLICY.evaluate(ModelLookup(command))
    if not result.allowed:
        return result
    # 액션별 정책 메타데이터(@command.action allowed_namespaces) — 카탈로그가 기준.
    spec = command_action_spec(command.action)
    if spec is not None and not spec.allows_namespace(command.namespace):
        return PolicyResult.reject(ACTION_NAMESPACE_REASON)
    return result


def idempotency_key(command: CommandRequestedBody, correlation_id: str) -> str:
    payload = {
        "correlation_id": correlation_id,
        "workspace_id": command.workspace_id,
        "application_id": command.application_id,
        "workflow_run_id": command.workflow_run_id,
        "binding_id": command.binding_id,
        "environment": command.environment,
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
        application_id=command.application_id,
        workflow_run_id=command.workflow_run_id,
        binding_id=command.binding_id,
        environment=command.environment,
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
        application_id=plan.application_id,
        workflow_run_id=plan.workflow_run_id,
        binding_id=plan.binding_id,
        environment=plan.environment,
    )
