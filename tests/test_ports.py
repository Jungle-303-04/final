from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path
from typing import Any

from packages.events.bus import publish_and_record
from packages.events.envelope import event

ROOT_DIR = Path(__file__).resolve().parents[1]
COMMAND_WORKER_PATH = ROOT_DIR / "services" / "command-worker" / "command_worker.py"


def load_module(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {path}")
    module = importlib.util.module_from_spec(spec)
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
        self.published: list[dict[str, Any]] = []

    async def publish(
        self,
        subject: str,
        source: str,
        payload: dict[str, Any],
        correlation_id: str | None = None,
    ) -> dict[str, Any]:
        created = event(subject, source, payload, correlation_id)
        self.published.append(created)
        return created


class FakeEventClient(FakeEventPublisher):
    pass


class FakeEventRecorder:
    def __init__(self) -> None:
        self.recorded: list[dict[str, Any]] = []

    def record_event(self, evt: dict[str, Any]) -> None:
        self.recorded.append(evt)


class FakeAgentCommandQueue:
    def __init__(self) -> None:
        self.queued: list[tuple[str, dict[str, Any], str]] = []

    def queue_agent_command(self, correlation_id: str, plan: dict[str, Any], status: str) -> None:
        self.queued.append((correlation_id, plan, status))


def test_publish_and_record_uses_event_ports() -> None:
    async def run() -> None:
        publisher = FakeEventPublisher()
        recorder = FakeEventRecorder()

        created = await publish_and_record(
            publisher,
            recorder,
            "command.requested",
            "test",
            {"cluster_id": "target-cluster-01"},
            "corr-1",
        )

        assert created["correlation_id"] == "corr-1"
        assert publisher.published == [created]
        assert recorder.recorded == [created]

    asyncio.run(run())


def test_command_workflow_queues_agent_command_through_port() -> None:
    async def run() -> None:
        module = load_module(COMMAND_WORKER_PATH, "test_command_worker")
        events = FakeEventClient()
        queue = FakeAgentCommandQueue()
        workflow = module.CommandWorkflow(events, queue)

        await workflow.handle(
            {
                "payload": {
                    "cluster_id": "target-cluster-01",
                    "action": "rollout_restart",
                    "namespace": "sandbox",
                },
                "correlation_id": "corr-2",
            }
        )

        assert len(queue.queued) == 1
        correlation_id, plan, status = queue.queued[0]
        assert correlation_id == "corr-2"
        assert plan["cluster_id"] == "target-cluster-01"
        assert status == "queued"
        assert [evt["subject"] for evt in events.published] == [
            "command.dispatch.ready",
            "command.dispatched",
            "command.queued_for_agent",
        ]

    asyncio.run(run())
