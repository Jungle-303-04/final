---
source_commit: 1616d295
status: synced
---

# alert — 알람 게이트 이벤트 계약

> 소스: `src/domains/alert/` · 테스트: `tests/test_alert_worker.py`

## 책임 (Responsibility)

- alert-worker가 사용하는 알람 이벤트 body 계약 3종(`alert.requested / dispatched / rejected`)을 정의한다.
- 이 도메인은 이벤트 계약만 소유한다 — 테이블·리포지토리·라우터·핸들러 없음. 알람 발송 로직은 alert-worker 서비스가 담당한다.
- 파일 구성: `__init__.py`(docstring `"alert 도메인."`), `events.py` 뿐.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command` | [./command.md](./command.md) | `CommandRequestedBody` — 알람 통과 후 연결할 다음 명령 |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventBody`, `JsonObject`, `@event`, `EventSubject`, `DEFAULT_WORKSPACE_ID`, gitops 기본값(`DEFAULT_APPLICATION_ID`, `DEFAULT_DEPLOYMENT_BINDING_ID`, `DEFAULT_ENVIRONMENT`, `DEFAULT_WORKFLOW_RUN_ID`) |

## 공개 인터페이스 (Public API)

`src/domains/alert/events.py`의 이벤트 body 3종이 전부다 (아래 [이벤트](#이벤트-events)).

## 데이터 모델 (Data Model)

없음 (이 도메인은 테이블을 소유하지 않는다).

## 이벤트 (Events)

모두 `@event(EventSubject.*)` + `@dataclass(frozen=True)`, `EventBody` 상속. 라우팅 키(subject) = `EventSubject` 값.

### `alert.requested` (`EventSubject.ALERT_REQUESTED`) — `src/domains/alert/events.py :: AlertRequestedBody`

알람 발송, 통과 시 다음 이벤트 연결 요청.

| 필드 | 타입 | 기본값 |
|---|---|---|
| cluster_id | str | (필수) |
| namespace | str | (필수) |
| severity | str | (필수) |
| message | str | (필수) |
| reason | str | (필수) |
| next_command | [CommandRequestedBody](./command.md#commandrequestedbody) \| None | None |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| application_id | str | `DEFAULT_APPLICATION_ID` |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` |
| environment | str | `DEFAULT_ENVIRONMENT` |

### `alert.dispatched` (`EventSubject.ALERT_DISPATCHED`) — `src/domains/alert/events.py :: AlertDispatchedBody`

알람 전송 경계 통과.

| 필드 | 타입 | 기본값 |
|---|---|---|
| cluster_id | str | (필수) |
| namespace | str | (필수) |
| severity | str | (필수) |
| channel | str | (필수) |
| mode | str | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| application_id | str | `DEFAULT_APPLICATION_ID` |
| workflow_run_id | str | `DEFAULT_WORKFLOW_RUN_ID` |
| binding_id | str | `DEFAULT_DEPLOYMENT_BINDING_ID` |
| environment | str | `DEFAULT_ENVIRONMENT` |

### `alert.rejected` (`EventSubject.ALERT_REJECTED`) — `src/domains/alert/events.py :: AlertRejectedBody`

알람/정책 게이트의 다음 실행 차단.

| 필드 | 타입 | 기본값 |
|---|---|---|
| reason | str | (필수) |
| requested | JsonObject | (필수) — 원요청 body |

## 동작 (Behavior)

이 도메인 자체 동작 없음. 흐름은 alert-worker 서비스 스펙 참조: `alert.requested` 수신 → 발송/게이트 판정 → 통과 시 `alert.dispatched`(+`next_command`가 있으면 해당 `command.requested` 연결 발행), 차단 시 `alert.rejected`.

## 불변식·오류 (Invariants & Errors)

- body는 모두 불변(frozen dataclass).
- `AlertRejectedBody.requested`에는 차단된 원요청 payload를 그대로 첨부한다(감사 추적).

## 설정 (Settings)

없음.
