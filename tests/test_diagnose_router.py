"""Diagnose HTTP boundary: exact identity, actor isolation, consent, and SSE replay."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

import domains.diagnose.router as diagnose_router
from domains.diagnose.stream import InMemoryDiagnoseEventStream
from packages.contracts.diagnose import (
    DiagnoseAgentAvailability,
    DiagnoseEvent,
    DiagnoseEventDraft,
    DiagnoseEventReplay,
    DiagnoseRun,
    DiagnoseRunCreation,
    DiagnoseRunList,
    DiagnoseRunTransition,
)


class SessionAuth:
    async def require_session(self, _request: Any) -> Any:
        return SimpleNamespace(
            user_id="operator-a",
            workspace_id="workspace-a",
            roles=("user",),
        )


class ControlledEngine:
    def __init__(self, **_kwargs: Any) -> None:
        pass

    async def availability(self, **_kwargs: Any) -> DiagnoseAgentAvailability:
        return DiagnoseAgentAvailability(available=True)

    async def start(self, _run: DiagnoseRun) -> None:
        return None

    async def continue_run(self, _run: DiagnoseRun, _question: str) -> None:
        return None


class DiagnoseDb:
    def __init__(self) -> None:
        self.runs: dict[str, DiagnoseRun] = {}
        self.events: dict[str, list[DiagnoseEvent]] = {}
        self.consents: set[tuple[str, str, str, str, str]] = set()
        self.sequence = 0

    def can_access(self, *_args: Any) -> bool:
        return True

    def get_inventory_resource_by_api_version(self, **identity: Any) -> dict[str, Any] | None:
        if (
            identity["workspace_id"],
            identity["cluster_id"],
            identity["resource_type"],
            identity["api_version"],
            identity["kind"],
            identity["namespace"],
            identity["name"],
        ) != (
            "workspace-a",
            "cluster-a",
            "workload",
            "apps/v1",
            "Deployment",
            "shop",
            "checkout",
        ):
            return None
        return {
            "uid": "uid-checkout",
            "api_version": "apps/v1",
        }

    def latest_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_ids: set[str],
    ) -> dict[str, dict[str, str]]:
        assert workspace_id == "workspace-a"
        return {
            cluster_id: {
                "last_seen_at": datetime.now(UTC).isoformat(),
            }
            for cluster_id in cluster_ids
        }

    async def create_or_get_active(
        self,
        run: DiagnoseRun,
        initial_event: DiagnoseEventDraft,
    ) -> DiagnoseRunCreation:
        existing = next(
            (
                candidate
                for candidate in self.runs.values()
                if candidate.deduplication_key == run.deduplication_key
                and candidate.status in {"queued", "running", "awaiting_confirmation"}
            ),
            None,
        )
        if existing:
            return DiagnoseRunCreation(run=existing, created=False)
        self.runs[run.run_id] = run
        event = self._append(run, initial_event)
        return DiagnoseRunCreation(run=run, created=True, initial_event=event)

    async def get_run(self, *, scope: Any, run_id: str) -> DiagnoseRun | None:
        run = self.runs.get(run_id)
        return run if run and run.target.scope == scope else None

    async def get_user_run(
        self,
        *,
        workspace_id: str,
        requested_by: str,
        run_id: str,
    ) -> DiagnoseRun | None:
        run = self.runs.get(run_id)
        if (
            run is None
            or run.target.scope.workspace_id != workspace_id
            or run.requested_by != requested_by
        ):
            return None
        return run

    async def list_runs(
        self,
        *,
        workspace_id: str,
        requested_by: str,
        limit: int,
    ) -> DiagnoseRunList:
        runs = [
            run
            for run in self.runs.values()
            if run.target.scope.workspace_id == workspace_id and run.requested_by == requested_by
        ][:limit]
        return DiagnoseRunList(runs=tuple(runs), complete=True)

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
        if current.status not in expected_statuses:
            return DiagnoseRunTransition(run=current, changed=False)
        changed = current.model_copy(
            update={
                "status": next_status,
                "status_reason": status_reason,
                "updated_at": event.occurred_at,
            }
        )
        self.runs[run.run_id] = changed
        persisted = self._append(changed, event)
        return DiagnoseRunTransition(run=changed, changed=True, event=persisted)

    async def replay(
        self,
        *,
        scope: Any,
        run_id: str,
        after_sequence: int,
    ) -> DiagnoseEventReplay:
        run = self.runs[run_id]
        assert run.target.scope == scope
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

    async def append_event(
        self,
        run: DiagnoseRun,
        event: DiagnoseEventDraft,
    ) -> DiagnoseEvent:
        return self._append(run, event)

    async def clear_finished(self, *, workspace_id: str, requested_by: str) -> int:
        deleted = [
            run_id
            for run_id, run in self.runs.items()
            if run.target.scope.workspace_id == workspace_id
            and run.requested_by == requested_by
            and run.status not in {"queued", "running", "awaiting_confirmation"}
        ]
        for run_id in deleted:
            self.runs.pop(run_id)
            self.events.pop(run_id)
        return len(deleted)

    async def has_consent(self, **identity: str) -> bool:
        return self._consent_key(**identity) in self.consents

    async def record_consent(self, **identity: str) -> None:
        self.consents.add(self._consent_key(**identity))

    def _append(self, run: DiagnoseRun, draft: DiagnoseEventDraft) -> DiagnoseEvent:
        self.sequence += 1
        event = DiagnoseEvent(
            run_id=run.run_id,
            sequence=len(self.events.get(run.run_id, [])) + 1,
            kind=draft.kind,
            payload=draft.payload,
            occurred_at=draft.occurred_at,
        )
        self.events.setdefault(run.run_id, []).append(event)
        return event

    @staticmethod
    def _consent_key(
        *,
        workspace_id: str,
        requested_by: str,
        agent_id: str,
        disclosure_revision: str,
        surface: str,
    ) -> tuple[str, str, str, str, str]:
        return (
            workspace_id,
            requested_by,
            agent_id,
            disclosure_revision,
            surface,
        )


def app(db: DiagnoseDb) -> FastAPI:
    application = FastAPI()
    application.include_router(diagnose_router.router)
    application.state.db = db
    application.state.auth = SessionAuth()
    application.state.diagnose_events = InMemoryDiagnoseEventStream()
    return application


def consent_payload() -> dict[str, Any]:
    return {
        "scope": {
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "namespaces": [],
            "freshness": "partial",
        },
        "agent_id": diagnose_router.DIAGNOSE_AGENT_ID,
        "disclosure_revision": diagnose_router.DIAGNOSE_DISCLOSURE_REVISION,
        "surface": "browser",
    }


def run_payload(*, uid: str = "uid-checkout") -> dict[str, Any]:
    return {
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "api_group": "apps",
        "api_version": "v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "uid": uid,
        "agent": {
            "agent_id": diagnose_router.DIAGNOSE_AGENT_ID,
            "isolated": True,
            "model": None,
            "effort": "medium",
        },
        "disclosure_revision": diagnose_router.DIAGNOSE_DISCLOSURE_REVISION,
    }


def test_create_requires_consent_and_revalidates_exact_inventory_uid(monkeypatch: Any) -> None:
    db = DiagnoseDb()
    monkeypatch.setattr(diagnose_router, "ContextDiagnoseEngine", ControlledEngine)
    client = TestClient(app(db))

    assert client.post("/diagnose/runs", json=run_payload()).status_code == 409
    assert client.post("/diagnose/consents", json=consent_payload()).status_code == 201
    stale = client.post("/diagnose/runs", json=run_payload(uid="old-uid"))
    assert stale.status_code == 409

    created = client.post("/diagnose/runs", json=run_payload())
    assert created.status_code == 202
    body = created.json()
    assert body["created"] is True
    assert body["run"]["target"]["resource"]["uid"] == "uid-checkout"
    assert body["run"]["target"]["scope"]["freshness"] == "live"
    assert body["run"]["status"] == "running"

    duplicate = client.post("/diagnose/runs", json=run_payload())
    assert duplicate.status_code == 202
    assert duplicate.json()["deduplicated"] is True
    assert duplicate.json()["run"]["run_id"] == body["run"]["run_id"]


def test_history_is_actor_scoped_and_terminal_sse_replays_contiguously(monkeypatch: Any) -> None:
    db = DiagnoseDb()
    monkeypatch.setattr(diagnose_router, "ContextDiagnoseEngine", ControlledEngine)
    client = TestClient(app(db))
    client.post("/diagnose/consents", json=consent_payload())
    created = client.post("/diagnose/runs", json=run_payload()).json()["run"]
    run = db.runs[created["run_id"]]
    terminal = DiagnoseEventDraft(
        kind="closed",
        payload={"status": "completed"},
        occurred_at=datetime.now(UTC),
    )
    asyncio.run(
        db.transition(
            run,
            expected_statuses=("running",),
            next_status="completed",
            event=terminal,
        )
    )

    listed = client.get("/diagnose/runs").json()
    assert [item["run_id"] for item in listed["runs"]] == [run.run_id]

    streamed = client.get(f"/diagnose/runs/{run.run_id}/events")
    assert streamed.status_code == 200
    assert streamed.headers["content-type"].startswith("text/event-stream")
    assert streamed.text.count("event: diagnose") == 3
    assert "id: 1" in streamed.text
    assert "id: 2" in streamed.text
    assert "id: 3" in streamed.text

    conflict = client.get(
        f"/diagnose/runs/{run.run_id}/events?after=1",
        headers={"Last-Event-ID": "2"},
    )
    assert conflict.status_code == 409

    cleared = client.delete("/diagnose/history")
    assert cleared.json() == {"deleted_runs": 1}
    assert client.get("/diagnose/runs").json()["runs"] == []
