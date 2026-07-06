---
source_commit: 1616d295
status: synced
---

# audit-worker — 모든 이벤트를 불변 감사 로그로 적재하는 프로젝션 워커

> 소스: `src/services/projection/audit-worker/app.py` · 테스트: `tests/test_projection.py`, `tests/test_service_entrypoints.py`

## 책임 (Responsibility)

- `@app.on_any` 전체(`>`) 구독으로 스트림의 **모든 이벤트 봉투를 그대로** `audit_log` 테이블에 append 한다.
- 체이닝 없음(말단 소비자) — 어떤 이벤트도 발행하지 않는다.
- 하지 않는 것: payload 해석/필터링/변환(봉투 필드를 그대로 저장), 조회 API(조회는 별도 경로).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.audit` | [../../domains/audit.md](../domains/audit.md) | `audit_log_row` 매핑, `audit_log` 테이블 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `EventEnvelope`, `AuditStore` 프로토콜 |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext`, WorkerRuntime(하트비트·ledger·DLQ) |
| 외부 | NATS JetStream | — | durable consumer `audit-worker` 로 `>` 구독 |
| 외부 | PostgreSQL | — | `audit_log` INSERT |

## 공개 인터페이스 (Public API)

- `src/services/projection/audit-worker/app.py :: app` — `App("audit-worker")`.
- `src/services/projection/audit-worker/app.py :: on_event(evt: EventEnvelope, ctx: EventContext[AuditStore]) -> None` — `@app.on_any` 핸들러.

## 데이터 모델 (Data Model)

`audit_log` 테이블 (`src/domains/audit/models.py :: AuditLog`):

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | — |
| event_id | Text | not null | 봉투 event_id |
| subject | Text | not null | 이벤트 subject |
| source | Text | not null | 발행 서비스 |
| correlation_id | Text | not null | 흐름 상관관계 ID |
| payload | JSONB | not null | 봉투 payload 원본 |
| created_at | timestamp | server default now | 적재 시각 |

## 이벤트 (Events)

- 구독(Consumes): **전체** — subject `>`(`ALL_EVENTS_SUBJECT`), body 디코드 없이 `EventEnvelope` 원형 수신.
- 발행(Publishes): 없음.

## 동작 (Behavior)

1. `WorkerRuntime` 이 durable consumer 로 메시지 fetch → ledger claim(중복이면 skip).
2. `on_event`: `audit_log_row(evt)` (`src/domains/audit/repository.py :: audit_log_row` — event_id/subject/source/correlation_id/payload 매핑) 1건을 `ctx.db.append_audit_logs([row])` 로 INSERT.
3. 벌크 INSERT 경로로 단일화되어 있으나 현재는 이벤트 1건 = 트랜잭션 1건(ledger 원자성) — 이벤트 간 버퍼링(진짜 배치 적재)은 원자성 경계 재설계 전까지 보류(코드 주석에 명시).
4. yield 없음 → outbox 스테이징 없음.

## 불변식·오류 (Invariants & Errors)

- 감사 로그는 append-only(UPDATE/DELETE 경로 없음).
- 단건·벌크 insert 는 같은 매핑(`audit_log_row`)을 공유(단일 출처).
- 핸들러 실패 시 WorkerRuntime 공통 정책: 최대 `WORKER_MAX_ATTEMPTS`(기본 3) 재시도 후 DLQ(`dead_letter.created` 발행) — [runtime](../packages/runtime.md) 참조.
- 자기 자신이 소비하는 `dead_letter.created` 도 감사 로그에 남는다(전체 구독이므로).

## 설정 (Settings)

서비스 고유 설정 없음. WorkerRuntime 공통 env(`WORKER_MAX_ATTEMPTS`, `WORKER_FETCH_BATCH_SIZE`, `WORKER_HANDLER_TIMEOUT_SECONDS`, `WORKER_RETRY_DELAY_SECONDS`, `WORKER_IDLE_SLEEP_SECONDS`, `WORKER_HEARTBEAT_PATH` 등)은 [../../packages/runtime.md](../packages/runtime.md) 참조.
