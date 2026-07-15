from __future__ import annotations

import asyncio
from typing import Any

from conftest import SpyDb, load_service, run_handler

from domains.rca.events import (
    CauseCandidate,
    CauseEvaluation,
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    EvidenceReference,
    IncidentRecord,
    RcaCandidatesEvaluatedBody,
    RcaCompletedBody,
    RcaReportDetail,
)
from domains.rca.report_narrative import RCA_NARRATIVE_UNAVAILABLE
from services.ai.agent.pipeline.rca_narrative import build_rca_narrative_prompt

NARRATIVE = {
    "locale": "ko",
    "executive_summary": "checkout-api의 메모리 한도 초과로 컨테이너가 재시작되었습니다.",
    "impact": "해당 워크로드의 요청 처리가 재시작 동안 불안정했을 가능성이 있습니다.",
    "reasoning": "OOMKilled 이벤트와 한도 근접 메모리 지표가 같은 원인을 지지합니다.",
    "recommended_action": "승인 후 메모리 사용량을 검토하고 한도 조정을 단계적으로 적용합니다.",
    "recurrence_prevention": ["메모리 사용률과 OOMKilled 알림을 함께 운영합니다."],
    "limitations": ["요청 실패율 근거는 수집되지 않았습니다."],
}


class _ScriptedLlm:
    def __init__(self, response: Any = NARRATIVE, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.prompts: list[str] = []

    async def complete_json(self, prompt: str, _schema: dict[str, Any], **_options: Any) -> Any:
        self.prompts.append(prompt)
        if self.error is not None:
            raise self.error
        return self.response

    async def complete(self, prompt: str, **_options: Any) -> str:
        raise AssertionError(f"unexpected complete call: {prompt}")

    def metadata(self, *, provider: str | None = None) -> dict[str, str]:
        return {"provider": provider or "test", "model": "test-model"}


class _CompletedPipeline:
    def __init__(self, completed: RcaCompletedBody) -> None:
        self.completed = completed

    def complete_body(self, _event: RcaCandidatesEvaluatedBody) -> RcaCompletedBody:
        return self.completed


class _NeverReturningLlm(_ScriptedLlm):
    async def complete_json(self, prompt: str, _schema: dict[str, Any], **_options: Any) -> Any:
        self.prompts.append(prompt)
        await asyncio.Event().wait()


def _completed_report() -> RcaCompletedBody:
    incident = IncidentRecord(
        incident_id="incident-1",
        cluster_id="cluster-1",
        resource_kind="Deployment",
        resource_name="checkout-api",
        namespace="payments",
        symptom="CrashLoopBackOff",
        severity="high",
        first_seen_at="2026-07-15T01:00:00Z",
        summary="컨테이너 재시작 감지 password=incident-secret",
        workspace_id="workspace-1",
        secondary_symptoms=["oom_killed"],
    )
    evidence_reference = EvidenceReference(
        evidence_ref="evidence://incident-1/memory",
        source="kubernetes",
        name="termination_state",
        check_id="oom_evidence",
        summary="OOMKilled 확인 Authorization: Bearer summary-secret",
    )
    candidate = CauseCandidate(
        candidate_id="oom_killed",
        title="컨테이너 OOMKilled",
        description="컨테이너 메모리 사용량이 제한을 초과함",
        expected_evidence=["kubernetes", "metrics"],
        checks=["oom_evidence"],
    )
    evaluation = CauseEvaluation(
        candidate_id="oom_killed",
        score=1.0,
        checks=["oom_evidence"],
        supporting_evidence=["kubernetes:termination_state", "metrics:memory"],
        missing_evidence=["requests:error_rate"],
        reason="필수 신호가 모두 확인되었습니다.",
        supporting_evidence_refs=[evidence_reference],
    )
    return RcaCompletedBody(
        root_cause="oom_killed",
        action="plan_recovery",
        evidence_ref="evidence://incident-1",
        workspace_id="workspace-1",
        incident=incident,
        evidence=Evidence(
            cluster_id="cluster-1",
            kubernetes={"raw": "raw-kubernetes-secret"},
            metrics={"raw": "raw-metrics-secret"},
            logs=[{"line": "raw-log-secret"}],
            traces={"raw": "raw-trace-secret"},
            object_ref="object://raw-evidence",
            workspace_id="workspace-1",
        ),
        evidence_bundle=EvidenceBundle(
            incident_id="incident-1",
            items=[
                EvidenceItem(
                    source="metrics",
                    name="memory",
                    value={"raw": "raw-bundle-secret"},
                    summary="메모리 사용량이 컨테이너 한도에 근접했습니다.",
                )
            ],
            missing_evidence=["requests:error_rate"],
            complete=True,
        ),
        candidates=[candidate],
        evaluations=[evaluation],
        rca_detail=RcaReportDetail(
            root_cause="oom_killed",
            confidence=1.0,
            selected_candidate_id="oom_killed",
            supporting_evidence=evaluation.supporting_evidence,
            missing_evidence=evaluation.missing_evidence,
            reason=evaluation.reason,
            supporting_evidence_refs=[evidence_reference],
        ),
    )


def _evaluated_input(report: RcaCompletedBody) -> RcaCandidatesEvaluatedBody:
    return RcaCandidatesEvaluatedBody(
        candidate_count=1,
        evidence_ref=report.evidence_ref,
        candidates=list(report.candidates or []),
        evaluations=list(report.evaluations or []),
        workspace_id=report.workspace_id,
        incident=report.incident,
    )


def test_rca_narrative_prompt_contains_only_redacted_summaries() -> None:
    prompt = build_rca_narrative_prompt(_completed_report())

    assert "메모리 사용량이 컨테이너 한도에 근접했습니다." in prompt
    assert "raw-kubernetes-secret" not in prompt
    assert "raw-metrics-secret" not in prompt
    assert "raw-log-secret" not in prompt
    assert "raw-trace-secret" not in prompt
    assert "raw-bundle-secret" not in prompt
    assert "incident-secret" not in prompt
    assert "summary-secret" not in prompt
    assert "[REDACTED]" in prompt


def test_rca_worker_persists_llm_authored_narrative_in_existing_payload() -> None:
    worker = load_service("ai/rca-worker")
    report = _completed_report()
    llm = _ScriptedLlm()
    worker.pipeline = _CompletedPipeline(report)
    worker.llm_client = llm
    db = SpyDb()

    events = run_handler(
        worker.on_candidates_evaluated,
        _evaluated_input(report),
        db=db,
        correlation_id="corr-1",
    )

    assert events == [report]
    save = next(call for call in db.calls if call[0] == "save_rca_report")
    saved_payload = save[1][4]
    assert saved_payload["narrative"] == NARRATIVE
    assert saved_payload["narrative_status"] == "generated"
    assert len(llm.prompts) == 1


def test_rca_worker_llm_failure_does_not_block_deterministic_report() -> None:
    worker = load_service("ai/rca-worker")
    report = _completed_report()
    worker.pipeline = _CompletedPipeline(report)
    worker.llm_client = _ScriptedLlm(error=TimeoutError("provider unavailable with secret"))
    db = SpyDb()

    events = run_handler(
        worker.on_candidates_evaluated,
        _evaluated_input(report),
        db=db,
        correlation_id="corr-1",
    )

    assert events == [report]
    save = next(call for call in db.calls if call[0] == "save_rca_report")
    saved_payload = save[1][4]
    assert "narrative" not in saved_payload
    assert saved_payload["narrative_status"] == RCA_NARRATIVE_UNAVAILABLE
    assert "provider unavailable with secret" not in str(saved_payload)


def test_rca_worker_bounds_llm_latency_before_persisting_fallback() -> None:
    worker = load_service("ai/rca-worker")
    report = _completed_report()
    worker.pipeline = _CompletedPipeline(report)
    worker.llm_client = _NeverReturningLlm()
    worker.RCA_NARRATIVE_TIMEOUT_SECONDS = 0.001
    db = SpyDb()

    events = run_handler(
        worker.on_candidates_evaluated,
        _evaluated_input(report),
        db=db,
        correlation_id="corr-1",
    )

    assert events == [report]
    save = next(call for call in db.calls if call[0] == "save_rca_report")
    assert save[1][4]["narrative_status"] == RCA_NARRATIVE_UNAVAILABLE


def test_rca_worker_enriches_each_public_correlation_report() -> None:
    worker = load_service("ai/rca-worker")
    report = _completed_report()
    llm = _ScriptedLlm()
    worker.pipeline = _CompletedPipeline(report)
    worker.llm_client = llm
    db = SpyDb(find_recent_rca_report={"id": 1})

    events = run_handler(worker.on_candidates_evaluated, _evaluated_input(report), db=db)

    assert events == [report]
    assert len(llm.prompts) == 1
    save = next(call for call in db.calls if call[0] == "save_rca_report")
    assert save[1][0] == "corr-1"
