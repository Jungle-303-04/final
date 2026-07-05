from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace

from domains.command.events import (
    CommandCompletedBody,
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    Plan,
)
from domains.command.handler import (
    APPROVAL_POLICY_DECISION_MISMATCH_REASON,
    APPROVAL_RECORD_MISSING_REASON,
    COMMAND_CONFIG,
    MANIFEST_NAMESPACE_MISMATCH_REASON,
    MISSING_APPROVAL_REF_REASON,
    MISSING_POLICY_DECISION_REF_REASON,
    NAMESPACE_MISMATCH_REASON,
    build_plan,
    handle_command_requested,
    route_for_plan,
    sweep_expired_agent_commands,
)
from domains.gitops.events import Diff
from packages.config.constants import Command, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gitops import ApprovalStatus

_DEFAULT_APPROVAL = object()


class SpyAgentCommandStore:
    def __init__(self, approval: JsonObject | None | object = _DEFAULT_APPROVAL) -> None:
        self.calls: list[tuple[str, JsonObject, str]] = []
        self.approval = approval_record() if approval is _DEFAULT_APPROVAL else approval

    async def get_workflow_approval(
        self, approval_id: str, workspace_id: str = "default"
    ) -> JsonObject | None:
        if not isinstance(self.approval, dict):
            return None
        if (
            self.approval.get("approval_id") == approval_id
            and self.approval.get("workspace_id") == workspace_id
        ):
            return self.approval
        return None

    async def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        self.calls.append((correlation_id, plan, status))


def approval_record(
    *,
    approval_id: str = "approval-1",
    policy_decision_ref: str = "policy-decision-1",
    status: str = ApprovalStatus.GRANTED.value,
) -> JsonObject:
    return {
        "approval_id": approval_id,
        "workflow_run_id": "workflow-1",
        "workspace_id": "workspace-1",
        "status": status,
        "details": {
            "approval_ref": approval_id,
            "policy_decision_ref": policy_decision_ref,
        },
    }


def command_request(
    action: str = Command.DEFAULT_ACTION,
    *,
    approval_ref: str | None = "approval-1",
    policy_decision_ref: str | None = "policy-decision-1",
    payload: JsonObject | None = None,
) -> CommandRequestedBody:
    return CommandRequestedBody(
        cluster_id=Target.DEFAULT_CLUSTER_ID,
        action=action,
        namespace=Sandbox.NAMESPACE,
        reason="test",
        diff=Diff(
            resource="deployment/checkout-api",
            namespace=Sandbox.NAMESPACE,
            desired_image="checkout:new",
            actual_image="checkout:old",
            risk=Sandbox.RISK_TAG,
            workflow_run_id="workflow-1",
        ),
        workspace_id="workspace-1",
        workflow_run_id="workflow-1",
        requested_by="user-1",
        approval_ref=approval_ref,
        policy_decision_ref=policy_decision_ref,
        payload=payload or {},
    )


def configmap_command_request() -> CommandRequestedBody:
    return CommandRequestedBody(
        cluster_id=Target.DEFAULT_CLUSTER_ID,
        action=Command.APPLY_MANIFEST_ACTION,
        namespace=Sandbox.NAMESPACE,
        reason="test",
        diff=Diff(
            resource="configmap/checkout-api-config",
            namespace=Sandbox.NAMESPACE,
            desired_image="",
            actual_image="resource-not-inspected",
            risk=Sandbox.RISK_TAG,
            workflow_run_id="workflow-1",
            desired_manifest={
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": "checkout-api-config", "namespace": Sandbox.NAMESPACE},
                "data": {"LOG_LEVEL": "info"},
            },
        ),
        workspace_id="workspace-1",
        workflow_run_id="workflow-1",
        requested_by="user-1",
        approval_ref="approval-1",
        policy_decision_ref="policy-decision-1",
    )


def manifest_command_request_with_same_image() -> CommandRequestedBody:
    return CommandRequestedBody(
        cluster_id=Target.DEFAULT_CLUSTER_ID,
        action=Command.APPLY_MANIFEST_ACTION,
        namespace=Sandbox.NAMESPACE,
        reason="test",
        diff=Diff(
            resource="deployment/checkout-api",
            namespace=Sandbox.NAMESPACE,
            desired_image="checkout:same",
            actual_image="checkout:same",
            risk=Sandbox.RISK_TAG,
            workflow_run_id="workflow-1",
            desired_manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": Sandbox.NAMESPACE},
                "spec": {"replicas": 3},
            },
        ),
        workspace_id="workspace-1",
        workflow_run_id="workflow-1",
        requested_by="user-1",
        approval_ref="approval-1",
        policy_decision_ref="policy-decision-1",
    )


async def collect_events(source: AsyncIterator[EventBody]) -> list[EventBody]:
    return [body async for body in source]


def test_build_plan_includes_agent_execution_metadata() -> None:
    plan = build_plan(command_request(), "corr-1")
    route = route_for_plan(plan)
    body = plan.to_body()
    roundtrip = Plan.from_body(body)

    assert plan.lease.lease_seconds == COMMAND_CONFIG.lease_seconds
    assert plan.lease.heartbeat_interval_seconds == COMMAND_CONFIG.heartbeat_interval_seconds
    assert plan.retry_policy.max_attempts == COMMAND_CONFIG.retry_max_attempts
    assert plan.retry_policy.retry_delay_seconds == COMMAND_CONFIG.retry_delay_seconds
    assert plan.routing_constraint.channel == COMMAND_CONFIG.agent_route_channel
    assert plan.routing_constraint.required_capability == COMMAND_CONFIG.required_agent_capability
    assert route.channel == COMMAND_CONFIG.agent_route_channel
    assert roundtrip.lease.lease_seconds == COMMAND_CONFIG.lease_seconds
    assert body["routing_constraint"]["workspace_id"] == "workspace-1"
    assert body["approval_ref"] == "approval-1"
    assert body["policy_decision_ref"] == "policy-decision-1"
    assert body["payload"] == {}


def test_build_plan_preserves_typed_agent_payload() -> None:
    payload = {"namespace": Sandbox.NAMESPACE, "name": "checkout-api", "replicas": 3}
    plan = build_plan(
        command_request(Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION, payload=payload),
        "corr-1",
    )

    assert plan.payload == payload
    assert plan.to_body()["payload"] == payload


def test_command_handler_queues_plan_payload_in_runtime_uow_boundary() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(command_request(), ctx))
        return events, store

    events, store = asyncio.run(run())

    assert [type(event) for event in events] == [
        CommandDispatchReadyBody,
        CommandDispatchedBody,
        CommandQueuedForAgentBody,
    ]
    assert len(store.calls) == 1
    correlation_id, plan_payload, status = store.calls[0]
    assert correlation_id == "corr-1"
    assert status == COMMAND_CONFIG.command_status_queued
    assert plan_payload == events[0].plan.to_body()
    assert plan_payload["lease"]["lease_seconds"] == COMMAND_CONFIG.lease_seconds
    assert plan_payload["retry_policy"]["max_attempts"] == COMMAND_CONFIG.retry_max_attempts
    assert plan_payload["routing_constraint"]["cluster_id"] == Target.DEFAULT_CLUSTER_ID
    assert events[-1].approval_ref == "approval-1"
    assert events[-1].policy_decision_ref == "policy-decision-1"


def test_command_handler_allows_non_image_manifest_diff() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(configmap_command_request(), ctx))
        return events, store

    events, store = asyncio.run(run())

    assert [type(event) for event in events] == [
        CommandDispatchReadyBody,
        CommandDispatchedBody,
        CommandQueuedForAgentBody,
    ]
    assert store.calls[0][1]["diff"]["desired_manifest"]["kind"] == "ConfigMap"


def test_command_handler_queues_manifest_diff_even_when_image_matches() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(
            handle_command_requested(manifest_command_request_with_same_image(), ctx)
        )
        return events, store

    events, store = asyncio.run(run())

    assert [type(event) for event in events] == [
        CommandDispatchReadyBody,
        CommandDispatchedBody,
        CommandQueuedForAgentBody,
    ]
    assert store.calls[0][1]["diff"]["desired_manifest"]["spec"]["replicas"] == 3


def test_sweep_expired_commands_emits_failed_completion_per_row() -> None:
    # janitor: lease 만료 방치 명령을 FAILED 종결 이벤트로 흘려 workflow 를 풀어줌(감사 C6)
    failed_result = {
        "status": "failed",
        "applied": False,
        "message": "command lease expired; no agent completed the command",
    }

    class JanitorStore:
        def __init__(self) -> None:
            self.swept = 0

        async def fail_expired_agent_commands(self) -> list[dict[str, object]]:
            self.swept += 1
            return [
                {"command_id": "cmd-9", "result": failed_result},
                {"command_id": "cmd-10", "result": failed_result},
            ]

    async def run() -> tuple[list[EventBody], JanitorStore]:
        store = JanitorStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(sweep_expired_agent_commands(ctx))
        return events, store

    events, store = asyncio.run(run())

    assert store.swept == 1
    assert [type(event) for event in events] == [CommandCompletedBody, CommandCompletedBody]
    assert events[0].command_id == "cmd-9"
    assert events[0].result["status"] == "failed"
    assert events[0].result["applied"] is False


def test_sweep_expired_commands_is_quiet_when_nothing_expired() -> None:
    class EmptyStore:
        async def fail_expired_agent_commands(self) -> list[dict[str, object]]:
            return []

    async def run() -> list[EventBody]:
        ctx = SimpleNamespace(correlation_id="corr-1", db=EmptyStore())
        return await collect_events(sweep_expired_agent_commands(ctx))

    assert asyncio.run(run()) == []


def test_command_handler_rejects_unsupported_action_before_queue() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(command_request("delete"), ctx))
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == "unsupported command action"
    assert store.calls == []


def test_command_handler_rejects_write_command_without_approval_ref() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(
            handle_command_requested(
                command_request(approval_ref=None, policy_decision_ref="policy-decision-1"),
                ctx,
            )
        )
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == MISSING_APPROVAL_REF_REASON
    assert store.calls == []


def test_command_handler_rejects_write_command_without_policy_decision_ref() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(
            handle_command_requested(
                command_request(approval_ref="approval-1", policy_decision_ref=None),
                ctx,
            )
        )
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == MISSING_POLICY_DECISION_REF_REASON
    assert store.calls == []


def test_command_handler_rejects_write_command_without_recorded_approval() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore(approval=None)
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(command_request(), ctx))
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == APPROVAL_RECORD_MISSING_REASON
    assert store.calls == []


def test_command_handler_rejects_policy_decision_ref_mismatch() -> None:
    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore(
            approval=approval_record(policy_decision_ref="policy-decision-other")
        )
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(command_request(), ctx))
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == APPROVAL_POLICY_DECISION_MISMATCH_REASON
    assert store.calls == []


def test_command_handler_rejects_diff_namespace_mismatch_before_queue() -> None:
    request = command_request()
    mismatched = CommandRequestedBody(
        cluster_id=request.cluster_id,
        action=request.action,
        namespace=Sandbox.NAMESPACE,
        reason=request.reason,
        diff=Diff(
            resource=request.diff.resource,
            namespace="kube-system",
            desired_image=request.diff.desired_image,
            actual_image=request.diff.actual_image,
            risk=request.diff.risk,
        ),
        workspace_id=request.workspace_id,
        requested_by=request.requested_by,
        approval_ref=request.approval_ref,
        policy_decision_ref=request.policy_decision_ref,
    )

    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(mismatched, ctx))
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == NAMESPACE_MISMATCH_REASON
    assert store.calls == []


def test_command_handler_rejects_manifest_namespace_mismatch_before_queue() -> None:
    request = configmap_command_request()
    mismatched_manifest = {
        **request.diff.desired_manifest,
        "metadata": {"name": "checkout-api-config", "namespace": "kube-system"},
    }
    mismatched = CommandRequestedBody(
        cluster_id=request.cluster_id,
        action=request.action,
        namespace=request.namespace,
        reason=request.reason,
        diff=Diff(
            resource=request.diff.resource,
            namespace=request.diff.namespace,
            desired_image=request.diff.desired_image,
            actual_image=request.diff.actual_image,
            risk=request.diff.risk,
            desired_manifest=mismatched_manifest,
        ),
        workspace_id=request.workspace_id,
        requested_by=request.requested_by,
        approval_ref=request.approval_ref,
        policy_decision_ref=request.policy_decision_ref,
    )

    async def run() -> tuple[list[EventBody], SpyAgentCommandStore]:
        store = SpyAgentCommandStore()
        ctx = SimpleNamespace(correlation_id="corr-1", db=store)
        events = await collect_events(handle_command_requested(mismatched, ctx))
        return events, store

    events, store = asyncio.run(run())

    assert len(events) == 1
    assert isinstance(events[0], CommandRejectedBody)
    assert events[0].reason == MANIFEST_NAMESPACE_MISMATCH_REASON
    assert store.calls == []
