"""ai-fallback-worker — LLM 후보 생성/실패 무해성(no fabricated root cause) 검증."""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from conftest import load_service, run_handler, subjects_of

from domains.rca.events import (
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
    RcaAiFallbackRequestedBody,
    RcaAnalysisBlockedBody,
)


class _ScriptedJsonLlm:
    """complete_json 대본 재생 테스트용 LLM — 프롬프트를 기록함."""

    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        raise AssertionError("ai-fallback worker must use complete_json")

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        self.prompts.append(prompt)
        return self.payload


class _FailingJsonLlm:
    """complete_json 이 항상 실패하는 테스트용 LLM(JSON 파싱 실패/미설정 재현)."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    async def complete(self, prompt: str, **options: Any) -> str:
        raise self.error

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        raise self.error


class MetricDb:
    def __init__(self) -> None:
        self.llm_samples: list[Any] = []

    async def record_llm_invocation_metric(self, sample: Any) -> None:
        self.llm_samples.append(sample)


def fallback_body() -> RcaAiFallbackRequestedBody:
    incident = IncidentRecord(
        incident_id="incident-1",
        cluster_id="target-cluster-01",
        resource_kind="deployment",
        resource_name="checkout-api",
        namespace="sandbox",
        symptom="UnknownFailure",
        severity="high",
        first_seen_at=None,
        summary="deployment checkout-api has UnknownFailure",
        workspace_id="workspace-1",
    )
    evidence = Evidence(
        cluster_id="target-cluster-01",
        kubernetes={"pods": [{"name": "checkout-api", "status": "UnknownFailure"}]},
        metrics={"memory": "near-limit"},
        logs=[{"line": "OOMKilled"}],
        traces={},
        object_ref="evidence://workspace-1/incident-1",
        workspace_id="workspace-1",
    )
    bundle = EvidenceBundle(
        incident_id="incident-1",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="pod_status",
                value={"status": "UnknownFailure"},
                summary="pod checkout-api is failing with UnknownFailure",
            ),
            EvidenceItem(
                source="metrics",
                name="memory_usage",
                value={"memory": "near-limit"},
                summary="memory usage near limit",
            ),
        ],
        missing_evidence=["logs"],
        complete=False,
    )
    return RcaAiFallbackRequestedBody(
        reason="정의된 RCA rule 없음",
        evidence_ref=evidence.object_ref,
        incident=incident,
        evidence_bundle=bundle,
        missing_evidence=["logs"],
        workspace_id="workspace-1",
        evidence=evidence,
    )


def llm_candidates_payload() -> dict[str, Any]:
    return {
        "candidates": [
            {
                "cause_id": "oom_killed",
                "title": "LLM이 지어낸 제목은 신뢰하지 않음",
                "reason": "LLM은 catalog cause ID만 hypothesis로 제안합니다.",
                "expected_evidence": ["kubernetes", "metrics", "logs"],
                "checks": ["llm_authored_check_must_be_ignored"],
                "confidence": 0.8,
            },
            {
                "cause_id": "wrong_image_tag",
                "title": "LLM image title",
                "reason": "Catalog validation is still required.",
                "expected_evidence": ["kubernetes"],
                "checks": ["llm_check"],
                "confidence": 0.4,
            },
        ]
    }


def source_names_only_oom_body() -> RcaAiFallbackRequestedBody:
    """OOM catalog source/name은 모두 있지만 OOM 내용 신호는 없는 조작 번들."""
    bundle = EvidenceBundle(
        incident_id="incident-1",
        items=[
            EvidenceItem(
                source="kubernetes",
                name="cluster_resource_state",
                value={"pods": [{"terminated_reasons": [], "containers": []}]},
                summary="pod state collected without an OOM termination",
            ),
            EvidenceItem(
                source="metrics",
                name="telemetry_metrics",
                value={"memory": "normal"},
                summary="memory telemetry exists",
            ),
            EvidenceItem(
                source="logs",
                name="related_logs",
                value={"entries": [{"line": "application is healthy"}]},
                summary="logs exist without an OOM message",
            ),
        ],
        missing_evidence=[],
        complete=True,
    )
    return replace(fallback_body(), evidence_bundle=bundle, missing_evidence=[])


def test_fallback_event_yields_candidates_planned_with_ai_source() -> None:
    worker = load_service("ai/ai-fallback-worker")
    llm = _ScriptedJsonLlm(llm_candidates_payload())
    worker.llm_client = llm
    body = fallback_body()
    db = MetricDb()

    outs = run_handler(worker.on_ai_fallback_requested, body, db=db)

    assert subjects_of(outs) == ["rca.candidates.planned"]
    planned = outs[0]
    assert planned.candidate_count == 2
    assert planned.evidence_ref == body.evidence_ref
    assert planned.workspace_id == "workspace-1"
    assert planned.incident == body.incident
    assert planned.evidence == body.evidence
    assert planned.evidence_bundle == body.evidence_bundle
    # rule_missing 이 비어 있어야 analyze-worker 가 근거 매칭 평가를 수행한다.
    assert planned.rule_missing is None
    assert [c.candidate_id for c in planned.candidates] == ["oom_killed", "wrong_image_tag"]
    assert {c.source for c in planned.candidates} == {"ai_fallback"}
    # LLM 텍스트가 아니라 실제 catalog 계약(title/evidence/checks/signals)을 사용한다.
    oom = planned.candidates[0]
    assert oom.title == "컨테이너 OOMKilled"
    assert oom.expected_evidence == [
        "kubernetes:cluster_resource_state",
        "metrics:telemetry_metrics",
        "logs:related_logs",
    ]
    assert oom.checks != ["llm_authored_check_must_be_ignored"]
    assert oom.signals
    # 프롬프트에는 증상과 증거 요약이 실린다(원문 value 는 싣지 않음).
    assert "UnknownFailure" in llm.prompts[0]
    assert "memory usage near limit" in llm.prompts[0]
    assert [sample.operation for sample in db.llm_samples] == ["complete_json"]
    assert db.llm_samples[0].status == "succeeded"
    assert db.llm_samples[0].event_id == "evt-1"
    assert db.llm_samples[0].correlation_id == "corr-1"


def test_ai_candidate_source_names_without_catalog_signal_cannot_complete() -> None:
    """source 이름만 나열한 LLM hypothesis는 내용 signal 없이는 확정되지 않는다."""
    fallback_worker = load_service("ai/ai-fallback-worker")
    analyze_worker = load_service("ai/analyze-worker")
    rca_worker = load_service("ai/rca-worker")
    fallback_worker.llm_client = _ScriptedJsonLlm(llm_candidates_payload())

    planned = run_handler(
        fallback_worker.on_ai_fallback_requested,
        source_names_only_oom_body(),
    )[0]
    evaluated = run_handler(analyze_worker.on_candidates_planned, planned)[0]

    assert evaluated.__subject__ == "rca.candidates.evaluated"
    by_id = {evaluation.candidate_id: evaluation for evaluation in evaluated.evaluations}
    oom = by_id["oom_killed"]
    assert oom.score < 1.0
    assert oom.supporting_evidence == [
        "kubernetes:cluster_resource_state",
        "logs:related_logs",
        "metrics:telemetry_metrics",
    ]
    assert oom.missing_evidence == ["signal:oom_evidence"]

    result = rca_worker.pipeline.complete_body(evaluated)

    assert isinstance(result, RcaAnalysisBlockedBody)
    assert result.reason_code == "insufficient_evidence"
    assert result.__subject__ == "rca.analysis_blocked"


def test_llm_garbage_json_yields_nothing() -> None:
    worker = load_service("ai/ai-fallback-worker")

    # 파싱 실패(LlmGateway 재시도 소진) → ValueError 전파 경로
    worker.llm_client = _FailingJsonLlm(ValueError("LLM did not return valid JSON"))
    assert run_handler(worker.on_ai_fallback_requested, fallback_body()) == []

    # 파싱은 됐지만 계약과 다른 형태(비정형 응답) → 후보 0건, 이벤트 없음
    for garbage in ("plain text", {"candidates": "nope"}, {"candidates": [{"title": "no id"}]}):
        worker.llm_client = _ScriptedJsonLlm(garbage)
        assert run_handler(worker.on_ai_fallback_requested, fallback_body()) == []

    # catalog 밖 cause_id는 그럴듯한 텍스트가 있어도 hypothesis로 채택하지 않는다.
    worker.llm_client = _ScriptedJsonLlm(
        {
            "candidates": [
                {
                    "cause_id": "invented_by_llm",
                    "title": "Plausible but unregistered",
                    "reason": "Collected sources happen to exist",
                    "expected_evidence": ["kubernetes", "metrics"],
                    "confidence": 1.0,
                }
            ]
        }
    )
    assert run_handler(worker.on_ai_fallback_requested, fallback_body()) == []


def test_unconfigured_llm_is_graceful_noop(monkeypatch) -> None:
    """LLM_PROVIDER 미설정 실제 클라이언트로도 crash 없이 무발행 종료."""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    worker = load_service("ai/ai-fallback-worker")

    outs = run_handler(worker.on_ai_fallback_requested, fallback_body())

    assert outs == []
