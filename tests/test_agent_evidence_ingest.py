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


class FailingEvents(SpyEvents):
    async def accept_body(
        self, body: object, _correlation_id: str | None = None
    ) -> SimpleNamespace:
        self.accepted += 1
        self.body = body
        raise RuntimeError("event bus unavailable")


class DedupeDb:
    def __init__(self, existing: dict[str, str] | None = None) -> None:
        self.existing = existing
        self.recorded: list[dict[str, object]] = []

    def get_evidence_window(self, _evidence_key: str) -> dict[str, str] | None:
        return self.existing

    def record_evidence_event_once(
        self,
        *,
        evidence_key: str,
        event_envelope: object,
        payload: object,
        **kwargs: object,
    ) -> dict[str, object]:
        self.recorded.append(
            {
                "evidence_key": evidence_key,
                "event_envelope": event_envelope,
                "payload": payload,
                "kwargs": kwargs,
            }
        )
        return {
            "duplicate": False,
            "event_id": event_envelope.event_id,
            "correlation_id": event_envelope.correlation_id,
        }


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


def topology_capacity_kubernetes() -> dict[str, object]:
    return {
        "resource": {
            "kind": "deployment",
            "name": "checkout-api",
            "namespace": "sandbox",
        },
        "pods": [
            {
                "name": "checkout-api-7f5c",
                "namespace": "sandbox",
                "node_name": "worker-a",
                "cpu_mcores": 120.5,
                "mem_mib": 96.0,
                "cpu_request_mcores": 200.0,
                "mem_request_mib": 256.0,
                "cpu_limit_mcores": 500.0,
                "mem_limit_mib": 512.0,
            }
        ],
        "nodes": [
            {
                "name": "worker-a",
                "ready": True,
                "cpu_mcores": 650.0,
                "mem_mib": 2048.0,
                "allocatable_cpu_mcores": 2000.0,
                "allocatable_mem_mib": 4096.0,
                "pod_capacity": 110,
            }
        ],
    }


def test_agent_evidence_dedupes_existing_window_before_emitting_event() -> None:
    events = SpyEvents()
    db = DedupeDb(existing={"event_id": "evt-old", "correlation_id": "corr-old"})

    response = asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    assert response.event_id == "evt-old"
    assert response.correlation_id == "corr-old"
    assert events.accepted == 0


def test_agent_evidence_records_window_and_outbox_without_direct_emit() -> None:
    events = SpyEvents()
    db = DedupeDb()

    response = asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    assert response.event_id
    assert response.correlation_id
    assert events.accepted == 0
    assert db.recorded
    claimed_key = db.recorded[0]["evidence_key"]
    assert claimed_key.startswith("trusted-workspace:trusted-cluster:")
    assert db.recorded[0]["kwargs"]["workspace_id"] == "trusted-workspace"
    assert db.recorded[0]["kwargs"]["cluster_id"] == "trusted-cluster"
    stored_payload = db.recorded[0]["payload"]
    assert stored_payload["workspace_id"] == "trusted-workspace"
    assert stored_payload["cluster_id"] == "trusted-cluster"
    assert stored_payload["evidence_key"] == claimed_key
    event_payload = db.recorded[0]["event_envelope"].payload
    assert event_payload["evidence_key"] == claimed_key
    assert event_payload["kind"] == "cluster_evidence"
    assert event_payload["payload_size"] > 0
    assert event_payload["kubernetes"] == {}
    assert event_payload["metrics"] == {}
    assert event_payload["logs"] == []


def test_agent_evidence_preserves_capacity_fields_in_window_payload() -> None:
    events = SpyEvents()
    db = DedupeDb()
    request = evidence_request().model_copy(
        update={"kubernetes": topology_capacity_kubernetes()}
    )

    asyncio.run(agent_evidence(request, AGENT_IDENTITY, events, db))

    stored_payload = db.recorded[0]["payload"]
    stored_kubernetes = stored_payload["kubernetes"]
    assert stored_kubernetes["pods"][0]["cpu_request_mcores"] == 200.0
    assert stored_kubernetes["pods"][0]["mem_limit_mib"] == 512.0
    assert stored_kubernetes["nodes"][0]["allocatable_cpu_mcores"] == 2000.0
    assert stored_kubernetes["nodes"][0]["pod_capacity"] == 110

    event_payload = db.recorded[0]["event_envelope"].payload
    assert event_payload["kubernetes"] == {}
    assert event_payload["metrics"] == {}
    assert event_payload["logs"] == []
    assert "pods" in event_payload["summary"]["kubernetes_keys"]
    assert "nodes" in event_payload["summary"]["kubernetes_keys"]


def test_agent_evidence_reuses_existing_window_without_outbox_duplicate() -> None:
    events = SpyEvents()
    db = DedupeDb(existing={"event_id": "evt-old", "correlation_id": "corr-old"})

    response = asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    assert response.event_id == "evt-old"
    assert response.correlation_id == "corr-old"
    assert events.accepted == 0
    assert db.recorded == []


def test_agent_evidence_without_key_records_window_reference_outbox() -> None:
    events = SpyEvents()
    db = DedupeDb()
    request = evidence_request().model_copy(update={"evidence_key": None})

    response = asyncio.run(agent_evidence(request, AGENT_IDENTITY, events, db))

    assert response.event_id
    assert response.correlation_id
    assert events.accepted == 0
    assert len(db.recorded) == 1
    recorded = db.recorded[0]
    claimed_key = recorded["evidence_key"]
    assert claimed_key.startswith("trusted-workspace:trusted-cluster:cluster-snapshot:")
    assert recorded["payload"]["evidence_key"] == claimed_key
    event_payload = recorded["event_envelope"].payload
    assert event_payload["evidence_key"] == claimed_key
    assert event_payload["kind"] == "cluster_evidence"
    assert event_payload["kubernetes"] == {}


def test_agent_evidence_key_is_namespaced_by_trusted_identity() -> None:
    # body 의 evidence_key 접두사("workspace-1:cluster-1:...")가 아니라 토큰 identity 로
    # 네임스페이스돼야 함 — 다른 워크스페이스 키 선점/충돌(증거 억제) 차단.
    events = SpyEvents()
    db = DedupeDb()

    asyncio.run(agent_evidence(evidence_request(), AGENT_IDENTITY, events, db))

    recorded_key = db.recorded[0]["evidence_key"]
    assert recorded_key.startswith("trusted-workspace:trusted-cluster:")
    # agent 가 위조한 workspace-1 접두사가 키 선두를 차지하지 못함.
    assert not recorded_key.startswith("workspace-1:")
