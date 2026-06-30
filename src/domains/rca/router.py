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


def build_cluster_evidence_body(
    payload: AgentEvidenceRequest, identity: ClusterAgentIdentity
) -> ClusterEvidenceReceivedBody:
    # body 의 workspace_id/cluster_id 는 무시하고 토큰 identity 로 덮어쓴다(테넌트 위조 차단).
    data = payload.model_dump(exclude={"correlation_id"})
    data["workspace_id"] = identity.workspace_id
    data["cluster_id"] = identity.cluster_id
    return ClusterEvidenceReceivedBody(**data)


@router.post(gateway_routes.AGENT_EVIDENCE_PATH, response_model=AcceptedResponse)
async def agent_evidence(
    payload: AgentEvidenceRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    events: Any = Depends(get_events),
    db: Any = Depends(get_db),
) -> AcceptedResponse:
    if payload.evidence_key:
        existing = db.get_evidence_window(payload.evidence_key)
        if existing:
            return AcceptedResponse(
                accepted=True,
                event_id=existing["event_id"],
                correlation_id=existing["correlation_id"],
            )

    accepted = await events.accept_body(
        build_cluster_evidence_body(payload, identity),
        payload.correlation_id,
    )
    if payload.evidence_key:
        recorded = db.record_evidence_window(
            payload.evidence_key,
            identity.workspace_id,
            identity.cluster_id,
            payload.source_id or DEFAULT_EVIDENCE_SOURCE_ID,
            payload.window_start or payload.evidence_key,
            payload.agent_id,
            accepted.event.event_id,
            accepted.event.correlation_id,
            payload.model_dump(),
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
