---
source_commit: 20945a70
status: synced
---

# alert-worker — alert.requested → 정책 게이트 → 전송 → optional command 체이닝

> 소스: `src/services/alert/alert-worker/app.py` · 테스트: `tests/test_alert_worker.py`, `tests/test_event_golden_path.py`

## 책임 (Responsibility)

- `alert.requested` 를 받아 ① 정책 검증(severity 차단·자동 명령 환경 제한) → ② provider(log/webhook)로 전송 → ③ 성공 시 `alert.dispatched` + (있으면) `next_command`(`command.requested`) 체이닝, 실패/차단 시 `alert.rejected` 발행.
- pre-deploy alert gate: 전송이 확인되지 않으면 다음 명령을 절대 이어주지 않는다(fail-closed).
- `alert.dispatched`/`alert.rejected` 도 자기 구독해 관측 로그를 남긴다(부수효과는 로그뿐).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.alert` | [../../domains/alert.md](../domains/alert.md) | 이벤트 body 3종 |
| import | `domains.command` (간접, body 로) | [../../domains/command.md](../domains/command.md) | `next_command: CommandRequestedBody` |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `AlertProvider` 프로토콜, `EventBody` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, 로깅 |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext`, WorkerRuntime |
| 외부 | httpx | — | webhook provider POST |
| 외부 | 임의 웹훅 URL | — | `ALERT_WEBHOOK_URL` |

## 공개 인터페이스 (Public API)

- `src/services/alert/alert-worker/app.py :: app` — `App("alert-worker")`.
- `src/services/alert/alert-worker/app.py :: csv_values(value) -> set[str]` — 콤마 분리·trim·소문자화.
- `src/services/alert/alert-worker/app.py :: AlertPolicyDecision` — frozen dataclass `(allowed: bool, reason: str = "")`.
- `src/services/alert/alert-worker/app.py :: check_alert_policy(evt: AlertRequestedBody) -> AlertPolicyDecision` — 전송 전 정책 판정.
- `src/services/alert/alert-worker/app.py :: dispatched_body(alert, channel, mode) -> AlertDispatchedBody` — 요청 좌표(cluster/namespace/severity/workspace/application/workflow_run/binding/environment) 승계.
- `src/services/alert/alert-worker/app.py :: LogAlertProvider` — `dispatch(alert)`: 구조화 로그 `"alert delivered to log sink"` 후 `channel=mode="log"`.
- `src/services/alert/alert-worker/app.py :: WebhookAlertProvider` — `__init__(transport: httpx.AsyncBaseTransport | None = None)`(테스트 주입). `dispatch(alert)`: URL 미설정 시 `RuntimeError(MISSING_WEBHOOK_URL_MESSAGE)`, 아니면 `httpx.AsyncClient(timeout=ALERT_HTTP_TIMEOUT_SECONDS)` 로 `alert.to_body()` JSON POST + `raise_for_status()` → `channel=mode="webhook"`.
- `src/services/alert/alert-worker/app.py :: build_alert_provider(name=None) -> AlertProvider` — `ALERT_PROVIDER` env(기본 `log`)로 선택. 미지 값은 `RuntimeError`(fail-fast, 부팅 실패). webhook 의 URL 부재는 부팅 실패가 아니라 요청 시점 `alert.rejected`.
- `src/services/alert/alert-worker/app.py :: ALERT_PROVIDER` — 모듈 import 시 1회 생성되는 전송 전략(주입 지점).
- 핸들러: `on_alert_requested(evt, ctx) -> AsyncIterator[EventBody]`, `on_alert_dispatched(evt) -> None`, `on_alert_rejected(evt) -> None`.
- 상수: `ALERT_GATE_BLOCKED_REASON = "pre-deploy alert gate blocked"`(현재 미참조 문자열 상수), `ALERT_DISPATCH_FAILED_REASON = "alert dispatch failed"`, `ALERT_SEVERITY_BLOCKED_REASON = "alert severity blocked by policy"`, `AUTO_COMMAND_ENVIRONMENT_DENIED_REASON = "auto command not allowed for environment"`, `LOG_PROVIDER_NAME = "log"`, `WEBHOOK_PROVIDER_NAME = "webhook"`, `MISSING_WEBHOOK_URL_MESSAGE`.

## 데이터 모델 (Data Model)

없음 (DB 미사용 — `EventContext[object]`).

## 이벤트 (Events)

body 스키마는 [alert 도메인](../domains/alert.md) 참조.

| 구분 | subject | 조건 |
|---|---|---|
| 구독 | `alert.requested` | 메인 파이프라인 |
| 구독 | `alert.dispatched` | 관측 로그 `"alert dispatched"` (info) |
| 구독 | `alert.rejected` | 관측 로그 `"alert rejected"` (warning) |
| 발행 | `alert.dispatched` | 정책 통과 + provider 전송 성공 |
| 발행 | `alert.rejected` | 정책 차단(`reason=정책 사유`) 또는 전송 실패(`reason="alert dispatch failed"`) — `requested=evt.to_body()` 첨부 |
| 발행 | `command.requested` | 전송 성공이고 `evt.next_command is not None` 일 때, dispatched 다음에 yield |

## 동작 (Behavior)

`on_alert_requested` 순서:

1. **정책 게이트** `check_alert_policy`:
   - `evt.severity`(trim·소문자)가 `ALERT_BLOCKED_SEVERITIES`(csv, 기본 빈 set)에 있으면 거부(`alert severity blocked by policy`).
   - `evt.next_command is not None` 이고 `evt.environment`(소문자)가 `ALERT_AUTO_COMMAND_ENVIRONMENTS`(기본 `sandbox,staging`)에 없으면 거부(`auto command not allowed for environment`) — **알림 자체도 전송하지 않고** rejected 로 종결.
2. 거부 시: `AlertRejectedBody(reason, requested=evt.to_body())` yield 후 return.
3. **전송**: `ALERT_PROVIDER.dispatch(evt)`. 모든 예외(`Exception`)를 잡아 경고 로그 후 `AlertRejectedBody(reason="alert dispatch failed", requested=...)` yield — next_command 미연결(fail-closed).
4. 성공 시: `dispatched` yield → `next_command` 있으면 이어서 yield. 두 이벤트는 같은 트랜잭션의 outbox 로 스테이징됨(원자적).

## 불변식·오류 (Invariants & Errors)

- 전송 확인 없이 `next_command` 를 발행하지 않는다.
- 자동 명령 체이닝은 허용 환경(`sandbox,staging` 기본)에서만.
- 거부 이벤트에는 항상 원요청 payload(`requested`)를 첨부(감사 추적).
- provider 이름 미지 값은 부팅 실패(RuntimeError), webhook URL 부재는 요청 시점 rejected(워커는 살아있음).
- env 정책 값은 요청마다 재평가(재배포 없이 변경 반영).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `ALERT_PROVIDER` | str | `log` | 전송 전략: `log` \| `webhook` |
| `ALERT_WEBHOOK_URL` | str | `""` | webhook POST 대상(미설정 시 요청마다 rejected) |
| `ALERT_HTTP_TIMEOUT_SECONDS` | float | `10` | webhook 타임아웃 |
| `ALERT_BLOCKED_SEVERITIES` | csv | `""` | 차단 severity 목록(소문자 비교) |
| `ALERT_AUTO_COMMAND_ENVIRONMENTS` | csv | `sandbox,staging` | next_command 허용 환경 |

WorkerRuntime 공통 env 는 [../../packages/runtime.md](../packages/runtime.md) 참조.
