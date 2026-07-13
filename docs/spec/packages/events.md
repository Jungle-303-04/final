---
source_commit: 1616d295
status: synced
---

# packages/events — NATS JetStream 이벤트 버스 구현(발행·구독·DLQ 싱크)

> 소스: `src/packages/events/` · 테스트: `tests/test_event_golden_path.py`, `tests/test_stream_subjects.py`, `tests/test_dlq_reliability.py`, `tests/test_event_envelope_versioning.py`

## 책임 (Responsibility)

- [contracts/event_bus](contracts.md#하위-모듈-event_bus) 의 `EventBus` Protocol 을 NATS JetStream 으로 **구현**한다(`NatsEventBus`).
- 봉투 생성 팩토리(`event()`), 발행+기록 클라이언트(`RecordedEventClient`), DLQ 싱크(`DeadLetterSink`), causation 전파 컨텍스트를 제공한다.
- 하지 않는 것: 구독 루프 실행·재시도·멱등 처리(→ [runtime](runtime.md) `EventProcessor`/`WorkerRuntime`), 이벤트 영속 SQL(→ [storage](storage.md) `EventRepository`/`DeadLetterRepository`).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [config](config.md) | `Nats`/`Runtime` 상수, `env`, `get_logger`, `retry_dependency`, `now_iso` |
| import | `packages.contracts.event_bus` | [contracts](contracts.md) | Protocol·봉투·subject·`DeadLetterCreatedBody` |
| import | `packages.contracts.interfaces` | [contracts](contracts.md#모듈-interfacespy) | `DeadLetterStore` |
| 외부 | NATS JetStream (`nats-py`, 지연 import) | — | 브로커 |
| 발행 | `dead_letter.created` | 아래 이벤트 절 | DLQ 적재 알림 |

## 공개 인터페이스 (Public API)

### `envelope.py` — 봉투 팩토리

- `src/packages/events/envelope.py :: event`
```python
def event(subject: str, source: str, payload: JsonObject,
          correlation_id: str | None = None, causation_id: str | None = None) -> EventEnvelope
```
동작: `event_id = str(uuid.uuid4())`; `correlation = correlation_id or payload.get("correlation_id") or event_id`(명시값 → payload 실린 값 → 자기 자신이 흐름 시작점); `causation_id` 는 직전 이벤트(없으면 `None` = 뿌리); `created_at = now_iso()`; `schema_version` 은 dataclass 기본값(`ENVELOPE_SCHEMA_VERSION = 1`).

### `bus.py` — NATS 구현·클라이언트·DLQ 싱크

모듈 상수/헬퍼(앵커 `src/packages/events/bus.py :: <이름>`):

| 심볼 | 값/시그니처 | 설명 |
|---|---|---|
| `NATS_URL_ENV` | `"NATS_URL"` | NATS 접속 URL env |
| `NATS_MSG_ID_HEADER` | `"Nats-Msg-Id"` | JetStream dedup 헤더(값 = `event_id`) |
| `ACK_WAIT_SECONDS_ENV` | `"NATS_ACK_WAIT_SECONDS"` | 컨슈머 ack 대기 env |
| `DEFAULT_ACK_WAIT_SECONDS` | `"60"` | 핸들러 타임아웃(30s)의 2배 — 처리 중 재배달 금지 창 |
| `MAX_DELIVER_ENV` | `"NATS_MAX_DELIVER"` | 재배달 상한 env |
| `DEFAULT_MAX_DELIVER` | `"4"` | 워커 재시도 상한(기본 3) + 1 — 소진 후 DLQ 종결 |
| `MAX_ACK_PENDING_ENV` | `"NATS_MAX_ACK_PENDING"` | in-flight 상한 env |
| `DEFAULT_MAX_ACK_PENDING` | `"100"` | 컨슈머당 미확인 in-flight 상한(폭주 억제) |
| `DELIVER_POLICY_ENV` | `"NATS_DELIVER_POLICY"` | 새 durable consumer의 최초 전달 위치 |
| `DEFAULT_DELIVER_POLICY` | `"all"` | 기존 worker의 전체 보존 이벤트 처리 유지 |
| `CURRENT_CAUSATION_ID` | `ContextVar[str | None]("current_event_causation_id", default=None)` | 현재 처리 중 이벤트 ID(자식 이벤트의 causation 자동 연결) |

```python
def nats_client() -> Any                       # import nats (지연 import)
def nats_not_found_error() -> type[Exception]  # nats.js.errors.NotFoundError (지연 import)
def consumer_config() -> Any                   # ConsumerConfig(ack_wait, max_deliver, max_ack_pending, deliver_policy) — env 값으로 구성
def event_context(evt: EventEnvelope) -> dict[str, str | None]
    # 로그 표준 이벤트 식별 필드: subject, event_id, correlation_id, causation_id, source
@contextmanager
def event_causation(causation_id: str) -> Iterator[None]
    # CURRENT_CAUSATION_ID 를 set/reset 하는 컨텍스트
```

- `src/packages/events/bus.py :: NatsEventBus` — `EventBus` 구현.

```python
class NatsEventBus(EventBus):
    def __init__(self) -> None            # url = env(NATS_URL_ENV, Nats.DEFAULT_URL); nc = js = None
    async def connect(self) -> None       # retry_dependency(label="nats") 로 접속 + jetstream() + ensure_stream()
                                          # 연결 이름 = env(SERVICE_NAME, "service")
    async def ensure_stream(self) -> None # stream_info(STREAM_NAME) 존재 시 update_stream(기존 subjects ∪ STREAM_SUBJECTS 정렬),
                                          # NotFoundError 시 add_stream. 공통 인자: storage="file",
                                          # max_age=STREAM_MAX_AGE_SECONDS, max_bytes=STREAM_MAX_BYTES,
                                          # duplicate_window=STREAM_DUPLICATE_WINDOW_SECONDS
    async def emit(self, subject: str, source: str, payload: JsonObject,
                   correlation_id: str | None = None, causation_id: str | None = None) -> EventEnvelope
                                          # envelope.event() 생성 → js.publish(subject, json bytes,
                                          #   headers={NATS_MSG_ID_HEADER: event_id}) → "emitted" 로그
    async def publish_envelope(self, evt: EventEnvelope) -> EventEnvelope
                                          # 기존 봉투를 같은 event_id 헤더로 재발행(relay 용) → "relayed" 로그
    async def subscribe(self, subject: str, durable: str) -> EventSubscription
                                          # js.pull_subscribe(subject, durable=durable, stream=STREAM_NAME,
                                          #   config=consumer_config())
    async def close(self) -> None         # nc 존재 시 drain()
```

- `src/packages/events/bus.py :: RecordedEventClient` — 발행 + 영속 기록 + causation 자동 연결.

```python
class RecordedEventClient:
    def __init__(self, publisher: EventPublisher, recorder: EventRecorder) -> None
    async def emit(self, subject: str, source: str, payload: JsonObject,
                   correlation_id: str | None = None, causation_id: str | None = None) -> EventEnvelope
```
`emit` 은 `causation_id or CURRENT_CAUSATION_ID.get()` 으로 causation 을 자동 채워 `publisher.emit` 후 `recorder.record_event(evt)`.

- `src/packages/events/bus.py :: DeadLetterSink` — DLQ 적재 + `dead_letter.created` 발행.

```python
class DeadLetterSink:
    def __init__(self, events: EventClient, store: DeadLetterStore, source: str) -> None
    async def capture(self, evt: EventEnvelope, consumer: str, error: Exception, attempts: int) -> EventEnvelope
    async def capture_raw(self, raw: bytes, consumer: str, error: Exception) -> EventEnvelope
```
- `capture`: `store.record_dead_letter(...)` → 반환 dict 를 `DeadLetterCreatedBody.from_body` 로 검증 → `events.emit(body.__subject__, self.source, body.to_body(), evt.correlation_id, evt.event_id)`.
- `capture_raw`(디코드 실패 경로): `store.record_raw_dead_letter(...)` → 같은 방식 발행, correlation/causation 은 store 가 만든 `dead_letter["correlation_id"]`/`dead_letter["original_event_id"]`(합성 ID) 사용.

`src/packages/events/__init__.py` 는 빈 모듈(`from __future__ import annotations` 만).

## 데이터 모델 (Data Model)

봉투 스키마는 [contracts — EventEnvelope](contracts.md#event_businterfacespy) 가 단일 출처. 와이어 포맷은 `json.dumps(evt.to_dict())` UTF-8 bytes, JetStream 헤더 `Nats-Msg-Id = event_id`(중복 발행 dedup, 창 = `STREAM_DUPLICATE_WINDOW_SECONDS` 24h).

스트림 구성(값의 출처는 [contracts/event_bus/subjects.py](contracts.md#event_bussubjectspy)):

| 항목 | 값 |
|---|---|
| 스트림 이름 | `SERVICE_EVENTS` |
| subjects | `STREAM_SUBJECTS` (EventSubject 프리픽스 자동 파생 + `audit.>`) |
| storage | `file` |
| max_age | 7일 |
| max_bytes | 512 MiB |
| duplicate_window | 24h |

## 이벤트 (Events)

### 발행 (Publishes)

| 이벤트 | body | 발행자 | 라우팅 |
|---|---|---|---|
| `dead_letter.created` | `DeadLetterCreatedBody` ([contracts](contracts.md#bodiesplatformpy--플랫폼런타임-소유-이벤트-body)) | `DeadLetterSink.capture` / `capture_raw` | subject 로 직접 publish; correlation = 원 이벤트 correlation(raw 는 합성 ID), causation = 원 event_id |

그 외 모든 이벤트는 이 패키지를 **경유**해 발행될 뿐 소유하지 않음.

### 구독 (Consumes)

직접 구독 없음. `subscribe()` 는 호출자([runtime](runtime.md))에게 pull 구독 객체를 반환할 뿐이다.

## 동작 (Behavior)

### 발행 경로
1. `emit(subject, source, payload, ...)` → `envelope.event()` 로 봉투 생성(correlation 결정 규칙 위 참조).
2. `js.publish(subject, bytes, headers={"Nats-Msg-Id": event_id})` — 동일 event_id 재발행은 JetStream duplicate window 내에서 dedup.
3. `RecordedEventClient` 경유 시 발행 직후 `recorder.record_event(evt)` 로 `events` 테이블에 영속([storage](storage.md)).

### 구독(라우팅) 방식
- **subject 기반 pull consumer**: `pull_subscribe(subject, durable, stream=SERVICE_EVENTS)`. durable 이름 규칙은 [contracts — durable_name](contracts.md#event_bussubscriptionspy).
- 컨슈머 재배달 정책은 `consumer_config()` 고정: `ack_wait`(기본 60s) > 워커 핸들러 타임아웃(30s), `max_deliver`(기본 4) = 워커 재시도 상한+1, `max_ack_pending`(기본 100).

### causation 전파
- 워커 런타임이 이벤트 처리 중 `event_causation(evt.event_id)` 컨텍스트를 열면, 그 안에서 `RecordedEventClient.emit` 이 호출될 때 `causation_id` 미지정 시 `CURRENT_CAUSATION_ID` 값이 자동 주입된다.

## 불변식·오류 (Invariants & Errors)

1. `NATS_ACK_WAIT_SECONDS` 는 워커 핸들러 타임아웃(`WORKER_HANDLER_TIMEOUT_SECONDS`, [runtime](runtime.md))보다 **커야** 처리 중 재배달로 인한 동시 중복 처리가 방지된다(기본 60 > 30).
2. `NATS_MAX_DELIVER` = 워커 재시도 상한 + 1 이어야 소진 후 DLQ 로 종결된다(기본 4 = 3+1).
3. `emit`/`publish_envelope`/`subscribe` 는 `connect()` 이후에만 유효(`assert self.js is not None`; 위반 시 `AssertionError`).
4. `connect()` 는 `retry_dependency` 로 재시도하며 한도 소진 시 `[event-system] nats 연결 실패` `RuntimeError` 로 종료([config](config.md)).
5. `ensure_stream` 의 update 경로는 기존 subjects 를 유실하지 않는다(합집합 후 정렬).
6. 같은 봉투 재발행(relay)은 반드시 `publish_envelope` 로 — 같은 `Nats-Msg-Id` 를 유지해 downstream dedup 을 보장한다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `NATS_URL` | str | `nats://nats:4222` (`Nats.DEFAULT_URL`) | NATS 접속 URL |
| `NATS_ACK_WAIT_SECONDS` | int | `60` | 컨슈머 ack 대기(재배달 창) |
| `NATS_MAX_DELIVER` | int | `4` | 재배달 상한 |
| `NATS_MAX_ACK_PENDING` | int | `100` | 컨슈머당 미확인 in-flight 상한 |
| `NATS_DELIVER_POLICY` | str | `all` | 새 durable consumer의 전달 정책. 과거 이벤트 재실행이 부작용을 만드는 신규 projection은 배포에서 `new` 사용 |
| `SERVICE_NAME` | str | `service` | NATS 연결 이름(`Runtime.SERVICE_NAME_ENV`) |
