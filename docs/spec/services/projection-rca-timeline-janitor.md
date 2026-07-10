---
source_commit: d0da7bf6
status: synced
---

# rca-timeline-janitor — 오래 열린 RCA timeline incident 자동 종결

> 소스: `src/services/projection/rca-timeline-janitor/app.py` · 테스트: `tests/test_rca_timeline_janitor.py`, `tests/test_service_entrypoints.py`, `tests/test_database_unit.py`

## 책임 (Responsibility)

- `rca_timeline`에서 오래 열린 incident row를 주기적으로 `incident_expired`로 종결해 fleet open incident 수가 무한 누적되지 않게 한다.
- incident 탐지 전 상태(`evidence_received`, `evidence_built`)의 오래된 projection을 배치 삭제해 read model 크기를 제한한다. 원본 event/evidence/audit는 삭제하지 않는다.
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
- `RCA_PRE_INCIDENT_RETENTION_HOURS`, 기본 `"24"`; `RCA_PRE_INCIDENT_RETENTION_LIMIT`, 기본 `"1000"`.
- `src/services/projection/rca-timeline-janitor/app.py :: expire_stale_open_incidents(db) -> int` — env를 읽어 `db.expire_stale_open_rca_incidents(max_age_days, limit)`를 호출하고 종결 수를 반환한다.
- `src/services/projection/rca-timeline-janitor/app.py :: delete_stale_pre_incident_timeline(db) -> int` — 보존시간을 넘긴 전처리 projection 삭제 수를 반환한다.
- `src/services/projection/rca-timeline-janitor/app.py :: run() -> None` — 주기 sweep 루프.

## 데이터 모델 (Data Model)

자체 테이블 없음. [dashboard](../domains/dashboard.md)의 `rca_timeline`만 수정한다. open incident는 `status IN OPEN_INCIDENT_STATUSES`와 보존기간 조건으로 원자 종결한다. 전처리 projection은 `status IN PRE_INCIDENT_STATUSES`와 시간 조건으로 CTE + `FOR UPDATE SKIP LOCKED` 후 배치 삭제한다.

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
   - `delete_stale_pre_incident_timeline(async_db)`를 호출하고 삭제 수가 있으면 정보 로그를 남긴다.
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
| `RCA_PRE_INCIDENT_RETENTION_HOURS` | int | `24` | 전처리 projection 보존 시간 |
| `RCA_PRE_INCIDENT_RETENTION_LIMIT` | int | `1000` | 한 sweep에서 삭제할 최대 projection row 수 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness heartbeat 파일 |
