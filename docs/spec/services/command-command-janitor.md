---
source_commit: 664925a6
status: synced
---

# command-janitor — 만료 방치 명령을 주기 sweep 해 command.completed(FAILED) 발행

> 소스: `src/services/command/command-janitor/app.py` · 테스트: `tests/test_command_janitor.py`, `tests/test_service_entrypoints.py`

## 책임 (Responsibility)

- 이벤트 구독 없이 **주기 폴링 루프**로 `fail_expired_agent_commands()` 를 호출해, lease 가 만료된 채 방치된 명령(LEASED/RUNNING)을 FAILED 로 종결하고 행마다 `command.completed` 를 발행한다.
- [command-worker](command-command-worker.md)의 기회적 sweep 과 병행하는 전용 안전망 — 명령 이벤트가 전혀 흐르지 않아도 workflow 가 영구 APPLYING 에 갇히지 않게 한다.
- 하지 않는 것: 명령 큐 적재/정책 판정(command-worker), 명령 실행(cluster-agent).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command` | [../../domains/command.md](../domains/command.md) | `CommandCompletedBody`, `fail_expired_agent_commands`(Database 경유) |
| import | `packages.events` | [../../packages/events.md](../packages/events.md) | `NatsEventBus`, `RecordedEventClient`(emit = 기록 + 직접 발행) |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `AsyncService`, `AsyncDb`, `HEARTBEAT_PATH` |
| import | `packages.storage` | [../../packages/storage.md](../packages/storage.md) | `Database`, `wait_for_database` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, 로깅 |
| 외부 | PostgreSQL / NATS | — | 만료 UPDATE / 이벤트 발행 |

## 공개 인터페이스 (Public API)

- `src/services/command/command-janitor/app.py :: COMMAND_JANITOR` = `"command-janitor"`.
- `src/services/command/command-janitor/app.py :: SWEEP_INTERVAL_SECONDS_ENV` = `"COMMAND_JANITOR_INTERVAL_SECONDS"`, `DEFAULT_SWEEP_INTERVAL_SECONDS` = `"15"`.
- `src/services/command/command-janitor/app.py :: emit_expired_command_completions(db, events, service_name="command-janitor") -> int` — `db.fail_expired_agent_commands()` 가 반환한 각 행에 대해 `CommandCompletedBody(command_id, result)` 를 `events.emit(body.__subject__, service_name, body.to_body(), correlation_id=f"command-janitor:{command_id}")` 로 발행. 종결 건수 반환.
- `src/services/command/command-janitor/app.py :: run() -> None` — 메인 루프(async).

## 데이터 모델 (Data Model)

자체 테이블 없음. `agent_commands` 는 [command 도메인](../domains/command.md) 소유 — 만료 종결 UPDATE 는 `src/domains/command/repository.py :: fail_expired_agent_commands`(grace 300초, `result={"status":"failed","applied":false,"message":"command lease expired; no agent completed the command"}`).

## 이벤트 (Events)

- 구독: 없음(NATS consumer 미생성 — publish 전용 연결).
- 발행: `command.completed` — `CommandCompletedBody(command_id: str, result: JsonObject)`. **correlation_id 는 `command-janitor:<command_id>`** (원 흐름의 correlation 이 아님 — RETURNING 행의 `correlation_id` 컬럼은 현재 사용하지 않음). 발행 경로는 `RecordedEventClient.emit` = 이벤트 기록(record) + 버스 직접 발행(워커 outbox relay 경로 아님).

## 동작 (Behavior)

`run()`:

1. `Database()`, `AsyncDb(db)`, `NatsEventBus()` 생성. `SIGTERM`/`SIGINT` → `stopping` 이벤트 set.
2. `wait_for_database(db)` → `bus.connect()` → `RecordedEventClient(bus, db)`.
3. 루프(`stopping` 전까지):
   - `Path(HEARTBEAT_PATH).touch()` — liveness 하트비트(기본 `/tmp/heartbeat`).
   - `emit_expired_command_completions(async_db, events)` — 종결 건수 > 0 이면 `expired_commands_swept` 경고 로그(context.count).
   - `asyncio.wait_for(stopping.wait(), timeout=interval)` — interval(기본 15초) 대기, TimeoutError 면 다음 회차.
4. finally: `bus.close()`, `db.dispose()`.
5. 진입점: `AsyncService("command-janitor", run).run()`.

## 불변식·오류 (Invariants & Errors)

- 만료 종결은 단일 원자 `UPDATE ... RETURNING` — command-worker 의 sweep 과 경합해도 같은 행이 두 번 종결되지 않는다(단, 각자 종결한 행에 대한 completed 이벤트는 각자 발행).
- 루프 내부에 try/except 가 없다 — `fail_expired_agent_commands` 또는 `emit` 예외는 루프를 탈출시키고 finally 정리 후 프로세스 종료(재시작은 오케스트레이터 책임).
- 이벤트 발행은 DB 종결 커밋 이후 — 발행 실패 시 completed 이벤트가 유실될 수 있으나 행은 이미 FAILED(관측 지표 `command_status_total{status="failed"}` 로 탐지 가능).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `COMMAND_JANITOR_INTERVAL_SECONDS` | float | `15` | sweep 주기 초 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness 하트비트 파일(`HEARTBEAT_PATH`) |
