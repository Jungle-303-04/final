"""Ports needed to persist, replay, stream, and dispatch Diagnose investigations."""

from __future__ import annotations

from typing import Protocol

from packages.contracts.diagnose.models import (
    DiagnoseAgentAvailability,
    DiagnoseAgentSelection,
    DiagnoseEvent,
    DiagnoseEventDraft,
    DiagnoseEventReplay,
    DiagnoseRun,
    DiagnoseRunCreation,
    DiagnoseRunStatus,
    DiagnoseRunTransition,
    DiagnoseTarget,
)
from packages.contracts.parity import ClusterScope


class DiagnoseRunRepository(Protocol):
    """Durable authority; create/transition calls persist their event atomically."""

    async def create_or_get_active(
        self,
        run: DiagnoseRun,
        initial_event: DiagnoseEventDraft,
    ) -> DiagnoseRunCreation: ...

    async def get_run(self, *, scope: ClusterScope, run_id: str) -> DiagnoseRun | None: ...

    async def transition(
        self,
        run: DiagnoseRun,
        *,
        expected_statuses: tuple[DiagnoseRunStatus, ...],
        next_status: DiagnoseRunStatus,
        event: DiagnoseEventDraft,
        status_reason: str | None = None,
    ) -> DiagnoseRunTransition: ...

    async def replay(
        self,
        *,
        scope: ClusterScope,
        run_id: str,
        after_sequence: int,
    ) -> DiagnoseEventReplay: ...


class DiagnoseEventSubscription(Protocol):
    async def next(self) -> DiagnoseEvent: ...

    async def close(self) -> None: ...


class DiagnoseEventStream(Protocol):
    """Best-effort fan-out only; callers publish after the repository commits."""

    async def publish(self, event: DiagnoseEvent, *, scope: ClusterScope) -> None: ...

    async def subscribe(
        self,
        *,
        scope: ClusterScope,
        run_id: str,
    ) -> DiagnoseEventSubscription: ...


class DiagnoseEngine(Protocol):
    """Injected Python investigation adapter, never an upstream server runtime."""

    async def availability(
        self,
        *,
        target: DiagnoseTarget,
        agent: DiagnoseAgentSelection,
    ) -> DiagnoseAgentAvailability: ...

    async def start(self, run: DiagnoseRun) -> None: ...
