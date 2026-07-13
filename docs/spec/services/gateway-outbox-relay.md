---
source_commit: d0da7bf6
status: synced
---

# outbox-relay — all-source outbox NATS 발행 루프

> 소스: `src/services/gateway/outbox-relay/app.py` · 테스트: `tests/test_env_defaults.py`, `tests/test_service_entrypoints.py`, `tests/test_outbox.py`

## 책임 (Responsibility)

- 모든 source가 트랜잭션에 스테이징한 outbox row를 lease 기반으로 읽어 NATS JetStream으로 발행한다.
- Gateway HTTP 프로세스에서 relay 루프를 분리해, 요청 처리와 outbox 발행 장애 격리를 유지한다.
- 하지 않는 것: HTTP route 처리, 이벤트 소비, 이벤트 body 변환.

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
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_SOURCE_ENV` = `"OUTBOX_RELAY_SOURCE"`.
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_ALL_SOURCES` = `"*"`.
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_SOURCE` = env 기본 `"*"`. `relay_source_filter("*")`/`"all"`/빈 값은 `None`으로 변환해 모든 source를 claim한다. 특정 source 문자열을 주면 해당 source만 claim한다.
- `src/services/gateway/outbox-relay/app.py :: OUTBOX_RELAY_INTERVAL_SECONDS_ENV` = `"OUTBOX_RELAY_INTERVAL_SECONDS"`, `DEFAULT_OUTBOX_RELAY_INTERVAL_SECONDS` = `1.0`.
- `src/services/gateway/outbox-relay/app.py :: run() -> None` — DB/NATS 연결 후 relay 루프 실행.

## 데이터 모델 (Data Model)

자체 테이블 없음. [packages/storage](../packages/storage.md)의 `outbox` 테이블을 기본 `source=None`(all-source)으로 claim한다. `OutboxRelay.run_once()`는 `unsent_events(batch, source)` → `publish_envelope` → `mark_events_sent` 순서로 발행하며, 브로커의 비재시도 오류는 `mark_events_dead_lettered(..., consumer="outbox-relay:all", ...)`로 DLQ 격리한다.

## 이벤트 (Events)

- 구독: 없음.
- 발행: outbox row의 원래 `subject` 그대로 NATS에 발행한다. 새 도메인 이벤트 body를 만들지 않는다.

## 동작 (Behavior)

1. `Database()`, event bus, `stopping` 이벤트를 만든다. `run(event_bus=None)` 미주입은 `NatsEventBus()`, OSS composition root는 shared bus를 주입한다.
2. `Path(HEARTBEAT_PATH).touch()` → `wait_for_database(db)` → `bus.connect()` → `OutboxRelay(db, bus, relay_source_filter(OUTBOX_RELAY_SOURCE))`.
3. 루프:
   - heartbeat 파일을 갱신한다.
   - `relay.run_once()`를 호출한다.
   - 예외는 `outbox_relay_error` 경고 로그로 남기고 다음 주기에 재시도한다.
   - 발행 수가 `relay.batch` 이상이면 즉시 다음 batch를 돈다. 아니면 `OUTBOX_RELAY_INTERVAL_SECONDS`만큼 대기한다.
4. 종료 시 `bus.close()`, `db.dispose_async()`(있으면), `db.dispose()`(있으면)를 호출한다.
5. 진입점: `AsyncService("outbox-relay", run).run()`.

## 불변식·오류 (Invariants & Errors)

- 기본 relay source는 모든 source다. `OUTBOX_RELAY_SOURCE=api-gateway`처럼 지정하면 운영상 필요할 때 특정 source로 좁힐 수 있다.
- `OutboxRelay`의 lease claim은 `FOR UPDATE SKIP LOCKED` 기반이라 워커 내장 relay와 전용 relay가 동시에 있어도 같은 row를 동시에 발행하지 않는다.
- 루프 내부 publish 오류는 프로세스를 죽이지 않고 로그 후 재시도한다. 단, 초기 DB/NATS 연결 실패는 시작 실패로 남겨 오케스트레이터 재시작에 맡긴다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `OUTBOX_RELAY_INTERVAL_SECONDS` | float | `1.0` | 발행할 row가 batch 미만일 때 다음 run_once까지 대기 초 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness heartbeat 파일 |
