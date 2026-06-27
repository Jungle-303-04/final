from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.payloads import CommandRequestedPayload
from packages.events.bus import (
    RecordedEventClient,
    emit_and_record,
    event_causation,
)
from packages.events.envelope import event
from packages.runtime.app import EventContext

ROOT_DIR = Path(__file__).resolve().parents[1]
COMMAND_WORKER_PATH = ROOT_DIR / "services" / "command-worker" / "app.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    previous_settings = sys.modules.pop("settings", None)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(path.parent))
        sys.modules.pop("settings", None)
        if previous_settings is not None:
            sys.modules["settings"] = previous_settings


class FakeEventPublisher:
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


class FakeEventClient(FakeEventPublisher):
    pass


class FakeEventRecorder:
    def __init__(self) -> None:
        self.recorded: list[EventEnvelope] = []

    def record_event(self, evt: EventEnvelope) -> None:
        self.recorded.append(evt)


class FakeAgentCommandQueue:
    def __init__(self) -> None:
        self.queued: list[tuple[str, dict[str, Any], str]] = []

    async def queue_agent_command(
        self, correlation_id: str, plan: dict[str, Any], status: str
    ) -> None:
        self.queued.append((correlation_id, plan, status))


def test_publish_and_record_uses_event_ports() -> None:
    async def run() -> None:
        publisher = FakeEventPublisher()
        recorder = FakeEventRecorder()

        created = await emit_and_record(
            publisher,
            recorder,
            "command.requested",
            "test",
            {"cluster_id": "target-cluster-01"},
            "corr-1",
        )

        assert created.correlation_id == "corr-1"
        assert publisher.published == [created]
        assert recorder.recorded == [created]

    asyncio.run(run())


def test_recorded_event_client_inherits_current_causation_id() -> None:
    async def run() -> None:
        publisher = FakeEventPublisher()
        recorder = FakeEventRecorder()
        client = RecordedEventClient(publisher, recorder)

        with event_causation("parent-event-1"):
            created = await client.emit(
                "command.dispatched",
                "command-worker",
                {"command_id": "cmd-1"},
                "corr-1",
            )

        assert created.causation_id == "parent-event-1"
        assert publisher.published == [created]
        assert recorder.recorded == [created]

    asyncio.run(run())


def test_command_subscriber_emits_dispatch_chain() -> None:
    module = load_module(COMMAND_WORKER_PATH, "test_command_app")
    queue = FakeAgentCommandQueue()
    payload = CommandRequestedPayload.from_payload(
        {
            "cluster_id": "target-cluster-01",
            "action": "rollout_restart",
            "namespace": "sandbox",
            "reason": "rollout",
            "diff": {},
        }
    )
    ctx = EventContext(
        event_id="evt-1",
        subject="command.requested",
        correlation_id="corr-2",
        causation_id=None,
        db=queue,
    )

    async def run() -> list[Any]:
        return [out async for out in module.on_command_requested(payload, ctx)]

    outs = asyncio.run(run())

    assert [out.__subject__ for out in outs] == [
        "command.dispatch.ready",
        "command.dispatched",
        "command.queued_for_agent",
    ]
    assert len(queue.queued) == 1
    correlation_id, plan, status = queue.queued[0]
    assert correlation_id == "corr-2"
    assert plan["cluster_id"] == "target-cluster-01"
    assert status == "queued"


def test_policy_evaluates_dict_and_model_lookups_alike() -> None:
    policy = load_module(
        ROOT_DIR / "services" / "command-worker" / "command_policy.py",
        "test_command_policy",
    )
    rule = policy.EqualsRule(
        name="sandbox_namespace",
        field="namespace",
        expected="sandbox",
        reason="only sandbox namespace writes are allowed",
        default="sandbox",
    )
    engine = policy.Policy([rule])

    dict_target = policy.Payload({"namespace": "sandbox"})
    model_target = policy.ModelLookup(SimpleNamespace(namespace="sandbox"))
    rejected = policy.ModelLookup(SimpleNamespace(namespace="production"))

    assert engine.evaluate(dict_target).allowed is True
    assert engine.evaluate(model_target).allowed is True
    assert engine.evaluate(rejected).allowed is False
