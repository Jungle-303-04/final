---
source_commit: e14390882
status: synced
---

# packages/runtime — 서비스 실행 골격(App·워커 루프·정확히-한-번 처리·게이트웨이·발견)

> 소스: `src/packages/runtime/` · 테스트: `tests/test_event_runtime.py`, `tests/test_event_wiring.py`, `tests/test_multi_subscription.py`, `tests/test_api_event_gateway.py`, `tests/test_service_discovery.py`, `tests/test_service_entrypoints.py`, `tests/test_metrics.py`, `tests/test_runtime_dependencies.py`

## 책임 (Responsibility)

- 서비스 하나를 선언·실행하는 **단일 진입점** `App`(FastAPI 의 app 유비), 워커 소비 루프(`WorkerRuntime`), 멱등·재시도·DLQ 를 묶은 `EventProcessor`, outbox relay, HTTP 입구(`ApiEventGateway`), FastAPI DI, 서비스 명부 자동 발견, Prometheus 텍스트 렌더러를 제공한다.
- 이벤트 **정의**(카탈로그)는 [contracts — registry](contracts.md#event_busregistrypy) 소유, 이 패키지는 **구독/실행(런타임)** 담당.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [config](config.md) | `require`/`fail`, 로깅, `env`, `Runtime` 상수 |
| import | `packages.contracts` | [contracts](contracts.md) | 봉투·registry·처리 상태·`Actor`·`Gateway` 필드 |
| import | `packages.events` | [events](events.md) | `NatsEventBus`, `RecordedEventClient`, `DeadLetterSink`, `event_causation`, `event()` |
| import | `packages.storage` | [storage](storage.md) | `Database`, `wait_for_database`, `has_active_connection` |
| 외부 | FastAPI, uvicorn | — | http 서비스 실행 |
| 외부 | psycopg | — | `command_wakeup` 의 Postgres LISTEN 직결 연결 |
| 발행 | `dead_letter.created` (DeadLetterSink 경유) | [events](events.md#이벤트-events) | 재시도 소진/디코드 실패 |

## 공개 인터페이스 (Public API)

### `app.py` — App 선언 API

`__all__ = ["App", "EventContext", "ServiceSpec"]`.

- `src/packages/runtime/app.py :: App`

```python
class App:
    def __init__(self, spec: str | ServiceSpec) -> None
        # 문자열이면 ServiceSpec(name=spec) 으로 승격. self.name = spec.name
    def on(self, body_type: type) -> Callable[..., Any]
        # 타입 구독 데코레이터: body 1종 구독. @app.on_any 와 혼용 불가(TypeError).
        # body_type 은 @event 등록 필수(__subject__ 확인). subject 당 핸들러 1개(중복 시 TypeError).
        # 핸들러 시그니처는 (evt) 또는 (evt, ctx) — 그 외 TypeError.
        # 등록 시 events.note_handler(name, sub) 로 카탈로그 통지.
    def on_any(self, fn: Callable[..., Any]) -> Callable[..., Any]
        # 전체(>) 구독: 모든 이벤트를 EventEnvelope 그대로 받음. 구독은 하나만(기존 on/on_any 있으면 TypeError).
    @property
    def subscriptions(self) -> tuple[Subscription, ...]
    @property
    def raw_subscription(self) -> tuple[Callable[..., Any], bool] | None
    def handler_spec(self) -> EventHandlerSpec
        # 외부 composition root가 동일 subject/factory로 WorkerRuntime을 만들 때 사용
    def run(self, bus: EventConsumerBus | None = None) -> None
        # _resolve() 로 (subjects, handler factory) 구성 후 WorkerService(name, subjects, factory).run()
        # bus 미주입은 NATS 기본, 명시 주입은 해당 adapter 사용
```
내부 `_resolve()`: 전체구독이면 `([">"], raw_factory)`(factory 는 `make_raw_handler`), 타입구독이면 핸들러 존재 확인 후 subject 별 `make_event_handler` 를 `make_router` 로 묶는 factory.

### `controller.py` — OSS 단일 composition root

- `ControllerProfile.from_env()` — in-process bus, agent read-only, direct command off,
  PR-only remediation, production auto-merge off를 기본값으로 읽고 알 수 없는 값은 거부한다.
- `build_composition_plan(root)` — `discover_services` 전수를 controller와 agent 영역에 정확히
  한 번씩 배정한다. `cluster-agent`/`node-collector`만 agent 영역이고 나머지는 controller다.
- `load_service_entrypoint`/`load_worker_apps` — 서비스 로컬 모듈 이름을 격리해 hyphen 경로의
  entrypoint를 import하고 worker `App` 이름/handler를 검증한다.
- `BorrowedEventBus` — root 소유 bus를 child runtime에 위임하되 child `close()`가 shared bus를
  닫지 못하게 한다.
- `ControllerRuntime` — worker 33개, async 4개, HTTP 2개를 동일 event loop에서 기동한다.
  API gateway에는 shared bus와 `MemorySessionStore`를 주입한다. `check_report()`는 DB 연결 없이
  모든 entrypoint와 runner shape를 검증한다.

- 등록 확인 헬퍼(공개 함수):
```python
def ensure_registered(body_type: type) -> Any            # __subject__ 없으면 "미등록 — @event 필요" TypeError
def ensure_handler_signature(fn: Callable[..., Any]) -> bool
    # self 제외 파라미터 1~2개 요구, 2개면 wants_ctx=True
def ensure_unique_handler(handlers: dict[Any, Any], subject: Any) -> None   # 중복 구독자 TypeError
def ensure_has_handler(service: str, handlers: dict[Any, Any]) -> None      # 핸들러 0개면 RuntimeError
```

### `spec.py` — ServiceSpec

- `src/packages/runtime/spec.py :: ServiceKind` — `Literal["worker", "http", "async"]`.
- `src/packages/runtime/spec.py :: DEFAULT_WORKLOAD` — `= "Deployment"`.
- `src/packages/runtime/spec.py :: ServiceSpec` — `@dataclass(frozen=True)`. 서비스 자기선언(명찰) — 이 선언(또는 `App("이름")` 축약형)이 서비스 명부의 단일 출처.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `name` | `str` | (필수) | 서비스 이름. `__post_init__` 에서 공백/빈 문자열이면 `ValueError` |
| `group` | `str` | `""` | `src/services/<group>/<서비스>/` 의 group(미지정 시 경로 유추) |
| `kind` | `ServiceKind` | `"worker"` | worker(NATS 구독) / http / async(자체 루프) |
| `workload` | `str` | `DEFAULT_WORKLOAD` | k8s 배포 형태(Deployment/DaemonSet) |

### `dispatch.py` — 핸들러 실행 기계장치

- `src/packages/runtime/dispatch.py :: EventContext` — `@dataclass(frozen=True)` 제네릭 `EventContext[DbT]`. 핸들러가 받는 꾸러미(흐름 정보 + 도구).

| 필드 | 타입 | 설명 |
|---|---|---|
| `event_id` | `str` | 현재 이벤트 ID |
| `subject` | `str` | subject |
| `correlation_id` | `str` | 흐름 ID |
| `causation_id` | `str \| None` | 부모 이벤트 |
| `db` | `DbT` | `AsyncDb` 로 감싼 Database — `EventContext[RcaStore]` 처럼 [stores Protocol](contracts.md#모듈-storespy) 로 좁혀 받음 |
| `source` | `str` | 원본 이벤트를 발행한 서비스. typed body 핸들러의 envelope 복원에 사용 |
| `created_at` | `str` | 원본 이벤트 생성 시각(ISO 문자열) |

```python
@classmethod
def of(cls, evt: EventEnvelope, db: DbT) -> EventContext[DbT]
```

- 핸들러 팩토리:
```python
def make_event_handler(sub: Subscription, db: Any, source: str) -> Callable[[EventEnvelope], Any]
    # 봉투 → sub.body_type.from_body(evt.payload) 디코드 → ctx = EventContext.of(evt, AsyncDb(db))
    # → sub.fn(body, ctx) 또는 sub.fn(body) → yield/list/단건/None 결과를 EventEnvelope 로 수집
    #   (subject=body.__subject__, correlation=evt.correlation_id, causation=evt.event_id)
def make_router(handlers: dict[str, Callable[[EventEnvelope], Any]]) -> Callable[[EventEnvelope], Any]
    # evt.subject 로 핸들러 선택(없으면 ">" 폴백, 그것도 없으면 RuntimeError "구독 핸들러 없음")
def make_raw_handler(fn: Callable[..., Any], wants_ctx: bool, db: Any, source: str) -> Callable[[EventEnvelope], Any]
    # 디코드 없이 봉투 그대로 콜백 → 동일 수집
```
핸들러 결과 정규화 규칙(내부 `_iter_results`): async generator 는 항목 스트림, await 결과가 `None` 이면 산출 없음, `list` 면 항목별, 그 외 단건. 수집(`_collect`)된 body 는 발행하지 않고 **반환**만 한다(발행은 EventProcessor 가 outbox 로).

### `async_db.py` — sync DB 의 async 래퍼

- `src/packages/runtime/async_db.py :: AsyncDb`

```python
class AsyncDb:
    def __init__(self, db: Any) -> None
    def __getattr__(self, name: str) -> Any
```
속성 접근 시: callable 이 아니거나 이미 coroutine 함수면 그대로 반환. sync callable 은 async 래퍼로 감싸는데, `has_active_connection()`(worker UoW 안, [storage](storage.md)) 이면 **같은 스레드에서 직접 호출**(ContextVar 의 active connection 재사용), 아니면 `asyncio.to_thread`. 워커는 항상 `await ctx.db.x(...)` 한 가지로 호출.

### `service.py` — 실행 러너 3종

- `src/packages/runtime/service.py` 타입 별칭/상수: `AsyncRunner = Callable[[], Coroutine[Any, Any, None]]`, `FastApiFactory = Callable[[], FastAPI]`, `WorkerHandlerFactory = Callable[[EventClient, Database], EventHandler]`, `DEFAULT_HTTP_HOST = "0.0.0.0"`, `DEFAULT_LOG_LEVEL = "info"`, `PORT_ENV = "PORT"`.
- `src/packages/runtime/service.py :: AsyncService` — `@dataclass(frozen=True)`: `service_name: str`, `runner: AsyncRunner`. `run()`: `os.environ.setdefault(SERVICE_NAME, service_name)` → `configure_logging(service_name)` → `asyncio.run(runner())`.
- `src/packages/runtime/service.py :: FastApiService` — `@dataclass(frozen=True)`: `service_name: str`, `app_factory: FastApiFactory`, `host: str = "0.0.0.0"`, `port_env: str = "PORT"`, `default_port: str = Runtime.DEFAULT_HTTP_PORT`, `log_level: str = "info"`. `run()` 은 `AsyncService(service_name, self.serve).run()`; `serve()` 는 uvicorn `Server(Config(app_factory(), host, port=int(env(port_env, default_port)), log_level)).serve()`.
- `src/packages/runtime/service.py :: WorkerService` — `@dataclass(frozen=True)`: `service_name: str`, `subjects: tuple[str, ...]`, `handler_factory: WorkerHandlerFactory`, `durable_name: str | None = None`. `serve()` 는 `EventHandlerSpec` 구성 후 `WorkerRuntime(spec).run()`.

### `worker.py` — 소비 루프·정확히-한-번 처리

env 상수(앵커 `src/packages/runtime/worker.py :: <이름>`): 설정 표 참조. `HEARTBEAT_PATH = env("WORKER_HEARTBEAT_PATH", "/tmp/heartbeat")`.

- `src/packages/runtime/worker.py :: EventRetryPolicy` — `@dataclass(frozen=True)`

| 필드 | 타입 | 기본값(env) |
|---|---|---|
| `max_attempts` | `int` | `WORKER_MAX_ATTEMPTS`=3 |
| `retry_delay_seconds` | `int` | `WORKER_RETRY_DELAY_SECONDS`=2 |
| `fetch_batch_size` | `int` | `WORKER_FETCH_BATCH_SIZE`=1 |
| `fetch_timeout_seconds` | `int` | `WORKER_FETCH_TIMEOUT_SECONDS`=1 |
| `idle_sleep_seconds` | `float` | `WORKER_IDLE_SLEEP_SECONDS`=0.25 |
| `handler_timeout_seconds` | `int` | `WORKER_HANDLER_TIMEOUT_SECONDS`=30 |
| `dead_letter_timeout_seconds` | `int` | `WORKER_DEAD_LETTER_TIMEOUT_SECONDS`=10 |

- `src/packages/runtime/worker.py :: EventHandlerSpec` — `@dataclass(frozen=True)`: `service_name: str`, `subjects: tuple[str, ...]`, `handler_factory: Callable[[EventClient, Database], EventHandler]`, `durable_name: str | None = None`, `retry_policy: EventRetryPolicy = EventRetryPolicy()`.
  - `durable -> str` 프로퍼티 = `durable_name(service_name, durable_name)`.
  - `def durable_for(self, subject: str) -> str` — subject 가 2개 이상이면 `f"{durable}-{slug}"`(slug: `.`→`-`, `>`→`all`, `*`→`any`)로 컨슈머 이름 충돌 방지.
- `src/packages/runtime/worker.py :: Codec` — `Protocol`: `def decode(self, message: EventMessage) -> EventEnvelope`.
- `src/packages/runtime/worker.py :: JsonCodec` — `EventEnvelope.from_mapping(json.loads(message.data.decode()))`.
- `src/packages/runtime/worker.py :: DeadLetterPort` — `Protocol`: `async def capture(evt, consumer, error, attempts) -> EventEnvelope`, `async def capture_raw(raw, consumer, error) -> EventEnvelope`.
- `src/packages/runtime/worker.py :: EventProcessor`

```python
class EventProcessor:
    def __init__(self, service_name: str, handler: EventHandler, store: EventProcessingStore,
                 dead_letters: DeadLetterPort, retry_policy: EventRetryPolicy,
                 codec: Codec | None = None, ledger: Ledger | None = None) -> None
    async def process(self, message: EventMessage) -> None
    async def fail(self, message: EventMessage, evt: EventEnvelope, error: Exception, attempts: int) -> None
```

- `src/packages/runtime/worker.py :: WorkerRuntime`

```python
class WorkerRuntime:
    def __init__(self, spec: EventHandlerSpec, bus: EventConsumerBus | None = None,
                 db: Database | None = None) -> None    # 기본 bus=NatsEventBus(), db=Database()
    async def run(self) -> None
```

### `ledger.py` — 멱등 처리 대장 파사드

- `src/packages/runtime/ledger.py :: Ledger`

```python
class Ledger:
    def __init__(self, store: EventProcessingStore, consumer: str) -> None
    def begin(self, evt: EventEnvelope) -> EventProcessingRecord   # record_event + begin_event_processing
    def finish(self, evt: EventEnvelope) -> None                    # PROCESSED
    def retry(self, evt: EventEnvelope, error: Exception) -> None   # RETRYING + 오류 기록
    def dead_letter(self, evt: EventEnvelope, error: Exception) -> None  # DEAD_LETTERED + 오류 기록
```

### `relay.py` — OutboxRelay

- `src/packages/runtime/relay.py :: DEFAULT_BATCH_ENV` — `"OUTBOX_RELAY_BATCH"`; `DEFAULT_BATCH`(기본 10).
- `src/packages/runtime/relay.py :: DEFAULT_PUBLISH_TIMEOUT_SECONDS_ENV` — `"OUTBOX_PUBLISH_TIMEOUT_SECONDS"`; `DEFAULT_PUBLISH_TIMEOUT_SECONDS`(기본 10).
- `src/packages/runtime/relay.py :: NON_RETRYABLE_PUBLISH_ERRORS` — `{"MaxPayloadError"}`. 같은 payload 로 재시도해도 성공하지 않는 브로커 정책 오류 이름.
- `src/packages/runtime/relay.py :: OutboxRelay`

```python
class OutboxRelay:
    def __init__(self, store: OutboxReader, publisher: EnvelopePublisher, source: str | None,
                 batch: int = DEFAULT_BATCH, publish_timeout_seconds: int = DEFAULT_PUBLISH_TIMEOUT_SECONDS) -> None
    async def run_once(self) -> int
    def _is_non_retryable_publish_error(self, exc: Exception) -> bool
```
`run_once`: `store.unsent_events(batch, source)`(`source`가 있으면 해당 source만, `None`이면 모든 source) → 건별 `asyncio.wait_for(publisher.publish_envelope(evt), timeout)` — 같은 event_id 로 발행해 downstream dedup. transient 발행 오류는 기존처럼 예외를 다시 올리고, `finally` 에서 **이미 발행된 것만** `mark_events_sent`(전체 배치 재발행 방지, 미발행 행은 다음 루프 재시도)한다. 예외 class name 이 `NON_RETRYABLE_PUBLISH_ERRORS`에 있으면 `store.mark_events_dead_lettered([evt], f"outbox-relay:{source or 'all'}", str(exc))`로 DLQ에 격리하고 `outbox_event_dead_lettered` 로그를 남긴 뒤 다음 이벤트 발행을 계속한다. 반환 = 실제 발행 성공 건수(DLQ 격리 건수는 제외).

### `gateway.py` — HTTP → 이벤트 입구

- `src/packages/runtime/gateway.py :: AcceptedEvent` — `@dataclass(frozen=True)`: `event: EventEnvelope`.
```python
def response(self, include_event: bool = False) -> JsonObject
    # {accepted: True, event_id, correlation_id} (+ event)
```
- `src/packages/runtime/gateway.py :: ApiEventGateway` — HTTP/API 입력을 내부 event envelope 로 바꾸는 표준 입구.

```python
class ApiEventGateway:
    def __init__(self, publisher: EventPublisher, recorder: EventRecorder, source: str) -> None
        # self.events = RecordedEventClient(publisher, recorder)
    async def accept(self, subject: str, payload: JsonObject, correlation_id: str | None = None,
                     causation_id: str | None = None, actor: Actor | None = None) -> AcceptedEvent
    async def accept_via_outbox_if_supported(self, subject: str, payload: JsonObject,
                                             correlation_id: str | None, causation_id: str | None) -> AcceptedEvent | None
    async def accept_body(self, body: EventBody, correlation_id: str | None = None,
                          causation_id: str | None = None, actor: Actor | None = None) -> AcceptedEvent
```
- `accept`: payload 복사 후 `actor` 가 있으면 `requested_by`(user_id)·`actor`(to_body()) 를 **비어 있을 때만** 주입 → outbox 경로 시도 → 미지원 시 `RecordedEventClient.emit` 직발행.
- `accept_via_outbox_if_supported`: recorder 가 `unit_of_work`+`stage_events` 를 제공하면 봉투를 만들고 `asyncio.to_thread` 안에서 `unit_of_work()` 트랜잭션으로 `record_event` + `stage_events` (record+outbox 원자 적재; 발행은 relay 몫). 미지원이면 `None`.
- `accept_body`: `body.__subject__` 필수(없으면 TypeError). actor 주입은 body 필드에 `requested_by`/`actor` 키가 **존재하는 경우만**(dataclass 면 `payload_name` 메타 포함 필드 키 집합으로 판정).

### `command_wakeup.py` — command long-poll LISTEN/NOTIFY 보조

명령 전달의 source of truth는 항상 `agent_commands` 테이블이다.
이 모듈은 정확성 경로가 아니라 지연과 유휴 DB 폴링을 줄이기 위한 wakeup 경로다.
리스너가 없거나 끊겨도 agent poll은 기존 timeout 기반으로 계속 동작해야 한다.

| 심볼 | 내용 |
|---|---|
| `AGENT_COMMAND_CHANNEL` | `"agent_command_queued"` — `queue_agent_command`가 `pg_notify`로 쓰는 채널 |
| `COMMAND_NOTIFY_DATABASE_URL_ENV` | `"COMMAND_NOTIFY_DATABASE_URL"` — gateway lifespan이 listener를 시작할 때 읽는 직결 DB URL env |
| `RECONNECT_DELAY_SECONDS` | listener 예외 후 재접속 대기 5초 |
| `wakeup_key(workspace_id, cluster_id)` | payload 문자열 `"<workspace_id>/<cluster_id>"` 생성 |
| `CommandWakeup.wait(workspace_id, cluster_id, timeout)` | 같은 key의 `asyncio.Event`를 등록하고 알림 또는 timeout까지 대기. 알림이 없으면 sleep과 같은 의미 |
| `CommandWakeup.notify_local(payload)` | payload key에 해당하는 모든 waiter를 깨우고 깨운 수를 반환 |
| `CommandWakeup.listening` | property — listener task가 살아 있는지(있고 done 아님) |
| `CommandWakeup.start(notify_url)` | 중복 실행(`listening`)이면 no-op, 아니면 background task로 Postgres `LISTEN agent_command_queued` 시작. listener 예외는 warning 로그 후 `RECONNECT_DELAY_SECONDS` 대기 재접속(fail-open) |
| `CommandWakeup.stop()` | background listener task 취소 |
| `WAKEUP` | gateway/command router가 공유하는 프로세스 전역 인스턴스 |

운영 주의: PgBouncer transaction pooling 연결에서는 `LISTEN`이 안정적으로 동작하지 않으므로 `COMMAND_NOTIFY_DATABASE_URL`은 Postgres 직결 URL을 넣는다.
미설정이면 listener를 시작하지 않고, command router의 `WAKEUP.wait()`는 timeout까지 기다린 뒤 다시 DB lease를 시도한다.

### `dependencies.py` — FastAPI DI

```python
def get_db(request: Request) -> Database          # request.app.state.db
def get_events(request: Request) -> ApiEventGateway  # request.app.state.events
```
gateway 가 `app.state.db/events` 를 세팅하고 도메인 router 는 이 provider 만 의존(클로저 대신 Depends). 앵커: `src/packages/runtime/dependencies.py :: get_db`, `src/packages/runtime/dependencies.py :: get_events`.

### `discovery.py` — 서비스 명부 자동 발견

- 상수: `ENTRYPOINT_FILENAME = "app.py"`, `SERVICES_ROOT = Path("src") / "services"`.
- `src/packages/runtime/discovery.py :: DiscoveredService` — `@dataclass(frozen=True)`

| 필드 | 타입 | 설명 |
|---|---|---|
| `name` | `str` | `App("이름")`/`ServiceSpec(name=...)` 리터럴(없으면 디렉터리명) |
| `group` | `str` | `src/services/<group>/<dirname>/` 의 group |
| `dirname` | `str` | 디렉터리명 |
| `path` | `Path` | 저장소 루트 기준 상대 경로 |
| `kind` | `str` | `worker`(`App(`) / `http`(`FastApiService(`) / `async`(`AsyncService(`) — `\b` 정규식 매칭 |

프로퍼티: `command -> str` = `path.as_posix()`(k8s manifest command 용).

```python
def discover_services(root: Path) -> tuple[DiscoveredService, ...]
    # src/services/*/*/app.py 전수 정적 스캔(import 없음, 부작용 없음).
    # 이름 중복 시 ValueError, 0개면 ValueError, App/FastApiService/AsyncService 선언 미발견 시 ValueError.
def describe_services(services: tuple[DiscoveredService, ...]) -> str   # make services 표
```
이 스캔이 서비스 명부의 단일 출처 — scripts/events.py·테스트·deploy manifest 검증이 이를 읽는다. 서비스 추가 = app.py 생성으로 끝.

### `metrics.py` — Prometheus 텍스트 렌더

```python
def render_prometheus_metrics(metrics: Mapping[str, float | int]) -> str
    # 이름 정렬, 항목마다 "# TYPE <name> gauge" + "<name> <value>", 끝 개행
def render_labeled_counter(name: str, values: Mapping[str, int], label: str) -> str
    # "# TYPE <name> gauge" + '<name>{<label>="<key>"} <value>' (key 는 \ 와 " 이스케이프)
```
앵커: `src/packages/runtime/metrics.py :: render_prometheus_metrics`, `src/packages/runtime/metrics.py :: render_labeled_counter`.

### `outbound.py` — outbound 게이트웨이 정형

패턴: `*.requested → 외부 호출 → *.delivered(성공) / *.failed(실패)`.

- `src/packages/runtime/outbound.py :: deliver`
```python
async def deliver(call: Callable[[], Awaitable[Any]], ok: Callable[[Any], Any],
                  fail: Callable[[Exception], Any]) -> AsyncIterator[Any]
```
외부 호출 1회 — 성공 시 `ok(결과)` body 1건, 예외 시 `fail(예외)` body 1건을 yield(try/except 를 한 곳에 모아 게이트웨이 핸들러는 선언만).
- `src/packages/runtime/outbound.py :: Outbound` — `Protocol`: `async def post(self, path: str, body: dict[str, Any]) -> int` (테스트는 테스트용 대역으로 교체).
- `src/packages/runtime/outbound.py :: HttpOutbound` — stdlib `urllib` 기반 기본 어댑터.
  - 클래스 상수: `BASE_URL_ENV = "OUTBOUND_CALLBACK_BASE_URL"`, `DEFAULT_BASE_URL = "http://api-gateway:8000"`, `TIMEOUT_SECONDS_ENV = "OUTBOUND_HTTP_TIMEOUT_SECONDS"`, `TIMEOUT_SECONDS = int(env(..., "5"))`.
  - `__init__(base_url: str | None = None)` — 인자 우선, 없으면 env.
  - `async def post(path, body) -> int` — `base_url + path` 로 JSON POST(`asyncio.to_thread`), 응답 status 반환.

`src/packages/runtime/__init__.py` 는 빈 모듈.

## 이벤트 (Events)

- 발행: 핸들러가 yield 한 임의 body(subject = `body.__subject__`) — 단 EventProcessor 가 **outbox 적재** 후 relay 가 발행. 실패 소진 시 `dead_letter.created`(`DeadLetterSink` 경유, [events](events.md)).
- 구독: `App.on(BodyType)` 별 subject, 또는 `App.on_any` 의 `>` 전체 구독. durable 이름은 `EventHandlerSpec.durable_for` 규칙.

## 동작 (Behavior)

### 워커 부팅 (`WorkerRuntime.run`)
1. `Path(HEARTBEAT_PATH).touch()` — 시작 즉시 생존 표시(DB 대기 중 liveness 오살 방지).
2. `wait_for_database(db)` → `bus.connect()`.
3. subject 마다 **별도 pull 컨슈머** 생성(`durable_for(subject)`) — 한 줄이 막혀도 다른 subject 는 계속 흐름.
4. `RecordedEventClient(bus, db)` 로 handler factory 호출 → `EventProcessor` + `OutboxRelay` 구성.
5. SIGTERM/SIGINT 를 `stopping` Event 로 연결, "subscribed" 로그.
6. 루프(종료 신호까지): heartbeat touch → `relay.run_once()`(예외는 warning 후 계속) → 각 구독 `fetch(batch, timeout)`(TimeoutError 는 continue, 기타 예외는 warning + 1s sleep) → 메시지별 `processor.process()`(processor 자체 예외는 error 로그 + nak) → 전부 유휴면 `idle_sleep_seconds` sleep.
7. 종료: `bus.close()` → `db.dispose_async()`/`db.dispose()`(존재 시).

### 메시지 처리 (`EventProcessor.process`) — 정확히-한-번의 핵심
1. **디코드**: 실패 시 `capture_raw`(타임아웃 `dead_letter_timeout_seconds`; capture 실패도 로그 후 진행) → `ack`(poison 메시지 종결).
2. **claim 선커밋**: `store.unit_of_work()` 별도 트랜잭션으로 `ledger.begin(evt)`(record_event + 원자 claim, attempt 증가). attempt 증가가 핸들러 실패에 롤백되면 재시도 미누적으로 영구 DLQ 미도달 위험 → claim 과 업무 분리.
3. 상태 분기: `TERMINAL_STATUSES`(PROCESSED/DEAD_LETTERED) → `ack`(중복 소거); `PROCESSING` 아님(= `CLAIM_BLOCKED`/`unknown`) → `nak(retry_delay)`(다른 인스턴스 처리 중, ack 시 유실 위험).
4. **업무 트랜잭션**: `unit_of_work()` 안에서 `event_causation(evt.event_id)` 컨텍스트로 `asyncio.wait_for(handler(evt), handler_timeout_seconds)` 실행 → 반환된 다음 이벤트들을 `stage_events(conn, ...)` 로 outbox 적재 → `ledger.finish(evt)`. with 종료 = 업무+outbox+완료 기록이 한 커밋. 성공 시 `ack`.
5. 예외 시 `fail(message, evt, exc, attempts)`.

### 실패 처리 (`EventProcessor.fail`)
- `attempts >= max_attempts`: `dead_letters.capture`(타임아웃 부여) 를 **먼저**, 성공하면 `ledger.dead_letter` + `ack`. capture 실패 시 `ledger.retry` + `nak`(다음 재배달에서 재시도). 순서 근거: 둘 사이 크래시가 '유실'이 아니라 '재처리(최악 중복 DLQ)'가 되도록.
- 미만: `ledger.retry` + `nak(retry_delay_seconds)`.

### HTTP 입구 흐름 (`ApiEventGateway`)
요청 → (actor 주입) → recorder 가 outbox 지원이면 record+stage 를 한 트랜잭션으로 적재(발행은 워커/relay), 미지원이면 즉시 emit. 반환 `AcceptedEvent.response()` 가 표준 202 응답 형태.

## 불변식·오류 (Invariants & Errors)

1. `@app.on` / `@app.on_any` 혼용 금지, `on_any` 는 단독, subject 당 핸들러 1개, 핸들러 파라미터는 1~2개 — 위반 시 `TypeError`(`[event-system]` 프리픽스). `run()` 시 핸들러 0개면 `RuntimeError`.
2. `@app.on` 대상 body 는 반드시 `@event(SUBJECT)` 로 등록돼 있어야 한다(`__subject__` 부착).
3. `WORKER_HANDLER_TIMEOUT_SECONDS` 를 올리면 `NATS_ACK_WAIT_SECONDS`([events](events.md))도 그보다 크게 올려야 처리 중 재배달 중복이 방지된다.
4. 핸들러 실행·outbox 적재·ledger 완료는 **한 트랜잭션** — 부분 쓰기 없음(타임아웃 취소도 롤백).
5. 핸들러는 이벤트를 직접 발행하지 않는다 — yield 한 body 는 outbox 를 거쳐 relay 가 발행.
6. relay 는 발행된 event_id 만 sent 처리 — 배치 중간 실패 시 미발행 행은 유지된다.
7. `discover_services` 는 이름 중복·미발견·러너 선언 부재를 모두 `ValueError` 로 fail-fast.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `WORKER_MAX_ATTEMPTS` | int | `3` | 핸들러 재시도 상한(소진 시 DLQ) |
| `WORKER_RETRY_DELAY_SECONDS` | int | `2` | nak 재확인 지연 |
| `WORKER_FETCH_BATCH_SIZE` | int | `1` | 루프당 subject 별 fetch 개수 |
| `WORKER_FETCH_TIMEOUT_SECONDS` | int | `1` | fetch 대기 한도 |
| `WORKER_IDLE_SLEEP_SECONDS` | float | `0.25` | 유휴 sleep |
| `WORKER_HANDLER_TIMEOUT_SECONDS` | int | `30` | 핸들러 hang 상한 |
| `WORKER_DEAD_LETTER_TIMEOUT_SECONDS` | int | `10` | DLQ 기록 대기 한도 |
| `WORKER_HEARTBEAT_PATH` | str | `/tmp/heartbeat` | liveness 하트비트 파일 경로(mtime 신선도 검사) |
| `OUTBOX_RELAY_BATCH` | int | `10` | relay 1회 발행 행 수 |
| `OUTBOX_PUBLISH_TIMEOUT_SECONDS` | int | `10` | 건당 발행 대기 한도 |
| `OUTBOUND_CALLBACK_BASE_URL` | str | `http://api-gateway:8000` | HttpOutbound 기본 base URL |
| `OUTBOUND_HTTP_TIMEOUT_SECONDS` | int | `5` | outbound POST 타임아웃 |
| `COMMAND_NOTIFY_DATABASE_URL` | str | 미설정 | 설정 시 api-gateway가 command long-poll wakeup용 Postgres LISTEN 연결을 연다. 미설정이면 기존 주기 폴링만 사용 |
| `PORT` | int | `8000` (`Runtime.DEFAULT_HTTP_PORT`) | FastApiService 포트 |
| `SERVICE_NAME` | str | 서비스 이름으로 setdefault | 프로세스 정체성 |
