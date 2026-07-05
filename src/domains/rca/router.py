"""rca 도메인 HTTP 라우터 — agent evidence 수신(라우터 단위 agent 가드)."""

from __future__ import annotations

import asyncio
import hashlib
from dataclasses import replace
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import (
    ClusterAgentIdentity,
    require_cluster_access,
    require_cluster_agent,
    require_session,
)
from domains.rca.events import (
    ClusterEvidenceReceivedBody,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
)
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import AgentEvidenceRequest, RecoveryActionSelectRequest
from packages.contracts.gateway.responses import AcceptedResponse
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_WORKFLOW_RUN_ID,
    ApprovalStatus,
)
from packages.contracts.identity import Permission, ResourceRole
from packages.events.envelope import event
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null

# per-cluster 토큰 인증 — evidence 의 workspace/cluster 는 토큰 identity 에서만 취함.
router = APIRouter()
DEFAULT_EVIDENCE_SOURCE_ID = "cluster-snapshot"
RECOVERY_PLAN_NOT_FOUND = "recovery plan not found"
RECOVERY_ACTION_NOT_FOUND = "recovery action not found"
RECOVERY_PLAN_ALREADY_RESOLVED = "recovery plan already resolved"
RECOVERY_SELECTION_ACCESS_DENIED = "recovery selection access denied"
HTTP_NOT_FOUND = 404
HTTP_CONFLICT = 409


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
    evidence_body = build_cluster_evidence_body(payload, identity)
    event_envelope = event(
        evidence_body.__subject__,
        getattr(events, "source", "api-gateway"),
        evidence_body.to_body(),
        payload.correlation_id,
    )
    if evidence_key:
        existing = await db_call(db.get_evidence_window, evidence_key)
        if existing:
            return AcceptedResponse(
                accepted=True,
                event_id=existing["event_id"],
                correlation_id=existing["correlation_id"],
            )
        recorded = await db_call(
            db.record_evidence_event_once,
            evidence_key=evidence_key,
            workspace_id=identity.workspace_id,
            cluster_id=identity.cluster_id,
            source_id=evidence_body.source_id or DEFAULT_EVIDENCE_SOURCE_ID,
            window_start=evidence_body.window_start or evidence_body.evidence_key or evidence_key,
            agent_id=evidence_body.agent_id,
            event_envelope=event_envelope,
            payload=evidence_body.to_body(),
        )
        return AcceptedResponse(
            accepted=True,
            event_id=recorded["event_id"],
            correlation_id=recorded["correlation_id"],
        )
    recorded = await db_call(db.stage_event_once, event_envelope)
    return AcceptedResponse(
        accepted=True,
        event_id=recorded["event_id"],
        correlation_id=recorded["correlation_id"],
    )


def recovery_approval_id(plan_id: str, action_id: str) -> str:
    raw = f"{plan_id}|{action_id}|recovery-action"
    return f"approval-{hashlib.sha256(raw.encode()).hexdigest()[:32]}"


def recovery_policy_decision_ref(approval_ref: str) -> str:
    return f"recovery:{approval_ref}:selected"


def candidate_by_action_id(
    plan: RecoveryPlan,
    action_id: str,
) -> RecoveryActionCandidate:
    for candidate in plan.candidates:
        if candidate.action_id == action_id:
            return candidate
    raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RECOVERY_ACTION_NOT_FOUND)


def candidate_with_approval(
    candidate: RecoveryActionCandidate,
    *,
    approval_ref: str,
    policy_decision_ref: str,
) -> RecoveryActionCandidate:
    draft = candidate.draft
    return replace(
        candidate,
        draft=replace(
            draft,
            params={
                **draft.params,
                "approval_ref": approval_ref,
                "policy_decision_ref": policy_decision_ref,
            },
        ),
    )


def recovery_approval_payload(
    plan: RecoveryPlan,
    selected: RecoveryActionCandidate,
    *,
    workspace_id: str,
    approval_ref: str,
    policy_decision_ref: str,
    selected_by: str,
    reason: str,
) -> dict[str, Any]:
    params = selected.draft.params
    return {
        "approval_id": approval_ref,
        "workflow_run_id": str(params.get("workflow_run_id", DEFAULT_WORKFLOW_RUN_ID)),
        "workspace_id": str(
            plan.target.get("workspace_id") or params.get("workspace_id") or workspace_id
        ),
        "application_id": str(params.get("application_id", DEFAULT_APPLICATION_ID)),
        "binding_id": str(params.get("binding_id", DEFAULT_DEPLOYMENT_BINDING_ID)),
        "environment": str(params.get("environment", DEFAULT_ENVIRONMENT)),
        "status": ApprovalStatus.GRANTED.value,
        "reason": reason,
        "requested_role": ResourceRole.RELEASE_OPERATOR.value,
        "requested_by": selected_by,
        "decided_by": selected_by,
        "decision": "selected",
        "details": {
            "approval_ref": approval_ref,
            "policy_decision_ref": policy_decision_ref,
            "recovery_plan_id": plan.plan_id,
            "recovery_action_id": selected.action_id,
            "selected_candidate": selected.to_body(),
        },
    }


@router.post(gateway_routes.RCA_RECOVERY_ACTION_SELECT_PATH, response_model=AcceptedResponse)
async def select_recovery_action(
    plan_id: str,
    action_id: str,
    payload: RecoveryActionSelectRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> AcceptedResponse:
    workspace_id = current.workspace_id
    record = db.get_recovery_plan(plan_id, workspace_id)
    if record is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RECOVERY_PLAN_NOT_FOUND)
    plan = RecoveryPlan.from_body(record["payload"])
    cluster_id = str(plan.target.get("cluster_id", ""))
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.DEPLOY_RUN.value,
        detail=RECOVERY_SELECTION_ACCESS_DENIED,
    )
    selected = candidate_by_action_id(plan, action_id)
    approval_ref = recovery_approval_id(plan.plan_id, selected.action_id)
    policy_decision_ref = recovery_policy_decision_ref(approval_ref)
    selected = candidate_with_approval(
        selected,
        approval_ref=approval_ref,
        policy_decision_ref=policy_decision_ref,
    )
    reason = payload.reason or f"operator selected recovery action: {selected.title}"
    with unit_of_work_or_null(db):
        selected_record = db.select_recovery_plan_action_if_open(
            plan.plan_id,
            workspace_id,
            selected.action_id,
            current.user_id,
        )
        if selected_record is None:
            raise HTTPException(status_code=HTTP_CONFLICT, detail=RECOVERY_PLAN_ALREADY_RESOLVED)
        db.request_workflow_approval(
            recovery_approval_payload(
                plan,
                selected,
                workspace_id=workspace_id,
                approval_ref=approval_ref,
                policy_decision_ref=policy_decision_ref,
                selected_by=current.user_id,
                reason=reason,
            )
        )
        accepted = await events.accept_body(
            RecoveryActionSelectedBody(
                plan=plan,
                selected=selected,
                selected_by=current.user_id,
                auto_selected=False,
                reason=reason,
                workspace_id=workspace_id,
            ),
            correlation_id=str(record["correlation_id"]),
            actor=Actor(current.user_id, tuple(current.roles)),
        )
    return AcceptedResponse(
        accepted=True,
        event_id=accepted.event.event_id,
        correlation_id=accepted.event.correlation_id,
    )


async def db_call(func: Any, *args: Any, **kwargs: Any) -> Any:
    return await asyncio.to_thread(func, *args, **kwargs)
