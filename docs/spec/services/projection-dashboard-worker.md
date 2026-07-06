---
source_commit: 20945a70
status: synced
---

# dashboard-worker — 이벤트 흐름을 프론트 조회용 RCA timeline 으로 투영

> 소스: `src/services/projection/dashboard-worker/app.py` · 테스트: `tests/test_dashboard_projection.py`, `tests/test_service_entrypoints.py`

## 책임 (Responsibility)

- `@app.on_any` 전체(`>`) 구독으로 모든 이벤트를 받아, RCA/command/safe_pr 흐름에 해당하는 subject 만 `rca_timeline` read model 로 upsert 한다.
- 이벤트를 새로 발행하지 않는다(말단 프로젝터). 조회는 api-gateway 의 dashboard 라우터가 담당.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.dashboard` | [../../domains/dashboard.md](../domains/dashboard.md) | `timeline_update_from_event` 매핑, `rca_timeline` 테이블·upsert |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventEnvelope`, `DashboardStore` 프로토콜, `EventSubject` |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext`, WorkerRuntime |
| 외부 | NATS JetStream | — | durable consumer `dashboard-worker` 로 `>` 구독 |
| 외부 | PostgreSQL | — | `rca_timeline` upsert |

## 공개 인터페이스 (Public API)

- `src/services/projection/dashboard-worker/app.py :: app` — `App("dashboard-worker")`.
- `src/services/projection/dashboard-worker/app.py :: on_event(evt: EventEnvelope, ctx: EventContext[DashboardStore]) -> None` — `@app.on_any` 핸들러. `timeline_update_from_event(evt)` 가 `None`(관심 밖 subject)이 아니면 `ctx.db.upsert_rca_timeline(row)`.

## 데이터 모델 (Data Model)

`rca_timeline` 테이블 (`src/domains/dashboard/models.py :: RcaTimeline`), 유니크 제약 `(workspace_id, correlation_id)` — 흐름(correlation) 하나당 1행:

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK | — |
| workspace_id | Text | not null, UQ 일부 | payload 다경로 추출, 기본 `DEFAULT_WORKSPACE_ID` |
| correlation_id | Text | not null, UQ 일부 | `evt.correlation_id or evt.event_id` |
| cluster_id / incident_id / evidence_ref | Text | nullable | payload 다경로 추출 |
| current_subject | Text | not null | 마지막 반영 이벤트 subject |
| status | Text | not null | subject → 상태 매핑값(아래 표) |
| root_cause | Text | nullable | `root_cause` 또는 `rca_detail.root_cause` |
| confidence | Float | nullable | float 변환 실패 시 None |
| supporting_evidence / missing_evidence | JSONB | nullable | 문자열 리스트(dedupe) |
| action_route | Text | nullable | `plan.execution_route`/`selected.route`, 없으면 subject 프리픽스로 `command`/`safe_pr` 유도 |
| command_id / pr_url / error_reason | Text | nullable | payload 추출 |
| last_event_id | Text | not null | 마지막 이벤트 id |
| last_event_at | Text | not null | `str(evt.created_at)` |
| payload | JSONB | not null | 마지막 이벤트 payload |
| created_at / updated_at | timestamp | server default | — |

## 이벤트 (Events)

- 발행: 없음.
- 구독: 전체(`>`). 이 중 `src/domains/dashboard/repository.py :: RCA_TIMELINE_STATUS_BY_SUBJECT` 에 등록된 subject 만 투영:

| subject | status |
|---|---|
| `cluster.evidence.received` | `evidence_received` |
| `evidence.built` | `evidence_built` |
| `incident.detected` | `incident_detected` |
| `evidence.bundle.built` | `evidence_bundled` |
| `rca.rule_missing` | `rule_missing` |
| `rca.backlog.created` | `backlog_created` |
| `rca.ai_fallback.requested` | `ai_fallback_requested` |
| `rca.candidates.planned` | `rca_planned` |
| `rca.candidates.evaluated` | `rca_evaluated` |
| `rca.completed` | `rca_completed` |
| `rca.followup.required` | `followup_required` |
| `rca.action_required` | `action_required` |
| `recovery.planned` | `recovery_planned` |
| `recovery.selection_requested` | `selection_required` |
| `recovery.action_selected` | `recovery_selected` |
| `approval.recommended` | `approval_recommended` |
| `command.requested` | `command_requested` |
| `command.dispatched` | `command_dispatched` |
| `command.queued_for_agent` | `command_queued` |
| `command.completed` | `command_completed` |
| `command.rejected` | `command_rejected` |
| `safe_pr.requested` | `pr_requested` |
| `safe_pr.patch_prepared` | `pr_patch_prepared` |
| `diff.explained` | `pr_diff_explained` |
| `safe_pr.ready_for_creation` | `pr_ready_for_creation` |
| `safe_pr.created` | `pr_created` |
| `safe_pr.failed` | `pr_failed` |

## 동작 (Behavior)

1. 이벤트 수신 → `timeline_update_from_event(evt)` (`src/domains/dashboard/repository.py :: timeline_update_from_event`): 매핑 밖 subject 는 `None` → no-op.
2. row 구성 시 workspace/cluster/incident/evidence 등의 필드는 payload 의 여러 중첩 경로(예: `("plan","target","cluster_id")`, `("requested","diff","workspace_id")` …)를 순서대로 탐색해 첫 값을 취함.
3. `upsert_rca_timeline` (`src/domains/dashboard/repository.py :: DashboardRepository.upsert_rca_timeline`) — `(workspace_id, correlation_id)` 충돌 시 UPDATE:
   - 식별 필드(cluster_id, incident_id, evidence_ref, root_cause, confidence, supporting/missing_evidence, action_route, command_id, pr_url)는 `COALESCE(excluded, 기존)` — **새 값이 NULL 이면 기존 값 보존**.
   - 상태 필드(current_subject, status, error_reason, last_event_id, last_event_at, payload)는 `excluded.last_event_at >= 기존.last_event_at` 일 때만 갱신 — **뒤늦게 도착한 과거 이벤트가 최신 상태를 되돌리지 못함**(out-of-order 방어).

## 불변식·오류 (Invariants & Errors)

- correlation 당 정확히 1행(유니크 제약 + upsert).
- 과거 이벤트는 식별 필드 보강만 가능, 상태 되돌림 불가.
- 매핑 밖 subject 는 부수효과 없음.
- 실패 시 WorkerRuntime 공통 재시도/DLQ 정책 적용.

## 설정 (Settings)

서비스 고유 설정 없음. WorkerRuntime 공통 env 는 [../../packages/runtime.md](../packages/runtime.md) 참조.
