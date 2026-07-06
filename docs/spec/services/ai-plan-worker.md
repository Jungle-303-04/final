---
source_commit: 1616d295
status: synced
---

# plan-worker — 근거 번들 → RCA 원인 후보 계획

> 소스: `src/services/ai/plan-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `evidence.bundle.built` 를 받아 [`CausePlanningPipeline`](ai-agent.md#pipelinecausespy--causeplanner--causeevaluator--rootcauseanalyzer)으로
  증상 매칭 플레이북에서 원인 후보 목록을 계획하고 `rca.candidates.planned` 를 발행한다.
- 매칭 룰이 없으면 rule-missing 부속 이벤트 3종을 추가 발행한다.
- ctx 미사용(핸들러 시그니처 `(evt)` 단일 인자), DB 저장 없음.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `EvidenceBundleBuiltBody` (+ 발행 body들) |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `CausePlanningPipeline` (내부: `CausePlanner`, `plan_causes`, causes 플레이북) |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/plan-worker/app.py :: app` | `App("plan-worker")` |
| `pipeline` | `src/services/ai/plan-worker/app.py :: pipeline` | `CausePlanningPipeline()` (`ai_fallback_enabled=True` 기본) |
| `on_evidence_bundle_built(evt)` | `src/services/ai/plan-worker/app.py :: on_evidence_bundle_built` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `EvidenceBundleBuiltBody` | `evidence.bundle.built` | `evidence: Evidence, incident: IncidentRecord, evidence_bundle: EvidenceBundle` |

### 발행 (Publishes)

`pipeline.plan_bodies(evt)` 의 결과를 순서대로 yield.

| 케이스 | 발행 순서 |
|---|---|
| 후보 매칭 성공 | `rca.candidates.planned` (`RcaCandidatesPlannedBody`) 1건 |
| 매칭 룰 없음 | ① `rca.rule_missing` (`RcaRuleMissingBody`) ② `rca.backlog.created` (`RcaBacklogItemCreatedBody`, `backlog_id="missing-cause-rule:{workspace_id}:{symptom}"`, `status="open"`) ③ `rca.ai_fallback.requested` (`RcaAiFallbackRequestedBody`, `ai_fallback_enabled=True` 일 때) ④ `rca.candidates.planned` (`candidates=[]`, `rule_missing` 세트) |

`RcaCandidatesPlannedBody` 필드: `candidate_count, evidence_ref(=evidence.object_ref),
candidates, workspace_id, evidence, incident, evidence_bundle, rule_missing`.

## 동작 (Behavior)

1. `plan_causes(evt.incident, evt.evidence_bundle, evt.evidence.object_ref)` —
   등록된 [원인 프로파일](ai-agent.md#causes--등록된-프로파일-지식-베이스) 중
   `incident.symptom` 이 매칭되는 룰의 후보를 모아 `candidate_id` 기준 병합.
2. 후보가 비면 `RcaRuleMissing` 생성(`missing_evidence=["matching_cause_rule"]`,
   `message="정의된 RCA rule 없음"`).
3. `plan_bodies` 가 위 발행 표 순서로 body 튜플을 만들고 핸들러가 그대로 yield.

## 불변식·오류 (Invariants & Errors)

- rule missing 시에도 `rca.candidates.planned` 는 **항상 마지막에** 발행된다
  (다운스트림 analyze-worker 가 unknown 평가를 생성하도록).
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=plan-worker`).
