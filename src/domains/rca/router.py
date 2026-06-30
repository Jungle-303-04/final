"""rca 도메인 HTTP 라우터 — agent evidence 수신(라우터 단위 agent 가드)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from domains.identity.dependencies import require_agent
from packages.contracts.event_bus.bodies import ClusterEvidenceReceivedBody
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import AgentEvidenceRequest
from packages.contracts.gateway.responses import AcceptedResponse
from packages.runtime.dependencies import get_events

router = APIRouter(dependencies=[Depends(require_agent)])


def build_cluster_evidence_body(payload: AgentEvidenceRequest) -> ClusterEvidenceReceivedBody:
    # TODO(gateway): source agent, evidence size, redaction status, correlation scope 검증
    return ClusterEvidenceReceivedBody(**payload.model_dump(exclude={"correlation_id"}))


@router.post(gateway_routes.AGENT_EVIDENCE_PATH, response_model=AcceptedResponse)
async def agent_evidence(
    payload: AgentEvidenceRequest, events: Any = Depends(get_events)
) -> AcceptedResponse:
    accepted = await events.accept_body(
        build_cluster_evidence_body(payload),
        payload.correlation_id,
    )
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )
