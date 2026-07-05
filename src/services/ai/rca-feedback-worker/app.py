"""rca-feedback-worker — RCA blocked/action/fallback을 후속 조치 이벤트로 정규화."""

from __future__ import annotations

from collections.abc import AsyncIterator

from domains.rca.events import (
    RcaActionRequiredBody,
    RcaAiFallbackRequestedBody,
    RcaAnalysisBlockedBody,
    RcaFollowupRequiredBody,
)
from packages.contracts.event_bus.bodies import EventBody, JsonObject
from packages.contracts.event_bus.bodies.platform import PipelineContractFailedBody
from packages.runtime.app import App

app = App("rca-feedback-worker")

SEVERITY_WARNING = "warning"


def collect_actions_for_missing(missing_evidence: list[str]) -> list[JsonObject]:
    return [
        {
            "action_type": "collect_evidence",
            "source": source,
            "query_id": f"collect_{source}",
            "description": f"{source} 근거를 수집한 뒤 RCA 평가를 재실행합니다.",
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
        summary=evt.reason,
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


@app.on(RcaActionRequiredBody)
async def on_rca_action_required(evt: RcaActionRequiredBody) -> AsyncIterator[EventBody]:
    yield RcaFollowupRequiredBody(
        reason_code=evt.reason_code,
        summary=evt.reason,
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
    yield RcaFollowupRequiredBody(
        reason_code=str(diagnostics.get("reason_code") or "context_missing"),
        summary=evt.reason,
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
        summary=f"AI fallback required: {evt.reason}",
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
