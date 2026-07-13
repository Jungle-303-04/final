"""rca-feedback-worker — RCA blocked/action/fallback을 후속 조치 이벤트로 정규화."""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import replace

from domains.rca.events import (
    RcaActionRequiredBody,
    RcaAiFallbackRequestedBody,
    RcaAnalysisBlockedBody,
    RcaCompletedBody,
    RcaFollowupRequiredBody,
    RecoveryPlannedBody,
)
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from packages.contracts.event_bus.bodies.platform import PipelineContractFailedBody
from packages.runtime.app import App
from services.ai.agent.recovery.engine import RecoveryPlanner

app = App("rca-feedback-worker")

SEVERITY_WARNING = "warning"
NON_ACTIONABLE_ROOT_CAUSES = {
    "",
    "unknown",
    "insufficient_evidence",
    "none",
    "분석 가능한 원인 후보 없음",
}
FOLLOWUP_SUMMARIES = {
    "rule_missing": "대표 증상에 맞는 RCA rule이 없어 자동 원인 확정을 중단했습니다.",
    "insufficient_evidence": "원인 후보는 있지만 필요한 근거가 부족해 자동 RCA 확정을 중단했습니다.",
    "evidence_missing": "원인 후보는 있지만 필요한 근거가 부족해 자동 RCA 확정을 중단했습니다.",
    "no_evaluation": "평가 가능한 원인 후보가 없어 root cause를 선택하지 못했습니다.",
    "context_missing": "worker 간 이벤트 payload에 필수 RCA context가 없어 분석을 진행하지 못했습니다.",
    "action_required": "자동 진행이 차단되어 운영자 조치가 필요합니다.",
    "ai_fallback_required": "대표 증상에 맞는 RCA rule이 없어 AI fallback 검토가 필요합니다.",
    "gitops_authority_unavailable": "Safe PR 생성을 위한 GitOps 권위 context가 없어 운영자 조치가 필요합니다.",
    "gitops_authority_mismatch": "Safe PR 대상과 GitOps 권위 context가 일치하지 않아 운영자 확인이 필요합니다.",
    "safe_pr_patch_missing": "Safe PR에 적용할 구체적인 manifest patch가 없어 운영자 조치가 필요합니다.",
    "safe_pr_patch_unsupported": "선택한 복구 조치를 현재 Safe PR patch로 변환할 수 없습니다.",
}
MISSING_EVIDENCE_LABELS = {
    "kubernetes": "Kubernetes 상태 근거",
    "kubernetes:cluster_resource_state": "Kubernetes 상태 근거",
    "metrics": "메트릭 근거",
    "metrics:telemetry_metrics": "메트릭 근거",
    "logs": "관련 Pod 로그",
    "logs:related_logs": "관련 Pod 로그",
    "traces": "trace 근거",
    "traces:related_traces": "trace 근거",
    "metadata": "metadata 근거",
    "metadata:current_workload_snapshot": "대상 Workload 상세 snapshot",
    "metadata:current_workload_snapshots": "Workload snapshot 목록",
    "metadata:change_context": "최근 변경 이력",
    "matching_cause_rule": "대표 증상에 맞는 RCA rule",
    "gitops_authority_context": "GitOps 권위 context",
    "matching_gitops_authority_context": "대상과 일치하는 GitOps 권위 context",
    "patchable_authority_snapshot": "patch 생성 가능한 GitOps snapshot",
    "supported_patch_action": "지원 가능한 Safe PR patch action",
    "manifest_patch": "구체적인 manifest patch",
}

planner = RecoveryPlanner()


def followup_summary(reason_code: str, fallback: str) -> str:
    return FOLLOWUP_SUMMARIES.get(reason_code, fallback)


def missing_evidence_label(source: str) -> str:
    if source in MISSING_EVIDENCE_LABELS:
        return MISSING_EVIDENCE_LABELS[source]
    if source.startswith("signal:"):
        signal_id = source.removeprefix("signal:").replace("_", " ")
        return f"판별 신호({signal_id})"
    if ":" in source:
        evidence_source, evidence_name = source.split(":", 1)
        return f"{evidence_source} {evidence_name.replace('_', ' ')} 근거"
    return source


def collect_actions_for_missing(missing_evidence: list[str]) -> list[JsonObject]:
    return [
        {
            "action_type": "collect_evidence",
            "source": source,
            "query_id": f"collect_{source}",
            "description": (
                f"{missing_evidence_label(source)}를 수집한 뒤 RCA 평가를 재실행합니다."
            ),
        }
        for source in missing_evidence
    ]


def normalize_next_actions(
    next_actions: list[JsonObject], missing_evidence: list[str]
) -> list[JsonObject]:
    if next_actions:
        return next_actions
    if missing_evidence:
        return collect_actions_for_missing(missing_evidence)
    return [
        {
            "action_type": "manual_review",
            "description": "자동 후속 조치를 결정할 정보가 부족해 운영자 검토가 필요합니다.",
        }
    ]


@app.on(RcaAnalysisBlockedBody)
async def on_rca_analysis_blocked(evt: RcaAnalysisBlockedBody) -> AsyncIterator[EventBody]:
    yield RcaFollowupRequiredBody(
        reason_code=evt.reason_code,
        summary=followup_summary(evt.reason_code, evt.reason),
        evidence_ref=evt.evidence_ref,
        workspace_id=evt.workspace_id,
        severity=evt.severity,
        incident=evt.incident,
        missing_evidence=evt.missing_evidence,
        next_actions=normalize_next_actions(evt.next_actions, evt.missing_evidence),
        diagnostics={
            **evt.diagnostics,
            "source_event": evt.__subject__,
            "agent_safe": True,
        },
    )
    planned = blocked_recovery_plan(evt)
    if planned is not None:
        yield planned


def blocked_recovery_plan(evt: RcaAnalysisBlockedBody) -> RecoveryPlannedBody | None:
    """근거가 일부 부족해도 원인 후보가 식별되면 승인형 복구 후보를 노출한다.

    analysis_blocked 경로에서는 자동 실행을 절대 하지 않고 selection_required 계획만 만든다.
    """

    if evt.incident is None or evt.rca_detail is None or evt.rule_missing is not None:
        return None
    if evt.rca_detail.root_cause.strip().lower() in NON_ACTIONABLE_ROOT_CAUSES:
        return None
    report = RcaCompletedBody(
        root_cause=evt.rca_detail.root_cause,
        action="plan_recovery",
        evidence_ref=evt.evidence_ref,
        workspace_id=evt.workspace_id,
        evidence=evt.evidence,
        incident=evt.incident,
        evidence_bundle=evt.evidence_bundle,
        candidates=evt.candidates,
        evaluations=evt.evaluations,
        rca_detail=evt.rca_detail,
        rule_missing=evt.rule_missing,
    )
    plan_event = planner.plan_body(report)
    if not isinstance(plan_event, RecoveryPlannedBody) or plan_event.plan is None:
        return None
    candidates = [
        replace(
            candidate,
            approval_required=True,
            draft=replace(
                candidate.draft,
                params={
                    **candidate.draft.params,
                    "analysis_blocked_fallback": True,
                    "analysis_blocked_reason": evt.reason_code,
                    "missing_evidence": evt.missing_evidence,
                },
            ),
        )
        for candidate in plan_event.plan.candidates
    ]
    if not candidates:
        return None
    plan = replace(
        plan_event.plan,
        summary=f"{plan_event.plan.summary} 추가 근거 수집이 필요해 운영자 선택 후 진행합니다.",
        selection_required=True,
        candidates=candidates,
        recommended_action_id=candidates[0].action_id,
        execution_route=candidates[0].route,
    )
    return replace(plan_event, draft=candidates[0].draft, plan=plan)


@app.on(RcaActionRequiredBody)
async def on_rca_action_required(evt: RcaActionRequiredBody) -> AsyncIterator[EventBody]:
    yield RcaFollowupRequiredBody(
        reason_code=evt.reason_code,
        summary=followup_summary(evt.reason_code, evt.reason),
        evidence_ref=evt.evidence_ref,
        workspace_id=evt.workspace_id,
        severity=evt.severity,
        missing_evidence=evt.missing_evidence,
        next_actions=normalize_next_actions(evt.next_actions, evt.missing_evidence),
        diagnostics={
            **evt.diagnostics,
            "source_event": evt.__subject__,
            "agent_safe": True,
        },
    )


@app.on(PipelineContractFailedBody)
async def on_pipeline_contract_failed(evt: PipelineContractFailedBody) -> AsyncIterator[EventBody]:
    diagnostics = evt.diagnostics or {}
    reason_code = str(diagnostics.get("reason_code") or "context_missing")
    yield RcaFollowupRequiredBody(
        reason_code=reason_code,
        summary=followup_summary(reason_code, evt.reason),
        evidence_ref=evt.evidence_ref or "unknown",
        workspace_id=evt.workspace_id,
        severity=evt.severity,
        next_actions=[
            {
                "action_type": "fix_pipeline_contract",
                "contract": evt.contract,
                "consumer": evt.consumer,
                "description": "upstream 이벤트 payload가 consumer 계약을 만족하도록 수정합니다.",
            }
        ],
        diagnostics={
            **diagnostics,
            "contract": evt.contract,
            "consumer": evt.consumer,
            "source_event": evt.__subject__,
            "agent_safe": True,
        },
    )


@app.on(RcaAiFallbackRequestedBody)
async def on_ai_fallback_requested(evt: RcaAiFallbackRequestedBody) -> AsyncIterator[EventBody]:
    yield RcaFollowupRequiredBody(
        reason_code="ai_fallback_required",
        summary=followup_summary("ai_fallback_required", evt.reason),
        evidence_ref=evt.evidence_ref,
        workspace_id=evt.workspace_id,
        severity=SEVERITY_WARNING,
        incident=evt.incident,
        missing_evidence=evt.missing_evidence,
        next_actions=[
            {
                "action_type": "run_llm_rca_agent",
                "description": "LLM RCA agent가 evidence bundle과 missing evidence를 검토합니다.",
            }
        ],
        diagnostics={
            "source_event": evt.__subject__,
            "evidence_bundle": evt.evidence_bundle.to_body(),
            "agent_safe": True,
        },
    )


if __name__ == "__main__":
    app.run()
