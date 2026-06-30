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
    recorded_key = db.recorded[0][0]
    assert events.body.evidence_key == recorded_key
    assert recorded_key.startswith("trusted-workspace:trusted-cluster:")
    assert db.recorded[0][1:3] == ("trusted-workspace", "trusted-cluster")
    stored_payload = db.recorded[0][-1]
    assert stored_payload["workspace_id"] == "trusted-workspace"
    assert stored_payload["cluster_id"] == "trusted-cluster"
    assert stored_payload["evidence_key"] == recorded_key


def test_agent_evidence_key_is_namespaced_by_trusted_identity() -> None:
    # body 의 evidence_key 접두사("workspace-1:cluster-1:...")가 아니라 토큰 identity 로
    # 네임스페이스돼야 한다 — 다른 워크스페이스 키 선점/충돌(증거 억제) 차단.
    events = SpyEvents()
    db = DedupeDb()

    asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    recorded_key = db.recorded[0][0]
    assert recorded_key.startswith("trusted-workspace:trusted-cluster:")
    # agent 가 위조한 workspace-1 접두사가 키 선두를 차지하지 못한다.
    assert not recorded_key.startswith("workspace-1:")
