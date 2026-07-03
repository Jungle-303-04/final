from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace

from domains.command.events import (
    CommandDispatchedBody,
    CommandDispatchReadyBody,
    CommandQueuedForAgentBody,
    CommandRejectedBody,
    CommandRequestedBody,
    Plan,
)
from domains.command.handler import (
    COMMAND_CONFIG,
    MANIFEST_NAMESPACE_MISMATCH_REASON,
    NAMESPACE_MISMATCH_REASON,
    build_plan,
    handle_command_requested,
    route_for_plan,
)
from domains.gitops.events import Diff
from packages.config.constants import Command, Sandbox, Target
from packages.contracts.event_bus.bodies import EventBody
from packages.contracts.event_bus.interfaces import JsonObject


class SpyAgentCommandStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, JsonObject, str]] = []

    async def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None:
        self.calls.append((correlation_id, plan, status))


def command_request(action: str = Command.DEFAULT_ACTION) -> CommandRequestedBody:
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
        ),
        workspace_id="workspace-1",
        requested_by="user-1",
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
            desired_manifest={
                "apiVersion": "v1",
                "kind": "ConfigMap",
                "metadata": {"name": "checkout-api-config", "namespace": Sandbox.NAMESPACE},
                "data": {"LOG_LEVEL": "info"},
            },
        ),
        workspace_id="workspace-1",
        requested_by="user-1",
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
            desired_manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": Sandbox.NAMESPACE},
                "spec": {"replicas": 3},
            },
        ),
        workspace_id="workspace-1",
        requested_by="user-1",
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
