"""rca 도메인 HTTP 라우터 — agent evidence 수신(라우터 단위 agent 가드)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from domains.identity.dependencies import ClusterAgentIdentity, require_cluster_agent
from packages.contracts.event_bus.bodies import ClusterEvidenceReceivedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import AgentEvidenceRequest
from packages.contracts.gateway.responses import AcceptedResponse
from packages.runtime.dependencies import get_db, get_events

# per-cluster 토큰 인증 — evidence 의 workspace/cluster 는 토큰 identity 에서만 취한다.
router = APIRouter(dependencies=[Depends(require_cluster_agent)])
DEFAULT_EVIDENCE_SOURCE_ID = "cluster-snapshot"


def scoped_evidence_key(identity: ClusterAgentIdentity, evidence_key: str | None) -> str | None:
    """agent 가 만든 evidence_key 를 신뢰된 identity 로 네임스페이스.

    evidence_windows 의 PK 는 evidence_key 단일이라, 네임스페이스가 없으면 워크스페이스 B 의
    agent 가 워크스페이스 A 의 키를 선점/충돌시켜 A 의 증거를 중복으로 묻거나(증거 억제)
    A 의 event_id/correlation_id 를 돌려받을 수 있다(테넌트 누수). 접두사를 토큰 identity 에서
    뽑아 키 공간을 워크스페이스/클러스터로 분리한다(body 의 문자열 신뢰 X).
    """
    if not evidence_key:
        return None
    return f"{identity.workspace_id}:{identity.cluster_id}:{evidence_key}"


def build_cluster_evidence_body(
    payload: AgentEvidenceRequest, identity: ClusterAgentIdentity
) -> ClusterEvidenceReceivedBody:
    # body 의 workspace_id/cluster_id 는 무시하고 토큰 identity 로 덮어쓴다(테넌트 위조 차단).
    data = payload.model_dump(exclude={"correlation_id"})
    data["workspace_id"] = identity.workspace_id
    data["cluster_id"] = identity.cluster_id
    data["evidence_key"] = scoped_evidence_key(identity, payload.evidence_key)
    return ClusterEvidenceReceivedBody(**data)


@router.post(gateway_routes.AGENT_EVIDENCE_PATH, response_model=AcceptedResponse)
async def agent_evidence(
    payload: AgentEvidenceRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    events: Any = Depends(get_events),
    db: Any = Depends(get_db),
) -> AcceptedResponse:
    evidence_key = scoped_evidence_key(identity, payload.evidence_key)
    if evidence_key:
        existing = db.get_evidence_window(evidence_key)
        if existing:
            return AcceptedResponse(
                accepted=True,
                event_id=existing["event_id"],
                correlation_id=existing["correlation_id"],
            )

    evidence_body = build_cluster_evidence_body(payload, identity)
    accepted = await events.accept_body(evidence_body, payload.correlation_id)
    if evidence_key:
        recorded = db.record_evidence_window(
            evidence_key,
            identity.workspace_id,
            identity.cluster_id,
            evidence_body.source_id or DEFAULT_EVIDENCE_SOURCE_ID,
            evidence_body.window_start or evidence_body.evidence_key,
            evidence_body.agent_id,
            accepted.event.event_id,
            accepted.event.correlation_id,
            evidence_body.to_body(),
        )
        if recorded["duplicate"]:
            return AcceptedResponse(
                accepted=True,
                event_id=recorded["event_id"],
                correlation_id=recorded["correlation_id"],
            )
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )
