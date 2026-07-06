---
source_commit: 1616d295
status: synced
---

# approval-worker — 선택 요청/롤아웃 진단 → 승인 권고

> 소스: `src/services/ai/approval-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `recovery.selection_requested` 와 `rollout.diagnosed` 를 각각 승인 보조 판단
  이벤트(`approval.recommended`)로 변환한다.
- 선택 요청 수신 시 recovery plan read model 을 upsert 한다.
- 자체 판단 로직 없음 — 입력 이벤트의 사유/다음 행동을 권고로 투영하는 어댑터.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `ApprovalRecommendedBody`, `RecoverySelectionRequestedBody`, `RolloutDiagnosedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `RecoveryPlanStore` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/approval-worker/app.py :: app` | `App("approval-worker")` |
| `on_recovery_selection_requested(evt, ctx)` | `src/services/ai/approval-worker/app.py :: on_recovery_selection_requested` | 선택 요청 핸들러 |
| `on_rollout_diagnosed(evt)` | `src/services/ai/approval-worker/app.py :: on_rollout_diagnosed` | 롤아웃 진단 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RecoverySelectionRequestedBody` | `recovery.selection_requested` | `plan: RecoveryPlan, reason, workspace_id` |
| `RolloutDiagnosedBody` | `rollout.diagnosed` | `diagnosis, next_action, details, workspace_id` |

### 발행 (Publishes)

| 입력 | 이벤트 | 라우팅 키 | 필드 매핑 |
|---|---|---|---|
| 선택 요청 | `ApprovalRecommendedBody` | `approval.recommended` | `recommendation="user_selection_required"`, `reason=evt.reason`, `details={"plan": evt.plan.to_body()}` |
| 롤아웃 진단 | `ApprovalRecommendedBody` | `approval.recommended` | `recommendation=evt.next_action`(`observe`/`retry`/`manual_review`), `reason=evt.diagnosis`, `details=evt.details` |

## 동작 (Behavior)

1. `recovery.selection_requested` 수신:
   - `ctx.db is not None` 이면
     `await ctx.db.upsert_recovery_selection_request(ctx.correlation_id, evt.workspace_id, evt.plan.to_body())`.
   - `ApprovalRecommendedBody(recommendation="user_selection_required", ...)` yield.
2. `rollout.diagnosed` 수신: 변환만 수행(저장 없음), 권고 yield.

## 불변식·오류 (Invariants & Errors)

- 한 워커가 두 subject 를 구독하므로 NATS durable consumer 이름은 subject 별로
  네임스페이스된다(`EventHandlerSpec.durable_for`).
- 선택 요청의 `recommendation` 값은 고정 문자열 `"user_selection_required"`.
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=approval-worker`).
