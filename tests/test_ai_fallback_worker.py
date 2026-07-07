"""ai-fallback-worker — LLM 후보 생성/실패 무해성(no fabricated root cause) 검증."""

from __future__ import annotations

from typing import Any

from conftest import load_service, run_handler, subjects_of

from domains.rca.events import (
    Evidence,
    EvidenceBundle,
    EvidenceItem,
    IncidentRecord,
    RcaAiFallbackRequestedBody,
)


class _ScriptedJsonLlm:
    """complete_json 대본 재생 가짜 LLM — 프롬프트를 기록함."""

    def __init__(self, payload: Any) -> None:
        self.payload = payload
        self.prompts: list[str] = []

    async def complete(self, prompt: str, **options: Any) -> str:
        raise AssertionError("ai-fallback worker must use complete_json")

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        self.prompts.append(prompt)
        return self.payload


class _FailingJsonLlm:
    """complete_json 이 항상 실패하는 가짜 LLM(JSON 파싱 실패/미설정 재현)."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    async def complete(self, prompt: str, **options: Any) -> str:
        raise self.error

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        raise self.error


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
                "cause_id": "llm-oom-pressure",
                "title": "메모리 한계 초과",
                "reason": "메모리 사용량이 한계에 근접해 OOM 재시작이 의심됩니다.",
                "expected_evidence": ["kubernetes", "metrics"],
                "checks": ["container_memory_limit"],
                "confidence": 0.8,
            },
            {
                "cause_id": "llm-bad-rollout",
                "title": "잘못된 배포",
                "reason": "최근 rollout 이후 실패가 시작됐을 수 있습니다.",
                "expected_evidence": ["kubernetes"],
                "checks": ["rollout_history"],
                "confidence": 0.4,
            },
        ]
    }


def test_fallback_event_yields_candidates_planned_with_ai_source() -> None:
    worker = load_service("ai/ai-fallback-worker")
    llm = _ScriptedJsonLlm(llm_candidates_payload())
    worker.llm_client = llm
    body = fallback_body()

    outs = run_handler(worker.on_ai_fallback_requested, body)

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
    assert [c.candidate_id for c in planned.candidates] == ["llm-oom-pressure", "llm-bad-rollout"]
    assert {c.source for c in planned.candidates} == {"ai_fallback"}
    # 프롬프트에는 증상과 증거 요약이 실린다(원문 value 는 싣지 않음).
    assert "UnknownFailure" in llm.prompts[0]
    assert "memory usage near limit" in llm.prompts[0]


def test_ai_candidates_flow_through_rule_evaluation_path() -> None:
    """LLM 후보가 rule 후보와 같은 analyze-worker 평가를 통과하는지 확인."""
    fallback_worker = load_service("ai/ai-fallback-worker")
    analyze_worker = load_service("ai/analyze-worker")
    fallback_worker.llm_client = _ScriptedJsonLlm(llm_candidates_payload())

    planned = run_handler(fallback_worker.on_ai_fallback_requested, fallback_body())[0]
    evaluated = run_handler(analyze_worker.on_candidates_planned, planned)[0]

    assert evaluated.__subject__ == "rca.candidates.evaluated"
    by_id = {evaluation.candidate_id: evaluation for evaluation in evaluated.evaluations}
    # kubernetes+metrics 근거가 수집돼 있으므로 첫 후보는 실제 점수를 받는다.
    assert by_id["llm-oom-pressure"].score == 1.0
    assert by_id["llm-oom-pressure"].supporting_evidence == ["kubernetes", "metrics"]


def test_llm_garbage_json_yields_nothing() -> None:
    worker = load_service("ai/ai-fallback-worker")

    # 파싱 실패(LlmGateway 재시도 소진) → ValueError 전파 경로
    worker.llm_client = _FailingJsonLlm(ValueError("LLM did not return valid JSON"))
    assert run_handler(worker.on_ai_fallback_requested, fallback_body()) == []

    # 파싱은 됐지만 계약과 다른 형태(비정형 응답) → 후보 0건, 이벤트 없음
    for garbage in ("plain text", {"candidates": "nope"}, {"candidates": [{"title": "no id"}]}):
        worker.llm_client = _ScriptedJsonLlm(garbage)
        assert run_handler(worker.on_ai_fallback_requested, fallback_body()) == []


def test_unconfigured_llm_is_graceful_noop(monkeypatch) -> None:
    """LLM_PROVIDER 미설정 실제 클라이언트로도 crash 없이 무발행 종료."""
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    worker = load_service("ai/ai-fallback-worker")

    outs = run_handler(worker.on_ai_fallback_requested, fallback_body())

    assert outs == []
