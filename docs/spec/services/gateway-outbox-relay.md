---
source_commit: d0da7bf6
status: synced
---

# outbox-relay — api-gateway outbox 전용 NATS 발행 루프

> 소스: `src/services/gateway/outbox-relay/app.py` · 테스트: `tests/test_env_defaults.py`, `tests/test_service_entrypoints.py`, `tests/test_outbox.py`

## 책임 (Responsibility)

- `api-gateway`가 트랜잭션에 스테이징한 outbox row만 읽어 NATS JetStream으로 발행한다.
- Gateway HTTP 프로세스에서 relay 루프를 분리해, 요청 처리와 outbox 발행 장애 격리를 유지한다.
- 하지 않는 것: HTTP route 처리, 이벤트 소비, 임의 source의 outbox 발행.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `AsyncService`, `OutboxRelay`, `HEARTBEAT_PATH` |
| import | `packages.events` | [../packages/events.md](../packages/events.md) | `NatsEventBus` 발행 대상 |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Database`, `wait_for_database`, outbox repository |
| import | `packages.config` | [../packages/config.md](../packages/config.md) | `env`, 구조화 로그 |
| 외부 | PostgreSQL / NATS | — | outbox lease claim / envelope publish |

## 공개 인터페이스 (Public API)

- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY` = `"outbox-relay"`.
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_SOURCE` = `"api-gateway"` — `OutboxRelay(db, bus, OUTBOX_RELAY_SOURCE)`로 source를 고정한다.
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_INTERVAL_SECONDS_ENV` = `"OUTBOX_RELAY_INTERVAL_SECONDS"`, `DEFAULT_OUTBOX_RELAY_INTERVAL_SECONDS` = `1.0`.
- `src/services/gateway/outbox-relay/app.py :: run() -> None` — DB/NATS 연결 후 relay 루프 실행.

## 데이터 모델 (Data Model)

자체 테이블 없음. [packages/storage](../packages/storage.md)의 `outbox` 테이블을 `source="api-gateway"`로만 claim한다. `OutboxRelay.run_once()`는 `unsent_events(batch, source)` → `publish_envelope` → `mark_events_sent` 순서로 발행하며, 브로커의 비재시도 오류는 `mark_events_dead_lettered(..., consumer="outbox-relay:api-gateway", ...)`로 DLQ 격리한다.

## 이벤트 (Events)

- 구독: 없음.
- 발행: outbox row의 원래 `subject` 그대로 NATS에 발행한다. 새 도메인 이벤트 body를 만들지 않는다.

## 동작 (Behavior)

1. `Database()`, `NatsEventBus()`, `stopping` 이벤트를 만든다.
2. `Path(HEARTBEAT_PATH).touch()` → `wait_for_database(db)` → `bus.connect()` → `OutboxRelay(db, bus, "api-gateway")`.
3. 루프:
   - heartbeat 파일을 갱신한다.
   - `relay.run_once()`를 호출한다.
   - 예외는 `outbox_relay_error` 경고 로그로 남기고 다음 주기에 재시도한다.
   - 발행 수가 `relay.batch` 이상이면 즉시 다음 batch를 돈다. 아니면 `OUTBOX_RELAY_INTERVAL_SECONDS`만큼 대기한다.
4. 종료 시 `bus.close()`, `db.dispose_async()`(있으면), `db.dispose()`(있으면)를 호출한다.
5. 진입점: `AsyncService("outbox-relay", run).run()`.

## 불변식·오류 (Invariants & Errors)

- relay source는 `"api-gateway"`로 고정한다. 다른 서비스 outbox row는 이 프로세스가 발행하지 않는다.
- `OutboxRelay`의 lease claim은 `FOR UPDATE SKIP LOCKED` 기반이라 다중 relay replica가 같은 row를 동시에 발행하지 않는다.
- 루프 내부 publish 오류는 프로세스를 죽이지 않고 로그 후 재시도한다. 단, 초기 DB/NATS 연결 실패는 시작 실패로 남겨 오케스트레이터 재시작에 맡긴다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `OUTBOX_RELAY_INTERVAL_SECONDS` | float | `1.0` | 발행할 row가 batch 미만일 때 다음 run_once까지 대기 초 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness heartbeat 파일 |

