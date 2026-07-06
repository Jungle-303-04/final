---
source_commit: 1616d295
status: synced
---

# analyze-worker — 원인 후보 평가

> 소스: `src/services/ai/analyze-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `rca.candidates.planned` 를 받아 [`CauseEvaluationPipeline`](ai-agent.md#pipelinecausespy--causeplanner--causeevaluator--rootcauseanalyzer)으로
  후보별 근거 충족도를 점수화해 `rca.candidates.evaluated` 를 발행한다.
- 계약 위반(evidence_bundle 누락) 시 `pipeline.contract_failed` 를 발행한다.
- ctx 미사용, DB 저장 없음.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RcaCandidatesPlannedBody` (+ 발행 body) |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `CauseEvaluationPipeline` (내부: `CauseEvaluator`, `evaluate_causes`) |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/analyze-worker/app.py :: app` | `App("analyze-worker")` |
| `pipeline` | `src/services/ai/analyze-worker/app.py :: pipeline` | `CauseEvaluationPipeline()` |
| `on_candidates_planned(evt)` | `src/services/ai/analyze-worker/app.py :: on_candidates_planned` | 유일한 핸들러, body 1건 yield |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RcaCandidatesPlannedBody` | `rca.candidates.planned` | `candidate_count, evidence_ref, candidates, workspace_id, evidence?, incident?, evidence_bundle?, rule_missing?` |

### 발행 (Publishes)

| 조건 | 이벤트 | 라우팅 키 |
|---|---|---|
| `evidence_bundle is None` | `PipelineContractFailedBody(contract="RcaCandidatesPlannedBody.evidence_bundle", reason="RCA analysis context is missing", consumer="analyze-worker", severity="warning", diagnostics={"reason_code": "context_missing"}, payload=evt.to_body())` | `pipeline.contract_failed` |
| 정상 | `RcaCandidatesEvaluatedBody(candidate_count, evidence_ref, candidates, evaluations, workspace_id, evidence, incident, evidence_bundle, rule_missing)` | `rca.candidates.evaluated` |

## 동작 (Behavior)

[`evaluate_causes`](ai-agent.md#causesenginepy--룰-엔진) 규칙:

1. `rule_missing` 이 세트되어 있으면 평가는 단일
   `CauseEvaluation(candidate_id="unknown", score=0.0, checks=["matching_cause_rule"], missing_evidence=rule_missing.missing_evidence, reason="정의된 RCA rule 없음")`.
2. 아니면 후보마다 `score = |expected ∩ 수집된 source| / |expected|`,
   `supporting/missing` 은 정렬된 교집합/차집합,
   `reason = "필요한 근거 N개 중 M개가 수집되었습니다."`,
   `supporting_evidence_refs` 는 번들 아이템의 `EvidenceReference`,
   `missing_evidence_checks` 는 source별 `evidence:{source}:required` 체크.

## 불변식·오류 (Invariants & Errors)

- 입력 컨텍스트 누락은 예외가 아니라 `pipeline.contract_failed` 이벤트로 표현
  ([rca-feedback-worker](ai-rca-feedback-worker.md) 가 후속 조치로 정규화).
- 평가 결과는 입력 후보 순서를 유지한다.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=analyze-worker`).
