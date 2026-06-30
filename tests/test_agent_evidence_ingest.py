from __future__ import annotations

import asyncio
from types import SimpleNamespace

from domains.identity.dependencies import ClusterAgentIdentity
from domains.rca.router import agent_evidence
from packages.contracts.gateway.requests import AgentEvidenceRequest

AGENT_IDENTITY = ClusterAgentIdentity(
    workspace_id="trusted-workspace",
    cluster_id="trusted-cluster",
)


class SpyEvents:
    def __init__(self) -> None:
        self.accepted = 0
        self.body: object | None = None

    async def accept_body(
        self, body: object, _correlation_id: str | None = None
    ) -> SimpleNamespace:
        self.accepted += 1
        self.body = body
        return SimpleNamespace(event=SimpleNamespace(event_id="evt-new", correlation_id="corr-new"))


class DedupeDb:
    def __init__(self, existing: dict[str, str] | None = None) -> None:
        self.existing = existing
        self.recorded: list[tuple[object, ...]] = []

    def get_evidence_window(self, _evidence_key: str) -> dict[str, str] | None:
        return self.existing

    def record_evidence_window(self, evidence_key: str, *_args: object) -> dict[str, object]:
        self.recorded.append((evidence_key, *_args))
        return {"duplicate": False, "event_id": "evt-new", "correlation_id": "corr-new"}


def evidence_request() -> AgentEvidenceRequest:
    return AgentEvidenceRequest(
        cluster_id="cluster-1",
        workspace_id="workspace-1",
        agent_id="agent-1",
        source_id="cluster-snapshot",
        window_start="2026-06-30T00:00:00+00:00",
        evidence_key="workspace-1:cluster-1:cluster-snapshot:2026-06-30T00:00:00+00:00",
        kubernetes={},
        metrics={},
        logs=[],
        traces={},
    )


def test_agent_evidence_dedupes_existing_window_before_emitting_event() -> None:
    events = SpyEvents()
    db = DedupeDb(existing={"event_id": "evt-old", "correlation_id": "corr-old"})

    response = asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    assert response.event_id == "evt-old"
    assert response.correlation_id == "corr-old"
    assert events.accepted == 0


def test_agent_evidence_records_new_window_after_emit() -> None:
    events = SpyEvents()
    db = DedupeDb()

    response = asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    assert response.event_id == "evt-new"
    assert response.correlation_id == "corr-new"
    assert events.accepted == 1
    assert events.body is not None
    assert events.body.workspace_id == "trusted-workspace"
    assert events.body.cluster_id == "trusted-cluster"
    assert db.recorded
    assert db.recorded[0][1:3] == ("trusted-workspace", "trusted-cluster")
