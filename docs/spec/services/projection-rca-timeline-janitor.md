---
source_commit: d0da7bf6
status: synced
---

# rca-timeline-janitor — 오래 열린 RCA timeline incident 자동 종결

> 소스: `src/services/projection/rca-timeline-janitor/app.py` · 테스트: `tests/test_rca_timeline_janitor.py`, `tests/test_service_entrypoints.py`, `tests/test_database_unit.py`

## 책임 (Responsibility)

- `rca_timeline`에서 오래 열린 incident row를 주기적으로 `incident_expired`로 종결해 fleet open incident 수가 무한 누적되지 않게 한다.
- projection read model의 보존 정책만 담당한다.
- 하지 않는 것: 이벤트 소비, RCA 분석, command 실행, timeline 신규 투영.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.dashboard` | [../domains/dashboard.md](../domains/dashboard.md) | `expire_stale_open_rca_incidents` DB 메서드 |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `AsyncService`, `AsyncDb`, `HEARTBEAT_PATH` |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Database`, `wait_for_database` |
| import | `packages.config` | [../packages/config.md](../packages/config.md) | `env`, 구조화 로그 |
| 외부 | PostgreSQL | — | `rca_timeline` 원자 UPDATE |

## 공개 인터페이스 (Public API)

- `src/services/projection/rca-timeline-janitor/app.py :: RCA_TIMELINE_JANITOR` = `"rca-timeline-janitor"`.
- `src/services/projection/rca-timeline-janitor/app.py :: SWEEP_INTERVAL_SECONDS_ENV` = `"RCA_TIMELINE_JANITOR_INTERVAL_SECONDS"`, 기본 `"900"`.
- `src/services/projection/rca-timeline-janitor/app.py :: EXPIRE_DAYS_ENV` = `"RCA_OPEN_INCIDENT_EXPIRE_DAYS"`, 기본 `"3"`.
- `src/services/projection/rca-timeline-janitor/app.py :: EXPIRE_LIMIT_ENV` = `"RCA_OPEN_INCIDENT_EXPIRE_LIMIT"`, 기본 `"500"`.
- `src/services/projection/rca-timeline-janitor/app.py :: expire_stale_open_incidents(db) -> int` — env를 읽어 `db.expire_stale_open_rca_incidents(max_age_days, limit)`를 호출하고 종결 수를 반환한다.
- `src/services/projection/rca-timeline-janitor/app.py :: run() -> None` — 주기 sweep 루프.

## 데이터 모델 (Data Model)

자체 테이블 없음. [dashboard](../domains/dashboard.md)의 `rca_timeline`을 수정한다. 대상 row 조건은 `incident_id IS NOT NULL`, `cluster_id IS NOT NULL`, `status NOT IN CLOSED_INCIDENT_STATUSES`, `updated_at < now() - max_age_days`이다. DB 쿼리는 오래된 row부터 `LIMIT` 개를 CTE(`stale_open_incidents`)로 잡고 `FOR UPDATE SKIP LOCKED` 후 원자 `UPDATE ... RETURNING`한다.

## 이벤트 (Events)

- 구독: 없음.
- 발행: 없음. 상태 변경은 read model DB update로만 남는다.

## 동작 (Behavior)

1. `Database()`, `AsyncDb(db)`, `stopping` 이벤트를 만든다.
2. `wait_for_database(db)` 후 `RCA_TIMELINE_JANITOR_INTERVAL_SECONDS`를 읽는다.
3. 루프:
   - heartbeat 파일을 갱신한다.
   - `expire_stale_open_incidents(async_db)`를 호출한다.
   - 종결 수가 있으면 `stale_open_incidents_expired` 경고 로그에 `count`를 남긴다.
   - 다음 interval까지 대기한다.
4. 종료 시 `db.dispose()`를 호출한다.
5. 진입점: `AsyncService("rca-timeline-janitor", run).run()`.

## 불변식·오류 (Invariants & Errors)

- `limit`은 DB 메서드에서 `1..500`으로 bounded된다.
- 종료 status는 `incident_expired`이며, 기존 `error_reason`이 없을 때만 `open incident exceeded <N> day retention window`를 채운다.
- 이벤트를 새로 발행하지 않으므로 downstream 재처리는 일으키지 않는다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `RCA_TIMELINE_JANITOR_INTERVAL_SECONDS` | float | `900` | sweep 주기 초 |
| `RCA_OPEN_INCIDENT_EXPIRE_DAYS` | int | `3` | open incident 자동 종결 기준 일수 |
| `RCA_OPEN_INCIDENT_EXPIRE_LIMIT` | int | `500` | 한 sweep에서 종결할 최대 row 수 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness heartbeat 파일 |

