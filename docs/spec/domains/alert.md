---
source_commit: 1616d295
status: synced
---

# alert — 알람 게이트 이벤트 계약과 워크스페이스 알림 채널

> 소스: `src/domains/alert/` · 테스트: `tests/test_alert_worker.py`, `tests/test_alert_routing.py`

## 책임 (Responsibility)

- alert-worker가 사용하는 알람 이벤트 body 계약 3종(`alert.requested / dispatched / rejected`)을 정의한다.
- 워크스페이스별 알림 수신 채널(`alert_channels`)을 저장하고, admin 세션으로 채널을 조회/등록/삭제하는 HTTP 라우터를 제공한다.
- 알람 발송 실행은 alert-worker 서비스가 담당한다. 이 도메인은 "어떤 워크스페이스에 어떤 채널이 있고, 어느 severity 이상을 받을지"만 소유한다.
- 파일 구성: `events.py`(이벤트 body), `models.py`(테이블), `repository.py`(CRUD + severity 매칭), `router.py`(admin API).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.command` | [./command.md](./command.md) | `CommandRequestedBody` — 알람 통과 후 연결할 다음 명령 |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_admin_session` — 알림 채널 관리 API admin 보호 |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventBody`, `JsonObject`, `@event`, `EventSubject`, gateway route/request/response, `DEFAULT_WORKSPACE_ID`, gitops 기본값(`DEFAULT_APPLICATION_ID`, `DEFAULT_DEPLOYMENT_BINDING_ID`, `DEFAULT_ENVIRONMENT`, `DEFAULT_WORKFLOW_RUN_ID`) |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | `get_db` DI |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `DatabaseConnection`, `Base`, 공통 timestamp 컬럼 |

## 공개 인터페이스 (Public API)

- `src/domains/alert/events.py` — 이벤트 body 3종 (아래 [이벤트](#이벤트-events)).
- `src/domains/alert/models.py :: AlertChannel` — 워크스페이스별 webhook 채널 테이블.
- `src/domains/alert/repository.py :: severity_rank(severity) -> int` — `info < warning < critical`, 알 수 없는 severity는 `warning`으로 취급.
- `src/domains/alert/repository.py :: severity_matches(min_severity, severity) -> bool` — 채널의 최소 severity 이상인지 판정.
- `src/domains/alert/repository.py :: AlertChannelRepository`
  - `list_alert_channels(workspace_id, only_enabled=False) -> list[JsonObject]`
  - `upsert_alert_channel(payload) -> JsonObject`
  - `delete_alert_channel(workspace_id, channel_id) -> bool`
- `src/domains/alert/router.py :: router`
  - `GET /alert-channels` — admin 세션의 workspace 채널 목록.
  - `POST /alert-channels` — admin 세션의 workspace 채널 생성/수정.
  - `DELETE /alert-channels/{channel_id}` — admin 세션의 workspace 채널 삭제.

## 데이터 모델 (Data Model)

### `alert_channels` — `src/domains/alert/models.py :: AlertChannel`

워크스페이스마다 알림 수신 채널을 관리한다. alert-worker는 `alert.requested.workspace_id`로 이 테이블을 조회하고, `enabled=true`이며 severity가 맞는 채널 전부로 webhook을 보낸다.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `channel_id` | Text PK | 채널 ID. 신규 생성 시 서버가 `chan-<uuid>` 형태로 생성한다. |
| `workspace_id` | Text | 이 채널을 소유한 workspace. 조회/수정/삭제 스코프다. |
| `name` | Text | 사람이 보는 채널명. `alert.dispatched.channel`에도 들어간다. |
| `kind` | Text | 현재 값은 `"webhook"`만 사용한다. |
| `url` | Text | webhook POST 대상 URL. |
| `min_severity` | Text | `info`, `warning`, `critical` 중 하나. 이 값 이상만 발송한다. |
| `enabled` | Boolean | 꺼진 채널은 워커가 무시한다. |
| `created_at` / `updated_at` | timestamp | 공통 생성/수정 시각. |

인덱스: `ix_alert_channels_scope(workspace_id, enabled)`.

`channel_id`는 전역 PK지만 upsert는 `workspace_id`가 같은 경우에만 수정한다. 다른 workspace의 `channel_id`를 넘기면 `LookupError`가 나고 라우터는 404로 바꿔서 반환한다.

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

채널 관리 API 흐름:

1. 사용자가 admin 세션으로 로그인한다.
2. `GET /alert-channels`로 현재 workspace 채널을 본다.
3. `POST /alert-channels`에 `name`, `url`, `kind="webhook"`, `min_severity`, `enabled`를 보낸다. `channel_id`를 비우면 신규 생성이고, 기존 ID를 보내면 같은 workspace 안에서 수정한다.
4. `DELETE /alert-channels/{channel_id}`로 채널을 삭제한다. 같은 workspace 채널이 아니면 404다.

alert-worker와 연결되는 실행 흐름은 [alert-worker 서비스 스펙](../services/alert-alert-worker.md)을 따른다. 요약하면 `alert.requested` 수신 → 정책 게이트 → workspace 채널 조회/전송 → 성공 시 `alert.dispatched`(+`next_command`가 있으면 `command.requested`) 또는 실패 시 `alert.rejected`다.

## 불변식·오류 (Invariants & Errors)

- body는 모두 불변(frozen dataclass).
- `AlertRejectedBody.requested`에는 차단된 원요청 payload를 그대로 첨부한다(감사 추적).
- `min_severity`는 `info < warning < critical` 순서다.
- 알 수 없는 alert severity는 `warning`으로 취급한다. 너무 낮게 보아 누락되는 것보다 warning 채널로 보내는 쪽을 택했다.
- 채널이 하나 이상 매칭되면 alert-worker는 전역 `ALERT_PROVIDER`가 아니라 채널 라우팅을 우선한다. 매칭 채널이 없으면 기존 전역 provider로 폴백한다.

## 설정 (Settings)

도메인 자체 환경변수는 없다. 발송 타임아웃과 전역 provider 폴백 설정은 [alert-worker 서비스 스펙](../services/alert-alert-worker.md#설정-settings)을 본다.
