---
source_commit: 1616d295
status: synced
---

# dead-letter-monitor — dead_letter.created 를 운영 alert 흐름으로 연결

> 소스: `src/services/projection/dead-letter-monitor/app.py` · 테스트: `tests/test_operational_event_followups.py`

## 책임 (Responsibility)

- `dead_letter.created` 이벤트를 구독해 경고 로그를 남기고, 운영 알림 파이프라인용 `alert.requested` 를 발행한다(→ [alert-worker](alert-alert-worker.md)가 실제 전송).
- 하지 않는 것: DLQ 행 조회/재발행(api-gateway admin 라우트 담당), 알림 전송 자체.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.alert` | [../../domains/alert.md](../domains/alert.md) | `AlertRequestedBody` 발행 |
| import | `packages.contracts` | [../../packages/contracts.md](../packages/contracts.md) | `DeadLetterCreatedBody`, `EventBody`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.config` | [../../packages/config.md](../packages/config.md) | `env`, 로깅 |
| import | `packages.runtime` | [../../packages/runtime.md](../packages/runtime.md) | `App`, WorkerRuntime |
| 발행 | `alert.requested` | [../../domains/alert.md](../domains/alert.md) | alert-worker 로 연결 |
| 구독 | `dead_letter.created` | [../../packages/contracts.md](../packages/contracts.md) | 런타임(DeadLetterSink) 소유 플랫폼 이벤트 |

## 공개 인터페이스 (Public API)

- `src/services/projection/dead-letter-monitor/app.py :: app` — `App("dead-letter-monitor")`.
- `src/services/projection/dead-letter-monitor/app.py :: on_dead_letter_created(evt: DeadLetterCreatedBody) -> AsyncIterator[EventBody]` — `@app.on(DeadLetterCreatedBody)` 핸들러(ctx 미사용 단일 인자 시그니처).
- env 키 상수: `DEAD_LETTER_ALERT_CLUSTER_ID_ENV`, `DEAD_LETTER_ALERT_NAMESPACE_ENV`, `DEAD_LETTER_ALERT_SEVERITY_ENV` 와 기본값 `DEFAULT_DEAD_LETTER_ALERT_CLUSTER_ID = "management-plane"`, `DEFAULT_DEAD_LETTER_ALERT_NAMESPACE = "platform"`, `DEFAULT_DEAD_LETTER_ALERT_SEVERITY = "warning"`.

## 데이터 모델 (Data Model)

없음 (DB 접근 없음 — 로그 + 이벤트 체이닝만).

## 이벤트 (Events)

### 구독 — `dead_letter.created` (`packages/contracts/event_bus/bodies/platform.py :: DeadLetterCreatedBody`)

| 필드 | 타입 | 설명 |
|---|---|---|
| dead_letter_id | int | DLQ 행 id |
| original_event_id / original_subject | str | 실패한 원본 이벤트 |
| consumer | str | 실패한 소비 서비스 |
| attempts | int | 소진된 시도 횟수 |
| error | str | 마지막 오류 |
| created_at / status / correlation_id | str | DLQ 메타 |
| payload | JsonObject \| None | 디코드 실패(raw) 경로에서만 원문 |

### 발행 — `alert.requested` (`src/domains/alert/events.py :: AlertRequestedBody`)

| 필드 | 값 |
|---|---|
| cluster_id | `env(DEAD_LETTER_ALERT_CLUSTER_ID, "management-plane")` |
| namespace | `env(DEAD_LETTER_ALERT_NAMESPACE, "platform")` |
| severity | `env(DEAD_LETTER_ALERT_SEVERITY, "warning")` |
| message | `f"dead letter captured for {evt.original_subject}"` |
| reason | `f"{evt.consumer}: {evt.error}"` |
| workspace_id | `env("WORKSPACE_ID", DEFAULT_WORKSPACE_ID)` (기본 `"default"`) |
| next_command | (미지정 → None) |

라우팅: outbox 스테이징 → relay 발행, correlation/causation 은 런타임이 원본 이벤트에서 승계.

## 동작 (Behavior)

1. `dead_letter.created` 수신 → `LOGGER.warning("dead letter created", context={dead_letter_id, original_subject, consumer, attempts, error})`.
2. env 기반 좌표(cluster/namespace/severity/workspace)로 `AlertRequestedBody` 1건 yield.
3. WorkerRuntime 이 yield 된 body 를 outbox 에 스테이징하고 relay 가 발행.

## 불변식·오류 (Invariants & Errors)

- `next_command` 를 절대 싣지 않는다 — DLQ 알림이 자동 명령을 유발하지 않음.
- 핸들러 자체가 실패해 DLQ 로 가면 그 `dead_letter.created` 도 다시 이 워커가 소비한다(무한 루프는 아님 — 새 알림 1건으로 수렴하며, 알림 발행 실패가 반복되면 해당 이벤트도 DLQ 종결).
- env 는 요청 처리 시점마다 평가(핫 리로드 가능).

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `DEAD_LETTER_ALERT_CLUSTER_ID` | str | `management-plane` | 알림에 표기할 cluster |
| `DEAD_LETTER_ALERT_NAMESPACE` | str | `platform` | 알림 namespace |
| `DEAD_LETTER_ALERT_SEVERITY` | str | `warning` | 알림 severity |
| `WORKSPACE_ID` | str | `default` | 알림 workspace |

WorkerRuntime 공통 env 는 [../../packages/runtime.md](../packages/runtime.md) 참조.
