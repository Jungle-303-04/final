---
source_commit: 1616d295
status: synced
---

# backlog-worker — RCA 개선 backlog read model 적재

> 소스: `src/services/ai/backlog-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `rca.backlog.created` 를 받아 RCA backlog 스토어에 upsert 한다(프로젝션 전용).
- 후속 이벤트를 발행하지 않는다(핸들러 반환형 `None` — 파이프라인 종단).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RcaBacklogItemCreatedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `RcaBacklogStore` (`upsert_rca_backlog_item`) |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/backlog-worker/app.py :: app` | `App("backlog-worker")` |
| `on_rca_backlog_item_created(evt, ctx)` | `src/services/ai/backlog-worker/app.py :: on_rca_backlog_item_created` | 유일한 핸들러, `-> None` |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RcaBacklogItemCreatedBody` | `rca.backlog.created` | `backlog_id, title, reason, evidence_ref, incident_id, symptom, missing_evidence, status, payload, workspace_id` — 생산자는 [plan-worker](ai-plan-worker.md) (`backlog_id="missing-cause-rule:{workspace_id}:{symptom}"`, `status="open"`) |

### 발행 (Publishes)

없음.

## 동작 (Behavior)

1. `await ctx.db.upsert_rca_backlog_item(evt.to_body())` — body 전체를 그대로 upsert.

## 불변식·오류 (Invariants & Errors)

- `backlog_id` 가 upsert 키 역할 — 같은 workspace·증상의 rule missing 재발은
  중복 행이 아니라 갱신으로 수렴한다(생산자 측 결정적 ID).
- 저장 실패 시 공통 재시도/DLQ 정책.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=backlog-worker`).
