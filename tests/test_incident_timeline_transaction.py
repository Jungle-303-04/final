from __future__ import annotations

import asyncio
import json
from contextlib import contextmanager

from conftest import load_service

from domains.rca.events import Evidence, EvidenceBuiltBody
from packages.contracts.event_bus.interfaces import EventEnvelope
from packages.contracts.event_bus.processing import EventProcessingStatus
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
        raise AssertionError("the evidence event is valid")


class _RollbackStore:
    """Minimal source transaction store that fails before an outbox can be staged."""

    def __init__(self) -> None:
        self.steps: list[str] = []
        self.staged: list[EventEnvelope] = []
        self.fanout: list[object] = []
        self._unit_of_work_count = 0

    @contextmanager
    def unit_of_work(self):
        self._unit_of_work_count += 1
        label = "claim" if self._unit_of_work_count == 1 else "incident"
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
        raise AssertionError("a rolled-back incident must not finish processing")

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

    def claim_incident_signal(self, *_args: object) -> bool:
        self.steps.append("incident_claim")
        return True

    def append_timeline_event(self, _event: object) -> object:
        self.steps.append("timeline_append")
        raise RuntimeError("timeline ledger unavailable")


def _confirmed_evidence() -> Evidence:
    return Evidence(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        object_ref="object://evidence/oom.json",
        kubernetes={
            "severity": "high",
            "pods": [
                {
                    "uid": "pod-uid-1",
                    "name": "game-server-abc",
                    "namespace": "color-turf",
                    "owner_kind": "ReplicaSet",
                    "owner_name": "game-server-5cb84b9d77",
                    "restart_total": 1,
                    "terminated_reasons": ["OOMKilled"],
                    "containers": [
                        {
                            "name": "server",
                            "restart_count": 1,
                            "last_state": "terminated",
                            "last_state_reason": "OOMKilled",
                            "last_exit_code": 137,
                            "last_finished_at": "2026-07-15T01:56:19Z",
                        }
                    ],
                }
            ],
        },
        metrics={"oom_last_terminated": 1},
        logs=[{"line": "container terminated reason=OOMKilled"}],
        traces={},
    )


def test_incident_timeline_append_failure_rolls_back_without_outbox_or_fanout() -> None:
    async def run() -> None:
        incident_worker = load_service("ai/incident-worker")
        store = _RollbackStore()
        handler = incident_worker.app.handler_spec().handler_factory(object(), store)
        body = EvidenceBuiltBody(evidence=_confirmed_evidence())
        source = event(
            body.__subject__,
            "evidence-worker",
            body.to_body(),
            "correlation-1",
            workspace_id="workspace-1",
        )
        message = _Message(source.to_dict())
        processor = EventProcessor(
            "incident-worker",
            handler,
            store,  # type: ignore[arg-type]
            _DeadLetters(),  # type: ignore[arg-type]
            EventRetryPolicy(max_attempts=2, retry_delay_seconds=3),
        )

        await processor.process(message)

        assert store.steps == [
            "claim_begin",
            "claim_commit",
            "incident_begin",
            "incident_claim",
            "timeline_append",
            "incident_rollback",
            "retry",
        ]
        assert store.staged == []
        assert store.fanout == []
        assert message.acked is False
        assert message.nak_delay == 3

    asyncio.run(run())
