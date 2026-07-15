from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager

from conftest import load_service

from domains.gitops.events import GitWebhookReceivedBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.gitops import WorkflowMutation
from packages.contracts.interfaces import EventProcessingRecord
from packages.events.envelope import event
from packages.runtime.worker import EventProcessor, EventRetryPolicy


class _Message:
    def __init__(self, payload: dict[str, object]) -> None:
        self.data = json.dumps(payload).encode()
        self.acked = False
        self.nak_delay: int | None = None

    async def ack(self) -> None:
        self.acked = True

    async def nak(self, delay: int = 0) -> None:
        self.nak_delay = delay


class _DeadLetters:
    async def capture(
        self,
        _evt: EventEnvelope,
        _consumer: str,
        _error: Exception,
        _attempts: int,
    ) -> EventEnvelope:
        raise AssertionError("retryable Timeline append must not dead-letter")

    async def capture_raw(self, _raw: bytes, _consumer: str, _error: Exception) -> EventEnvelope:
        raise AssertionError("the workflow message is valid")


class _RollbackStore:
    """A minimal worker store recording the source transaction boundary."""

    def __init__(self) -> None:
        self.steps: list[str] = []
        self.staged: list[EventEnvelope] = []
        self.fanout: list[object] = []
        self._unit_of_work_count = 0

    @contextmanager
    def unit_of_work(self):
        self._unit_of_work_count += 1
        label = "claim" if self._unit_of_work_count == 1 else "workflow"
        self.steps.append(f"{label}_begin")
        try:
            yield self
        except Exception:
            self.steps.append(f"{label}_rollback")
            raise
        else:
            self.steps.append(f"{label}_commit")

    def record_event(self, _evt: EventEnvelope) -> None:
        return None

    def begin_event_processing(self, _evt: EventEnvelope, _consumer: str) -> EventProcessingRecord:
        return EventProcessingRecord(status=EventProcessingStatus.PROCESSING, attempts=1)

    def finish_event_processing(
        self, _evt: EventEnvelope, _consumer: str, duration_ms: int | None = None
    ) -> None:
        raise AssertionError("a rolled-back workflow must not finish processing")

    def fail_event_processing(
        self,
        _evt: EventEnvelope,
        _consumer: str,
        _error: str,
        _status: str,
        duration_ms: int | None = None,
    ) -> None:
        self.steps.append("retry")

    def stage_events(self, _conn: object, events: list[EventEnvelope]) -> None:
        self.staged.extend(events)

    def upsert_application(self, _payload: dict[str, object]) -> dict[str, object]:
        return {}

    def start_workflow_run(self, _payload: dict[str, object]) -> WorkflowMutation:
        self.steps.append("run_mutation")
        return WorkflowMutation(applied=True)

    def append_timeline_event(self, _event: object) -> object:
        self.steps.append("timeline_append")
        raise RuntimeError("timeline ledger unavailable")


def test_workflow_timeline_append_failure_rolls_back_without_outbox_or_fanout() -> None:
    async def run() -> None:
        workflow = load_service("gitops/workflow-controller")
        store = _RollbackStore()
        handler = workflow.app.handler_spec().handler_factory(object(), store)
        body = GitWebhookReceivedBody(
            commit_sha="abc123",
            image="checkout:new",
            replicas=2,
            workspace_id="workspace-1",
            repository_id="repo-1",
            watch_target_id="watch-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="prod",
        )
        source = event(
            body.__subject__,
            "git-pull-worker",
            body.to_body(),
            "correlation-1",
            workspace_id="workspace-1",
        )
        message = _Message(source.to_dict())
        processor = EventProcessor(
            "workflow-controller",
            handler,
            store,  # type: ignore[arg-type]
            _DeadLetters(),  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2, retry_delay_seconds=3),
        )

        await processor.process(message)

        assert store.steps == [
            "claim_begin",
            "claim_commit",
            "workflow_begin",
            "run_mutation",
            "timeline_append",
            "workflow_rollback",
            "retry",
        ]
        assert store.staged == []
        assert store.fanout == []
        assert message.acked is False
        assert message.nak_delay == 3

    asyncio.run(run())
