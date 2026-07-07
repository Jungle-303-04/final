---
source_commit: 1616d295
status: synced
---

# rca-worker — 평가 결과 → 근본 원인 확정

> 소스: `src/services/ai/rca-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `rca.candidates.evaluated` 를 받아 [`RcaCompletionPipeline`](ai-agent.md#pipelinecausespy--causeplanner--causeevaluator--rootcauseanalyzer)으로
  최종 근본 원인을 확정(`rca.completed`)하거나 차단 사유를 발행(`rca.analysis_blocked`)한다.
- `rca.completed` 일 때만 RCA 리포트를 스토어에 저장한다. 저장 전에 dedup 조회로
  같은 (workspace, root_cause, 대상 리소스) 리포트가 최근 창 안에 있으면 저장을 생략한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RcaCandidatesEvaluatedBody`, `RcaCompletedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `RcaStore` (`save_rca_report`, `find_recent_rca_report`) |
| import | `domains.rca.repository` | [../../domains/rca.md](../domains/rca.md) | `rca_report_resource_key` (dedup 리소스 키) |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `RcaCompletionPipeline` (내부: `RootCauseAnalyzer`, `analyze_root_cause`, `block_reason_code`) |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/rca-worker/app.py :: app` | `App("rca-worker")` |
| `pipeline` | `src/services/ai/rca-worker/app.py :: pipeline` | `RcaCompletionPipeline()` |
| `RCA_REPORT_DEDUP_WINDOW_SECONDS` | `src/services/ai/rca-worker/app.py :: RCA_REPORT_DEDUP_WINDOW_SECONDS` | `300` — 리포트 dedup 창(초) |
| `on_candidates_evaluated(evt, ctx)` | `src/services/ai/rca-worker/app.py :: on_candidates_evaluated` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RcaCandidatesEvaluatedBody` | `rca.candidates.evaluated` | `candidate_count, evidence_ref, candidates, evaluations, workspace_id, evidence?, incident?, evidence_bundle?, rule_missing?` |

### 발행 (Publishes)

| 조건 | 이벤트 | 라우팅 키 |
|---|---|---|
| evidence/incident/evidence_bundle 중 None | `RcaActionRequiredBody(reason="RCA analysis context is missing")` | `rca.action_required` |
| `block_reason_code` ≠ None | `RcaAnalysisBlockedBody(reason_code, reason=rca_detail.reason, missing_evidence=rca_detail.missing_evidence, diagnostics={"root_cause": ...}, 컨텍스트 전체 동봉)` | `rca.analysis_blocked` |
| 정상 확정 | `RcaCompletedBody(root_cause=rca_detail.root_cause, action="plan_recovery", 컨텍스트 전체 동봉)` | `rca.completed` |

`reason_code` 결정 규칙([`block_reason_code`](ai-agent.md#pipelinecausespy--causeplanner--causeevaluator--rootcauseanalyzer)):
`rule_missing`(룰 부재/unknown) → `insufficient_evidence`(근거 부족) →
`no_evaluation`(선택 후보 없음) → `insufficient_evidence`(누락 근거 존재) 순서로 검사.

## 동작 (Behavior)

1. `result = pipeline.complete_body(evt)` —
   [`analyze_root_cause`](ai-agent.md#causesenginepy--룰-엔진) 로 `RcaReportDetail` 산출:
   점수 최대·누락 최소 후보 선택, unknown/insufficient_evidence 특수 경로 처리.
2. `isinstance(result, RcaCompletedBody)` 인 경우에만 저장 경로 진입:
   1. `duplicate = await ctx.db.find_recent_rca_report(workspace_id, root_cause, rca_report_resource_key(incident), RCA_REPORT_DEDUP_WINDOW_SECONDS)` —
      장애 지속 시 evidence 주기(~10s)마다 같은 리포트가 무한 적재되는 것을 막는 dedup 조회.
   2. `duplicate is None` 일 때만
      `await ctx.db.save_rca_report(ctx.correlation_id, result.workspace_id, result.root_cause, result.action, result.to_body())`.
3. `yield result` (항상 정확히 1건 — dedup 으로 저장이 생략돼도 `rca.completed` 이벤트는 발행).

## 불변식·오류 (Invariants & Errors)

- `rca.completed` 의 `action` 은 항상 `"plan_recovery"` (`RcaDefaults.recommended_action`).
- 리포트 저장은 completed 경로에서만 발생 — blocked/action_required 는 저장하지 않는다.
- 같은 (workspace_id, root_cause, `namespace/kind/name` 리소스 키) 리포트는
  `RCA_REPORT_DEDUP_WINDOW_SECONDS`(300초) 창 안에서 1건만 저장된다. 장애가 지속되면
  창이 지날 때마다 1건씩 다시 저장되어 지속 여부는 추적된다.
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=rca-worker`).
