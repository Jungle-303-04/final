from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from conftest import ROOT, load_file, load_service, run_handler, subjects_of

from domains.command.events import CommandRequestedBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.events.bus import RecordedEventClient, event_causation
from packages.events.envelope import event


class StubEventPublisher:
    def __init__(self) -> None:
        self.published: list[EventEnvelope] = []

    async def emit(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
        causation_id: str | None = None,
    ) -> EventEnvelope:
        created = event(subject, source, payload, correlation_id, causation_id)
        self.published.append(created)
        return created


class StubEventRecorder:
    def __init__(self) -> None:
        self.recorded: list[EventEnvelope] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.recorded.append(evt)


class StubAgentCommandQueue:
    def __init__(self) -> None:
        self.queued: list[tuple[str, dict[str, Any], str]] = []

    async def get_workflow_approval(
        self, approval_id: str, workspace_id: str = "default"
    ) -> dict[str, Any] | None:
        return {
            "approval_id": approval_id,
            "workflow_run_id": "",
            "workspace_id": workspace_id,
            "status": "granted",
            "decided_by": "approver-1",
            "expires_at": "2099-01-01T00:00:00Z",
            "details": {
                "approval_ref": approval_id,
                "policy_decision_ref": "policy-decision-1",
            },
        }

    async def queue_agent_command(
        self, correlation_id: str, plan: dict[str, Any], status: str
    ) -> bool:
        self.queued.append((correlation_id, plan, status))
        return True

    async def fail_expired_agent_commands(self) -> list[dict[str, Any]]:
        return []  # janitor 대상 없음(AgentCommandStore 계약 충족용)


def command_diff() -> dict[str, str]:
    return {
        "resource": "deployment/checkout-api",
        "namespace": "sandbox",
        "desired_image": "ghcr.io/project/checkout-api:new",
        "actual_image": "ghcr.io/project/checkout-api:old",
        "risk": "sandbox-only",
    }


def test_publish_and_record_uses_event_ports() -> None:
    async def run() -> None:
        publisher = StubEventPublisher()
        recorder = StubEventRecorder()
        client = RecordedEventClient(publisher, recorder)
        created = await client.emit(
            "command.requested", "test", {"cluster_id": "target-cluster-01"}, "corr-1"
        )
        assert created.correlation_id == "corr-1"
        assert publisher.published == [created]
        assert recorder.recorded == [created]

    asyncio.run(run())


def test_recorded_event_client_inherits_current_causation_id() -> None:
    async def run() -> None:
        publisher = StubEventPublisher()
        recorder = StubEventRecorder()
        client = RecordedEventClient(publisher, recorder)
        with event_causation("parent-event-1"):
            created = await client.emit(
                "command.dispatched", "command-worker", {"command_id": "cmd-1"}, "corr-1"
            )
        assert created.causation_id == "parent-event-1"
        assert publisher.published == [created]
        assert recorder.recorded == [created]

    asyncio.run(run())


def test_command_subscriber_emits_dispatch_chain(monkeypatch) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,color-turf")
    command = load_service("command/command-worker")
    queue = StubAgentCommandQueue()
    payload = CommandRequestedBody.from_body(
        {
            "cluster_id": "target-cluster-01",
            "action": "rollout_restart",
            "namespace": "color-turf",
            "environment": "production",
            "reason": "rollout",
            "diff": {**command_diff(), "namespace": "color-turf"},
            "approval_ref": "approval-1",
            "policy_decision_ref": "policy-decision-1",
        }
    )
    outs = run_handler(command.on_command_requested, payload, db=queue, correlation_id="corr-2")
    assert subjects_of(outs) == [
        "command.dispatched",
        "command.queued_for_agent",
    ]
    assert len(queue.queued) == 1
    correlation_id, plan, status = queue.queued[0]
    assert correlation_id == "corr-2"
    assert plan["cluster_id"] == "target-cluster-01"
    assert plan["command_id"] == outs[0].plan.command_id
    assert plan["diff"]["resource"] == "deployment/checkout-api"
    assert plan["approval_ref"] == "approval-1"
    assert plan["policy_decision_ref"] == "policy-decision-1"
    assert plan["approval_decided_by"] == "approver-1"
    assert plan["approval_expires_at"] == "2099-01-01T00:00:00Z"
    assert plan["idempotency_key"]
    assert status == "queued"


def test_command_subscriber_rejects_noop_diff() -> None:
    command = load_service("command/command-worker")
    queue = StubAgentCommandQueue()
    diff = command_diff()
    diff["actual_image"] = diff["desired_image"]
    payload = CommandRequestedBody.from_body(
        {
            "cluster_id": "target-cluster-01",
            "action": "rollout_restart",
            "namespace": "sandbox",
            "reason": "rollout",
            "diff": diff,
        }
    )
    outs = run_handler(command.on_command_requested, payload, db=queue, correlation_id="corr-2")
    assert subjects_of(outs) == ["command.rejected"]
    assert outs[0].reason == "desired and actual images already match"
    assert queue.queued == []


def test_command_id_is_deterministic_for_same_input() -> None:
    command = load_file(ROOT / "src" / "domains" / "command" / "handler.py", "test_command_handler")
    payload = CommandRequestedBody.from_body(
        {
            "cluster_id": "target-cluster-01",
            "action": "rollout_restart",
            "namespace": "sandbox",
            "reason": "rollout",
            "diff": command_diff(),
            "approval_ref": "approval-1",
            "policy_decision_ref": "policy-decision-1",
        }
    )

    first = command.build_plan(payload, "corr-2")
    second = command.build_plan(payload, "corr-2")

    assert first.command_id == second.command_id


def test_policy_evaluates_dict_and_model_lookups_alike() -> None:
    policy = load_file(ROOT / "src" / "domains" / "command" / "policy.py", "test_command_policy")
    rule = policy.EqualsRule(
        name="sandbox_namespace",
        field="namespace",
        expected="sandbox",
        reason="only sandbox namespace writes are allowed",
        default="sandbox",
    )
    engine = policy.Policy([rule])
    model_target = policy.ModelLookup(SimpleNamespace(namespace="sandbox"))
    rejected = policy.ModelLookup(SimpleNamespace(namespace="production"))
    assert engine.evaluate(model_target).allowed is True
    assert engine.evaluate(rejected).allowed is False
