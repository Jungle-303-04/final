---
source_commit: 1616d295
status: synced
---

# select-worker — 복구 계획 → 후보 자동 선택 또는 선택 요청

> 소스: `src/services/ai/select-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `recovery.planned` 를 받아 [`RecoverySelector`](ai-agent.md#recoveryselectpy--recoveryselector)로
  승인 불필요한 auto 후보면 자동 선택(`recovery.action_selected`), 아니면
  사용자 선택 요청(`recovery.selection_requested`)을 발행한다.
- 선택 요청일 때 recovery plan 을 스토어에 upsert 한다(read model).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RecoveryPlannedBody`, `RecoverySelectionRequestedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `RecoveryPlanStore` (`upsert_recovery_selection_request`) |
| import | `services.ai.agent.recovery.select` | [agent.md](ai-agent.md#recoveryselectpy--recoveryselector) | `RecoverySelector` |
| (간접) | `domains.command.actions` | [../../domains/command.md](../domains/command.md) | `requires_approval` 판정용 명령 카탈로그 |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/select-worker/app.py :: app` | `App("select-worker")` |
| `selector` | `src/services/ai/select-worker/app.py :: selector` | `RecoverySelector()` |
| `on_recovery_planned(evt, ctx)` | `src/services/ai/select-worker/app.py :: on_recovery_planned` | 유일한 핸들러 |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RecoveryPlannedBody` | `recovery.planned` | `draft: HealingActionDraft, plan: RecoveryPlan?, workspace_id` |

### 발행 (Publishes)

| 조건 | 이벤트 | 라우팅 키 |
|---|---|---|
| `plan is None` | `RcaActionRequiredBody(reason="복구 계획이 없습니다.", evidence_ref=draft.source_evidence[0] or "unknown")` | `rca.action_required` |
| 자동 선택 가능 | `RecoveryActionSelectedBody(plan, selected, selected_by="agent-select", auto_selected=True, reason="승인 없이 실행 가능한 후보를 자동 선택했습니다.")` | `recovery.action_selected` |
| 그 외 | `RecoverySelectionRequestedBody(plan, reason)` — reason은 `"사용자 복구 조치 선택이 필요합니다."` 또는 `"선택 후보가 승인 필요한 command action입니다."` | `recovery.selection_requested` |

자동 선택 조건(모두 만족):
`selected.route == "auto"` **and** `not selected.approval_required` **and**
명령 카탈로그 spec 의 `requires_approval` 이 False
(현행 [builtin 복구 룰](ai-agent.md#recoverybuiltinpy--등록된-복구-룰)과
명령 카탈로그에서는 항상 선택 요청으로 흐른다).

## 동작 (Behavior)

1. `body = selector.select_body(evt)` — 후보를 `(rank, -score)` 로 정렬해 1위 검사.
2. `body` 가 `RecoverySelectionRequestedBody` 이고 `ctx.db is not None` 이면
   `await ctx.db.upsert_recovery_selection_request(ctx.correlation_id, body.workspace_id, body.plan.to_body())`.
3. `yield body`.

## 불변식·오류 (Invariants & Errors)

- 자동 선택 시 `selected_by` 는 항상 `"agent-select"`, `auto_selected=True`.
- 선택 요청 저장은 best-effort 분기(`ctx.db is not None` 확인) —
  [approval-worker](ai-approval-worker.md) 도 같은 upsert 를 수행해 이중 안전망을 이룬다.
- 핸들러 예외 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=select-worker`).
