"""rca 도메인 HTTP 라우터 — agent evidence 수신(라우터 단위 agent 가드)."""

from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
from dataclasses import replace
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import OperationalError

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
    compact_cluster_evidence_payload,
)
from packages.ai.rule_catalog import validate_catalog_yaml
from packages.config.settings import env
from packages.contracts.auth import Actor
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import (
    AgentEvidenceRequest,
    AlertmanagerWebhookRequest,
    RcaRuleValidateRequest,
    RecoveryActionSelectRequest,
)
from packages.contracts.gateway.responses import (
    AcceptedResponse,
    RcaRuleValidateResponse,
    RecoveryActionCandidateItem,
    RecoveryPlanStatusResponse,
    ValidationErrorItem,
)
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_WORKFLOW_RUN_ID,
    ApprovalStatus,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, Permission, ResourceRole
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


@router.post(gateway_routes.RCA_RULES_VALIDATE_PATH, response_model=RcaRuleValidateResponse)
async def validate_rca_rule_catalog(
    payload: RcaRuleValidateRequest,
    _current: Any = Depends(require_session),
) -> RcaRuleValidateResponse:
    result = validate_catalog_yaml(payload.yaml_text)
    if not result.valid:
        return RcaRuleValidateResponse(
            valid=False,
            errors=[
                ValidationErrorItem(code=issue.code, detail=issue.detail, line=issue.line)
                for issue in result.errors
            ],
        )
    first_rule = result.rules[0] if result.rules else None
    return RcaRuleValidateResponse(
        valid=True,
        matched_symptom=first_rule.symptoms[0] if first_rule else None,
        candidates_count=sum(len(rule.candidates) for rule in result.rules),
    )


def scoped_evidence_key(identity: ClusterAgentIdentity, evidence_key: str | None) -> str | None:
    """agent 가 만든 evidence_key 를 신뢰된 identity 로 네임스페이스.

    evidence_windows 의 PK 가 evidence_key 단일이라, 접두사 없이는 다른 워크스페이스 agent 가
    키를 선점/충돌시켜 증거 억제·event_id/correlation_id 테넌트 누수 가능. 토큰 identity 로
    키 공간을 워크스페이스/클러스터로 분리(body 의 문자열 신뢰 X).
    """
    if not evidence_key:
        return None
    return f"{identity.workspace_id}:{identity.cluster_id}:{evidence_key}"


def agent_evidence_key(identity: ClusterAgentIdentity, payload: AgentEvidenceRequest) -> str:
    scoped_key = scoped_evidence_key(identity, payload.evidence_key)
    if scoped_key:
        return scoped_key
    # 구형 agent 가 evidence_key 를 보내지 않아도 full payload 이벤트 발행은 금지한다.
    # 신뢰된 identity + payload digest 로 안정 키를 만들고 원문은 evidence_windows 에만 둔다.
    data = payload.model_dump(exclude={"correlation_id"})
    data["workspace_id"] = identity.workspace_id
    data["cluster_id"] = identity.cluster_id
    data["evidence_key"] = None
    encoded = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode()).hexdigest()[:32]
    source_id = payload.source_id or DEFAULT_EVIDENCE_SOURCE_ID
    window_start = payload.window_start or payload.correlation_id or "adhoc"
    return f"{identity.workspace_id}:{identity.cluster_id}:{source_id}:{window_start}:{digest}"


def build_cluster_evidence_body(
    payload: AgentEvidenceRequest, identity: ClusterAgentIdentity
) -> ClusterEvidenceReceivedBody:
    # body 의 workspace_id/cluster_id 는 무시하고 토큰 identity 로 덮어씀(테넌트 위조 차단).
    data = payload.model_dump(exclude={"correlation_id"})
    data["workspace_id"] = identity.workspace_id
    data["cluster_id"] = identity.cluster_id
    data["evidence_key"] = agent_evidence_key(identity, payload)
    data["correlation_id"] = payload.correlation_id
    return ClusterEvidenceReceivedBody(**data)


@router.post(gateway_routes.AGENT_EVIDENCE_PATH, response_model=AcceptedResponse)
async def agent_evidence(
    payload: AgentEvidenceRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    events: Any = Depends(get_events),
    db: Any = Depends(get_db),
) -> AcceptedResponse:
    evidence_key = agent_evidence_key(identity, payload)
    evidence_body = build_cluster_evidence_body(payload, identity)
    event_envelope = event(
        evidence_body.__subject__,
        getattr(events, "source", "api-gateway"),
        compact_cluster_evidence_payload(evidence_body, payload.correlation_id),
        payload.correlation_id,
    )
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


# 외부 모니터링 웹훅 — Alertmanager 가 firing 알림을 보내면 인시던트 파이프라인을 연다.
ALERTMANAGER_WEBHOOK_TOKEN_ENV = "ALERTMANAGER_WEBHOOK_TOKEN"
ALERTMANAGER_SOURCE_ID = "alertmanager-webhook"
WEBHOOK_NOT_CONFIGURED = "alertmanager webhook is not configured"
WEBHOOK_TOKEN_INVALID = "invalid webhook token"
CLUSTER_NOT_REGISTERED = "cluster is not registered"
HTTP_UNAUTHORIZED = 401
HTTP_SERVICE_UNAVAILABLE = 503


def require_alertmanager_token(request: Request) -> None:
    """Bearer 토큰 대조 — 토큰 미설정이면 입구 자체를 잠근다(fail-closed)."""
    configured = env(ALERTMANAGER_WEBHOOK_TOKEN_ENV, "")
    if not configured:
        raise HTTPException(status_code=HTTP_SERVICE_UNAVAILABLE, detail=WEBHOOK_NOT_CONFIGURED)
    supplied = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not supplied or not secrets.compare_digest(supplied, configured):
        raise HTTPException(status_code=HTTP_UNAUTHORIZED, detail=WEBHOOK_TOKEN_INVALID)


def alertmanager_evidence_key(
    workspace_id: str, cluster_id: str, payload: AlertmanagerWebhookRequest
) -> str:
    """같은 알림 그룹의 반복 통지(repeat_interval)는 같은 키 → 인시던트 1건으로 dedup.

    새 알림이 그룹에 추가되거나 알림 시작 시각이 바뀌면 키가 바뀌어 새 인시던트가 열린다.
    """
    firing = sorted(
        f"{alert.fingerprint}@{alert.startsAt}"
        for alert in payload.alerts
        if alert.status == "firing"
    )
    raw = "|".join([payload.groupKey, *firing])
    digest = hashlib.sha256(raw.encode()).hexdigest()[:32]
    return f"{workspace_id}:{cluster_id}:alertmanager:{digest}"


def build_alertmanager_evidence_body(
    workspace_id: str,
    cluster_id: str,
    payload: AlertmanagerWebhookRequest,
    evidence_key: str,
) -> ClusterEvidenceReceivedBody:
    firing = [alert.model_dump() for alert in payload.alerts if alert.status == "firing"]
    window_start = min(
        (alert.startsAt for alert in payload.alerts if alert.status == "firing" and alert.startsAt),
        default=None,
    )
    return ClusterEvidenceReceivedBody(
        cluster_id=cluster_id,
        workspace_id=workspace_id,
        kubernetes={},
        metrics={
            "alertmanager": {
                "group_key": payload.groupKey,
                "receiver": payload.receiver,
                "alerts": firing,
            }
        },
        logs=[],
        traces={},
        source_id=ALERTMANAGER_SOURCE_ID,
        window_start=window_start,
        evidence_key=evidence_key,
    )


@router.post(gateway_routes.ALERTMANAGER_WEBHOOK_PATH, response_model=AcceptedResponse)
async def alertmanager_webhook(
    payload: AlertmanagerWebhookRequest,
    request: Request,
    cluster_id: str,
    workspace_id: str = DEFAULT_WORKSPACE_ID,
    events: Any = Depends(get_events),
    db: Any = Depends(get_db),
) -> AcceptedResponse:
    require_alertmanager_token(request)
    registration = await db_call(db.get_cluster_registration, workspace_id, cluster_id)
    if registration is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=CLUSTER_NOT_REGISTERED)

    if not any(alert.status == "firing" for alert in payload.alerts):
        # resolved 만 담긴 통지는 수락만 하고 인시던트를 열지 않는다.
        return AcceptedResponse(accepted=True, event_id="", correlation_id="")

    evidence_key = alertmanager_evidence_key(workspace_id, cluster_id, payload)
    evidence_body = build_alertmanager_evidence_body(
        workspace_id, cluster_id, payload, evidence_key
    )
    event_envelope = event(
        evidence_body.__subject__,
        getattr(events, "source", "api-gateway"),
        compact_cluster_evidence_payload(evidence_body),
        None,
    )
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
        workspace_id=workspace_id,
        cluster_id=cluster_id,
        source_id=ALERTMANAGER_SOURCE_ID,
        window_start=evidence_body.window_start or evidence_key,
        agent_id=None,
        event_envelope=event_envelope,
        payload=evidence_body.to_body(),
    )
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


@router.get(
    gateway_routes.RCA_RECOVERY_PLAN_BY_CORRELATION_PATH,
    response_model=RecoveryPlanStatusResponse,
)
async def recovery_plan_by_correlation(
    correlation_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> RecoveryPlanStatusResponse:
    workspace_id = current.workspace_id
    record = await db_call(db.get_recovery_plan_by_correlation, correlation_id, workspace_id)
    if record is None:
        raise HTTPException(status_code=HTTP_NOT_FOUND, detail=RECOVERY_PLAN_NOT_FOUND)
    plan = RecoveryPlan.from_body(record["payload"])
    cluster_id = str(plan.target.get("cluster_id", ""))
    if cluster_id:
        require_cluster_access(
            db,
            current,
            workspace_id,
            cluster_id,
            Permission.RCA_READ.value,
            detail=RECOVERY_SELECTION_ACCESS_DENIED,
        )
    return recovery_plan_status_response(record, plan)


def recovery_action_candidate_item(
    candidate: RecoveryActionCandidate,
) -> RecoveryActionCandidateItem:
    return RecoveryActionCandidateItem(
        action_id=candidate.action_id,
        title=candidate.title,
        description=candidate.description,
        route=candidate.route,
        rank=candidate.rank,
        score=candidate.score,
        risk_level=candidate.risk_level,
        blast_radius=candidate.blast_radius,
        approval_required=candidate.approval_required,
        prerequisites=candidate.prerequisites,
        validation_checks=candidate.validation_checks,
        rollback_plan=candidate.rollback_plan,
        evidence_refs=candidate.evidence_refs,
    )


def recovery_plan_status_response(
    record: dict[str, Any],
    plan: RecoveryPlan,
) -> RecoveryPlanStatusResponse:
    candidates = [recovery_action_candidate_item(candidate) for candidate in plan.candidates]
    selected_action_id = record.get("selected_action_id")
    selected_action = next(
        (candidate for candidate in candidates if candidate.action_id == selected_action_id),
        None,
    )
    return RecoveryPlanStatusResponse(
        plan_id=plan.plan_id,
        correlation_id=str(record["correlation_id"]),
        incident_id=plan.incident_id,
        evidence_ref=plan.evidence_ref,
        status=str(record["status"]),
        summary=plan.summary,
        target=plan.target,
        recommended_action_id=plan.recommended_action_id,
        execution_route=plan.execution_route,
        selection_required=plan.selection_required,
        selected_action_id=str(selected_action_id) if selected_action_id else None,
        selected_by=str(record["selected_by"]) if record.get("selected_by") else None,
        selected_action=selected_action,
        candidates=candidates,
    )


async def db_call(func: Any, *args: Any, **kwargs: Any) -> Any:
    for attempt in range(3):
        try:
            return await asyncio.to_thread(func, *args, **kwargs)
        except OperationalError as exc:
            if not retryable_db_conflict(exc) or attempt == 2:
                raise
            await asyncio.sleep(0.05 * (attempt + 1))
    raise RuntimeError("unreachable db retry state")


def retryable_db_conflict(exc: OperationalError) -> bool:
    original = getattr(exc, "orig", None)
    sqlstate = getattr(original, "sqlstate", None)
    if sqlstate in {"40P01", "40001"}:
        return True
    text = str(exc).lower()
    return "deadlock detected" in text or "could not serialize access" in text
