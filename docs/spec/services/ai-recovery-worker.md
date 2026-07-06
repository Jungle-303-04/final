---
source_commit: 1616d295
status: synced
---

# recovery-worker — RCA 완료 → 복구 계획 수립

> 소스: `src/services/ai/recovery-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `rca.completed` 를 받아 [`RecoveryPlanningPipeline`](ai-agent.md#recoveryenginepy--recoveryplanner)으로
  root cause 매칭 복구 룰에서 후보 목록·추천안을 담은 `recovery.planned` 를 발행한다.
- ctx 미사용, DB 저장 없음.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RcaCompletedBody` (+ 발행 body) |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |
| import | `services.ai.agent.pipeline` | [agent.md](ai-agent.md) | `RecoveryPlanningPipeline` (내부: `RecoveryPlanner`, recovery 플레이북) |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/recovery-worker/app.py :: app` | `App("recovery-worker")` |
| `pipeline` | `src/services/ai/recovery-worker/app.py :: pipeline` | `RecoveryPlanningPipeline()` |
| `on_rca_completed(evt)` | `src/services/ai/recovery-worker/app.py :: on_rca_completed` | 유일한 핸들러, body 1건 yield |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RcaCompletedBody` | `rca.completed` | `root_cause, action, evidence_ref, workspace_id, evidence?, incident?, evidence_bundle?, candidates?, evaluations?, rca_detail?, rule_missing?` |

### 발행 (Publishes)

| 조건 | 이벤트 | 라우팅 키 |
|---|---|---|
| `incident` 또는 `rca_detail` None | `RcaActionRequiredBody(reason="RCA analysis context is missing")` | `rca.action_required` |
| 매칭 복구 후보 0건 | `RcaActionRequiredBody(reason="복구 후보를 생성할 수 없습니다.")` | `rca.action_required` |
| 정상 | `RecoveryPlannedBody(draft=최상위 후보의 HealingActionDraft, plan=RecoveryPlan(...), workspace_id)` | `recovery.planned` |

`RecoveryPlan` 구성: `plan_id=f"recovery:{evidence_ref}"`, `incident_id`,
`summary=rca_detail.reason`, `target`(incident 리소스 요약),
`recommended_action_id=후보1.action_id`, `execution_route=후보1.route`,
`selection_required=후보1.approval_required`, `candidates=(rank asc, score desc) 정렬 전체`.

## 동작 (Behavior)

1. `build_recovery_context(report)` 로 컨텍스트 생성(불가 시 action_required).
2. [`registered_recovery_rules()`](ai-agent.md#recoverybuiltinpy--등록된-복구-룰) 중
   `supports(context)` (root_cause 매칭 또는 폴백 룰) 인 룰의 후보를 모아
   `(rank, -score)` 정렬. 폴백 룰(`manual_analysis`, route=`approval_required`)이 항상 매칭되므로
   현행 카탈로그에서는 후보 0건 경로가 사실상 발생하지 않는다.
3. 후보의 `HealingActionDraft` 는 `dry_run=True`,
   `params={"root_cause", "confidence", "symptom", **spec.params}` 로 구성됨.
4. `yield pipeline.plan_body(evt)`.

## 불변식·오류 (Invariants & Errors)

- `RecoveryPlannedBody.draft` 는 후보가 있으면 후보 1위의 draft, 없으면
  `first_draft_or_default` 의 기본 draft(`rollout_restart`/low/dry_run=True).
- 후보 정렬 기준은 select-worker 와 동일해야 한다(`(rank, -score)`).
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=recovery-worker`).
