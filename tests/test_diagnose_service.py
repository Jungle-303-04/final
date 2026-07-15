"""Diagnose service journeys using injected persistence, stream, and engine adapters."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from domains.diagnose.service import DiagnoseService
from packages.contracts.diagnose import (
    DiagnoseAgentAvailability,
    DiagnoseAgentSelection,
    DiagnoseEvent,
    DiagnoseEventDraft,
    DiagnoseEventReplay,
    DiagnoseRun,
    DiagnoseRunCreateRequest,
    DiagnoseRunCreation,
    DiagnoseRunTransition,
    DiagnoseTarget,
)
from packages.contracts.parity import ClusterScope, ResourceRef


def make_request() -> DiagnoseRunCreateRequest:
    return DiagnoseRunCreateRequest(
        target=DiagnoseTarget(
            scope=ClusterScope(
                workspace_id="workspace-a",
                cluster_id="cluster-a",
                namespaces=("team-a",),
            ),
            resource=ResourceRef(
                api_group="apps",
                version="v1",
                kind="Deployment",
                namespace="team-a",
                name="api",
                uid="deployment-uid",
            ),
        ),
        agent=DiagnoseAgentSelection(agent_id="ops-investigator"),
    )


class InMemoryDiagnoseRepository:
    """Test adapter; production persistence must implement the same protocol durably."""

    def __init__(self) -> None:
        self.runs: dict[str, DiagnoseRun] = {}
        self.active_by_key: dict[str, str] = {}
        self.events: dict[str, list[DiagnoseEvent]] = {}

    async def create_or_get_active(
        self,
        run: DiagnoseRun,
        initial_event: DiagnoseEventDraft,
    ) -> DiagnoseRunCreation:
        active_id = self.active_by_key.get(run.deduplication_key)
        if active_id is not None:
            return DiagnoseRunCreation(run=self.runs[active_id], created=False)

        event = DiagnoseEvent(
            run_id=run.run_id,
            sequence=1,
            kind=initial_event.kind,
            payload=initial_event.payload,
            occurred_at=initial_event.occurred_at,
        )
        self.runs[run.run_id] = run
        self.active_by_key[run.deduplication_key] = run.run_id
        self.events[run.run_id] = [event]
        return DiagnoseRunCreation(run=run, created=True, initial_event=event)

    async def transition(
        self,
        run: DiagnoseRun,
        *,
        expected_statuses: tuple[str, ...],
        next_status: str,
        event: DiagnoseEventDraft,
        status_reason: str | None = None,
    ) -> DiagnoseRunTransition:
        current = self.runs[run.run_id]
        assert current.status in expected_statuses
        next_run = current.model_copy(
            update={
                "status": next_status,
                "status_reason": status_reason,
                "updated_at": event.occurred_at,
            }
        )
        next_event = DiagnoseEvent(
            run_id=run.run_id,
            sequence=len(self.events[run.run_id]) + 1,
            kind=event.kind,
            payload=event.payload,
            occurred_at=event.occurred_at,
        )
        self.runs[run.run_id] = next_run
        self.events[run.run_id].append(next_event)
        return DiagnoseRunTransition(run=next_run, event=next_event, changed=True)

    async def replay(
        self,
        *,
        scope: ClusterScope,
        run_id: str,
        after_sequence: int,
    ) -> DiagnoseEventReplay:
        events = tuple(event for event in self.events[run_id] if event.sequence > after_sequence)
        high_water = self.events[run_id][-1].sequence
        return DiagnoseEventReplay(
            run_id=run_id,
            state="available",
            requested_after_sequence=after_sequence,
            next_cursor_sequence=events[-1].sequence if events else after_sequence,
            high_water_sequence=high_water,
            events=events,
        )


class RecordingStream:
    def __init__(self) -> None:
        self.events: list[DiagnoseEvent] = []

    async def publish(self, event: DiagnoseEvent, *, scope: ClusterScope) -> None:
        assert scope.workspace_id == "workspace-a"
        self.events.append(event)


class AvailableEngine:
    def __init__(self) -> None:
        self.started: list[DiagnoseRun] = []

    async def availability(
        self,
        *,
        target: DiagnoseTarget,
        agent: DiagnoseAgentSelection,
    ) -> DiagnoseAgentAvailability:
        return DiagnoseAgentAvailability(available=True)

    async def start(self, run: DiagnoseRun) -> None:
        self.started.append(run)


class UnavailableEngine(AvailableEngine):
    async def availability(
        self,
        *,
        target: DiagnoseTarget,
        agent: DiagnoseAgentSelection,
    ) -> DiagnoseAgentAvailability:
        return DiagnoseAgentAvailability(available=False, reason="agent adapter is not configured")


class FailingStartEngine(AvailableEngine):
    async def start(self, run: DiagnoseRun) -> None:
        self.started.append(run)
        raise RuntimeError("adapter dispatch failed")


def test_service_deduplicates_an_active_target_without_restarting_the_engine() -> None:
    async def run() -> None:
        repository = InMemoryDiagnoseRepository()
        stream = RecordingStream()
        engine = AvailableEngine()
        identifiers = iter(("run-1", "run-2"))
        service = DiagnoseService(
            repository=repository,
            stream=stream,
            engine=engine,
            run_id_factory=lambda: next(identifiers),
            now=lambda: datetime(2026, 7, 15, tzinfo=UTC),
        )

        first = await service.create_run(make_request(), requested_by="operator-a")
        second = await service.create_run(make_request(), requested_by="operator-a")

        assert first.created is True
        assert first.run.status == "running"
        assert second.deduplicated is True
        assert second.run.run_id == "run-1"
        assert [run.run_id for run in engine.started] == ["run-1"]
        assert [event.payload["status"] for event in stream.events] == ["queued", "running"]
        assert all(event.payload["status"] != "completed" for event in stream.events)

    asyncio.run(run())


def test_service_reports_an_unavailable_engine_without_inventing_a_diagnosis() -> None:
    async def run() -> None:
        repository = InMemoryDiagnoseRepository()
        stream = RecordingStream()
        engine = UnavailableEngine()
        service = DiagnoseService(
            repository=repository,
            stream=stream,
            engine=engine,
            run_id_factory=lambda: "run-unavailable",
            now=lambda: datetime(2026, 7, 15, tzinfo=UTC),
        )

        result = await service.create_run(make_request(), requested_by="operator-a")

        assert result.created is True
        assert result.run.status == "unavailable"
        assert result.run.status_reason == "agent adapter is not configured"
        assert engine.started == []
        assert [event.payload["status"] for event in stream.events] == ["unavailable"]
        assert {event.kind for event in stream.events}.isdisjoint({"verdict", "closed"})

    asyncio.run(run())


def test_service_defaults_to_an_explicit_unavailable_adapter_state() -> None:
    async def run() -> None:
        repository = InMemoryDiagnoseRepository()
        stream = RecordingStream()
        service = DiagnoseService(
            repository=repository,
            stream=stream,
            run_id_factory=lambda: "run-default-unavailable",
            now=lambda: datetime(2026, 7, 15, tzinfo=UTC),
        )

        result = await service.create_run(make_request(), requested_by="operator-a")

        assert result.run.status == "unavailable"
        assert result.run.status_reason == "no Diagnose engine adapter is configured"
        assert [event.payload["status"] for event in stream.events] == ["unavailable"]

    asyncio.run(run())


def test_service_persists_and_streams_a_start_failure_without_a_success_verdict() -> None:
    async def run() -> None:
        repository = InMemoryDiagnoseRepository()
        stream = RecordingStream()
        engine = FailingStartEngine()
        service = DiagnoseService(
            repository=repository,
            stream=stream,
            engine=engine,
            run_id_factory=lambda: "run-failed",
            now=lambda: datetime(2026, 7, 15, tzinfo=UTC),
        )

        result = await service.create_run(make_request(), requested_by="operator-a")

        assert result.run.status == "failed"
        assert result.run.status_reason == "adapter dispatch failed"
        assert [(event.kind, event.payload) for event in stream.events] == [
            ("phase", {"status": "queued"}),
            ("error", {"code": "engine_start_failed", "status": "failed"}),
        ]
        assert not any(event.kind == "verdict" for event in stream.events)

    asyncio.run(run())
