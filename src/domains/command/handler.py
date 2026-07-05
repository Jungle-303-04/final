from __future__ import annotations

import hashlib
import json
from collections.abc import AsyncIterator

from domains.command.actions import allowed_command_actions, command_action_spec
from domains.command.events import (
    CommandCompletedBody,
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
from packages.contracts.gitops import ApprovalStatus
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
MISSING_APPROVAL_REF_REASON = "write command requires approval_ref"
MISSING_POLICY_DECISION_REF_REASON = "write command requires policy_decision_ref"
APPROVAL_RECORD_MISSING_REASON = "write command approval_ref is not recorded"
APPROVAL_NOT_GRANTED_REASON = "write command approval_ref is not granted"
APPROVAL_POLICY_DECISION_MISMATCH_REASON = "write command policy_decision_ref mismatch"
APPROVAL_WORKFLOW_MISMATCH_REASON = "write command approval workflow mismatch"


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
    if spec is not None and spec.requires_approval:
        if not command.approval_ref:
            return PolicyResult.reject(MISSING_APPROVAL_REF_REASON)
        if not command.policy_decision_ref:
            return PolicyResult.reject(MISSING_POLICY_DECISION_REF_REASON)
    return result


def command_requires_recorded_approval(command: CommandRequestedBody) -> bool:
    spec = command_action_spec(command.action)
    return bool(spec is not None and spec.requires_approval)


async def evaluate_recorded_approval(
    command: CommandRequestedBody, db: AgentCommandStore
) -> PolicyResult:
    if not command_requires_recorded_approval(command):
        return PolicyResult.allow()
    if not command.approval_ref:
        return PolicyResult.reject(MISSING_APPROVAL_REF_REASON)
    if not command.policy_decision_ref:
        return PolicyResult.reject(MISSING_POLICY_DECISION_REF_REASON)

    getter = getattr(db, "get_workflow_approval", None)
    if getter is None:
        return PolicyResult.reject(APPROVAL_RECORD_MISSING_REASON)
    record = await getter(command.approval_ref, command.workspace_id)
    if not isinstance(record, dict):
        return PolicyResult.reject(APPROVAL_RECORD_MISSING_REASON)

    if str(record.get("workflow_run_id", "")) != command.workflow_run_id:
        return PolicyResult.reject(APPROVAL_WORKFLOW_MISMATCH_REASON)
    if str(record.get("status", "")) not in {
        ApprovalStatus.GRANTED.value,
        ApprovalStatus.NOT_REQUIRED.value,
    }:
        return PolicyResult.reject(APPROVAL_NOT_GRANTED_REASON)

    details = record.get("details")
    if isinstance(details, dict):
        recorded_ref = details.get("policy_decision_ref")
        if recorded_ref and str(recorded_ref) != command.policy_decision_ref:
            return PolicyResult.reject(APPROVAL_POLICY_DECISION_MISMATCH_REASON)
        recorded_approval = details.get("approval_ref")
        if recorded_approval and str(recorded_approval) != command.approval_ref:
            return PolicyResult.reject(APPROVAL_POLICY_DECISION_MISMATCH_REASON)
    return PolicyResult.allow()


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
        "approval_ref": command.approval_ref,
        "policy_decision_ref": command.policy_decision_ref,
        "diff": command.diff.to_body(),
        "payload": command.payload,
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
        payload=command.payload,
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
        approval_ref=command.approval_ref,
        policy_decision_ref=command.policy_decision_ref,
    )


def route_for_plan(plan: Plan) -> Route:
    return Route(channel=plan.routing_constraint.channel, cluster_id=plan.cluster_id)


async def queue_plan_for_agent(ctx: EventContext[AgentCommandStore], plan: Plan) -> None:
    await ctx.db.queue_agent_command(
        ctx.correlation_id, plan.to_body(), COMMAND_CONFIG.command_status_queued
    )


async def sweep_expired_agent_commands(
    ctx: EventContext[AgentCommandStore],
) -> AsyncIterator[EventBody]:
    """만료 방치 명령 janitor — 명령 이벤트 처리 길목에서 기회적으로 수행함.

    전용 스케줄러 없이 command-worker 의 이벤트 경로에 편승 — 종결된 명령마다
    CommandCompleted(FAILED)를 흘려 workflow 가 영구 APPLYING 에 갇히지 않게 함.
    """
    expired = await ctx.db.fail_expired_agent_commands() or []
    for row in expired:
        yield CommandCompletedBody(command_id=str(row["command_id"]), result=dict(row["result"]))


async def handle_command_requested(
    evt: CommandRequestedBody, ctx: EventContext[AgentCommandStore]
) -> AsyncIterator[EventBody]:
    result = evaluate_command_policy(evt)
    if not result.allowed:
        yield CommandRejectedBody(reason=result.require_reason(), requested=evt.to_body())
        return
    approval_result = await evaluate_recorded_approval(evt, ctx.db)
    if not approval_result.allowed:
        yield CommandRejectedBody(reason=approval_result.require_reason(), requested=evt.to_body())
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
        approval_ref=plan.approval_ref,
        policy_decision_ref=plan.policy_decision_ref,
    )
