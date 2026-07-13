---
source_commit: a182597d
status: synced
---

# packages/storage — PostgreSQL 엔진·코어 테이블·코어 리포지토리·Redis 세션

> 소스: `src/packages/storage/` · 테스트: `tests/test_database_unit.py`, `tests/test_outbox.py`, `tests/test_storage_retention.py`, `tests/test_dlq_reliability.py`, `tests/test_session_store.py`, `tests/test_schemas.py`

## 책임 (Responsibility)

- SQLAlchemy 선언 베이스·공용 컬럼 헬퍼(`base.py`), 엔진/트랜잭션/호환 마이그레이션(`engine.py :: DatabaseConnection`), 코어 테이블(`schema.py`: events/event_processing/event_dead_letters/outbox), 코어 리포지토리(`repositories/`: event/dead_letter/outbox), retention sweep helper(`retention.py`), Redis 세션 스토어(`sessions.py`)를 제공한다.
- **도메인 테이블/리포지토리는 소유하지 않는다** — `domains/registry.py` 가 자동 발견해 `Database` 클래스로 합성한다(아래 "도메인 자동발견" 절).
- 스키마 관리: 배포 전 단일 schema-bootstrap Job이 `create_all` + 호환 DDL(`ensure_compatible_schema`)을 실행한다. API/워커는 `DATABASE_STARTUP_MODE=verify`에서 현재 metadata의 table/column 존재만 읽기 전용으로 검증한다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [config](config.md) | `env`/`required_env`, `CommandStatus`, `retry_dependency` |
| import | `packages.contracts` | [contracts](contracts.md) | `EventEnvelope`, `JsonObject`, 처리 상태, identity 상수(호환 마이그레이션 SQL) |
| import(런타임) | `domains.registry` | [domains](../domains/rca.md) | `database.py` 가 합성된 `Database` 재노출, `engine.init()` 이 `load_domain_tables()` 호출 |
| 외부 | PostgreSQL(psycopg, PgBouncer 경유), Redis(`redis.asyncio`) | — | 저장소 |

주의: `packages.storage.database` → `domains.registry` import 는 하위호환 재노출을 위한 것으로, 이 지점이 packages→domains 방향 참조의 유일한 예외 지점이다.

## 공개 인터페이스 (Public API)

### `base.py` — 선언 베이스(순환참조 없는 단일 출처)

도메인 테이블(`domains/<d>/models.py`)과 코어 테이블(`schema.py`)이 같은 `Base`·`metadata` 를 공유하도록 여기서 정의(둘 다 이 모듈만 의존).

- `src/packages/storage/base.py :: Base` — `class Base(DeclarativeBase)`.
- `src/packages/storage/base.py :: metadata` — `= Base.metadata`.
- 컬럼 헬퍼:
```python
def text_column() -> Mapped[str]              # Text, nullable=False
def jsonb_column() -> Mapped[dict[str, Any]]  # JSONB, nullable=False
def created_at_column() -> Mapped[Any]        # TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
def updated_at_column() -> Mapped[Any]        # TIMESTAMP(timezone=True), nullable=False, server_default=func.now()
```

### `schema.py` — 코어 테이블 ORM 모델

- `src/packages/storage/schema.py :: EventModel` / `EventProcessing` / `EventDeadLetter` / `OutboxModel` (아래 데이터 모델 절).
- `src/packages/storage/schema.py :: metadata` — `= Base.metadata` 재노출.

### `engine.py` — 엔진·트랜잭션·호환 스키마

상수(앵커 `src/packages/storage/engine.py :: <이름>`):

| 상수 | 값 | 의미 |
|---|---|---|
| `DATABASE_URL_ENV` | `"DATABASE_URL"` | DB URL env(필수) |
| `ERROR_MESSAGE_LIMIT` | `2000` | 오류 메시지 저장 길이 상한 |
| `DB_LOCK_TIMEOUT_MS_ENV` … `DB_SCHEMA_INIT_STATEMENT_TIMEOUT_MS_ENV` | 아래 설정 표 | 트랜잭션/스키마 초기화 타임아웃 env |
| `DB_LOCK_TIMEOUT` / `DB_STATEMENT_TIMEOUT` / `DB_IDLE_IN_TRANSACTION_TIMEOUT` | env 값 ms 문자열(기본 `5000ms`/`30000ms`/`30000ms`) | `set local` 에 쓰는 값 |
| `DB_SCHEMA_INIT_LOCK_TIMEOUT` / `DB_SCHEMA_INIT_STATEMENT_TIMEOUT` | 기본 `60000ms`/`120000ms` | 스키마 초기화용 |
| `SCHEMA_INIT_LOCK_NAMESPACE` / `SCHEMA_INIT_LOCK_KEY` | `774897281` / `20260703` | `pg_advisory_xact_lock` 식별자 — 전 프로세스 공유 필수라 env 오버라이드 없는 고정값 |
| `DEAD_LETTER_STATUS_OPEN` / `DEAD_LETTER_STATUS_REPLAYED` / `DEAD_LETTER_STATUS_ARCHIVED` | `"open"` / `"replayed"` / `"archived"` | DLQ 상태 어휘 |
| `RAW_DEAD_LETTER_SUBJECT` | `"__decode_failed__"` | 디코드 실패 DLQ subject |
| `UNKNOWN_AGENT_ID` | `"unknown-agent"` | agent 미상 표기 |
| `POOL_OPTIONS` | `{pool_size, max_overflow, pool_timeout, pool_pre_ping: True, pool_recycle: 300}` | env 기반 풀 옵션(설정 표 참조) |

호환 마이그레이션 SQL 상수(모두 모듈 레벨 문자열/dict, `_apply_compatible_schema` 가 실행): `AGENT_COMMAND_COMPAT_COLUMNS`(lease_id/agent_id/leased_until/started_at/completed_at 추가), `EVENT_COMPAT_COLUMNS`(causation_id, schema_version default 1), `OUTBOX_COMPAT_COLUMNS`(lease_id/leased_until/schema_version), `OUTBOX_CLAIM_INDEX`(`ix_outbox_claim (source, sent_at, leased_until, id)`), `OUTBOX_CLAIM_ALL_SOURCES_INDEX`(`ix_outbox_claim_all_sources (sent_at, leased_until, id) WHERE sent_at IS NULL`), `USER_ACCOUNT_COMPAT_COLUMNS`(email/password_hash/role) + `USER_ACCOUNT_ROLE_BACKFILL`(created_at 순 1번째 사용자 = service_admin, 나머지 user) + `USER_ACCOUNT_ROLE_DEFAULT`(기본 user) + `USER_ACCOUNT_ROLE_NOT_NULL` + `USER_ACCOUNT_EMAIL_INDEX`(부분 unique), `WORKSPACE_COMPAT_COLUMNS`(agent_commands/evidence/rca_reports 의 workspace_id, cluster_registrations 의 agent_token_hash — 후자는 backfill 없음, NULL=미인증), `WORKSPACE_BACKFILL_COLUMNS`(agent_commands/evidence/rca_reports 를 `default` 로 backfill 후 default+not null), `CLUSTER_AGENT_TOKEN_HASH_INDEX`(부분 index), `OPERATIONAL_INDEXES`(`ix_agent_commands_available` 부분 index[queued/leased/running], `ix_event_processing_status`, `ix_event_dead_letters_open` 부분 index, `ix_events_correlation_created`), `REPO_CHANGE_COMPAT_COLUMNS`(workspace_id/repository_id/watch_target_id/binding_id/manifest_path + workspace backfill/default/not null), `MANIFEST_ARTIFACT_COMPAT_COLUMNS`(workspace_id + backfill) + `MANIFEST_ARTIFACT_DROP_LEGACY_UNIQUE`(구 (binding_id, commit_sha, manifest_path) unique 제약 탐지·삭제) + `MANIFEST_ARTIFACT_WORKSPACE_UNIQUE`(`ux_manifest_artifacts_workspace_binding_commit_path`), `ROLE_PERMISSION_COMPAT_COLUMNS`(organization_id) + `ROLE_PERMISSION_SCOPE_BACKFILL/DEFAULT/NOT_NULL`(`__global__`) + `ROLE_PERMISSION_DROP_LEGACY_UNIQUE` + `ROLE_PERMISSION_SCOPED_UNIQUE`(`ux_role_permissions_organization_resource_role_permission`), `MEMBER_RESOURCE_ROLE_MIGRATE_LEGACY_ROLES`(owner/admin→cluster_steward, maintainer→incident_operator, deployer/developer→release_operator, viewer→observer), `ROLE_PERMISSION_DELETE_LEGACY_ALIAS_DUPLICATES`(별칭 이관 시 중복 행 제거), `ROLE_PERMISSION_MIGRATE_LEGACY_ALIASES`(역할 별칭 + 권한 별칭 read→cluster.read, write→config.update, deploy→deploy.run, admin→cluster.role.manage).

함수:
```python
def connect_args_for(sqlalchemy_url: str) -> dict[str, object]
    # postgresql+psycopg 이면 {"prepare_threshold": None} — PgBouncer transaction pooling 에서
    # prepared statement 파손 방지. 타 드라이버는 빈 dict(모르는 인자 거부 방지).
def compact_error(error: str) -> str                     # ERROR_MESSAGE_LIMIT 절단
def iso_or_none(value: object) -> str | None             # isoformat 가능하면 ISO, 아니면 None
def serialize_dead_letter(row: JsonObject) -> JsonObject # created_at/replayed_at ISO 변환한 복사본
def serialize_command(row: JsonObject) -> JsonObject     # leased_until ISO 변환한 복사본
def row_dict(row: Any) -> JsonObject                     # dict(row)
def has_active_connection() -> bool                      # ContextVar _ACTIVE_CONN 활성 여부
def unit_of_work_or_null(db: Any) -> AbstractContextManager[Any]
    # db.unit_of_work 가 callable 이면 그 트랜잭션, 아니면 nullcontext() —
    # 라우터가 여러 저장소 쓰기+outbox 스테이징을 한 트랜잭션으로 묶는 용도
    # (asyncio.to_thread 는 ContextVar 를 복사하므로 안쪽 호출이 합류함)
def configure_transaction(conn: Connection) -> None      # set local lock/statement/idle_in_transaction 타임아웃
def acquire_schema_init_lock(conn: Connection) -> None   # 초기화용 타임아웃 + pg_advisory_xact_lock(namespace, key)
async def configure_async_transaction(conn: Any) -> None # async 판 configure_transaction
```

- `src/packages/storage/engine.py :: DatabaseConnection` — 엔진·트랜잭션·스키마 초기화의 베이스 클래스(모든 리포지토리가 상속).

```python
class DatabaseConnection:
    def __init__(self) -> None
        # url = required_env("DATABASE_URL");
        # engine = create_engine(sqlalchemy_url, connect_args, **POOL_OPTIONS)
        # async_engine = create_async_engine(동일)
    @property
    def sqlalchemy_url(self) -> str        # "postgresql://" → "postgresql+psycopg://" 1회 치환
    @contextmanager
    def connection(self)                   # 활성 UoW 있으면 그 커넥션에 합류(commit 은 UoW 소유),
                                           # 없으면 engine.begin() + configure_transaction
    @contextmanager
    def unit_of_work(self)                 # 한 트랜잭션. 이미 활성 UoW 안이면 새로 열지 않고 합류
                                           # (중첩이 바깥보다 먼저 커밋되는 원자성 파괴 방지).
                                           # _ACTIVE_CONN ContextVar 에 커넥션 set/reset
    @asynccontextmanager
    async def async_connection(self)       # async_engine.begin() + configure_async_transaction
    def check_ready(self) -> None          # SELECT 1 (readiness 프로브, DDL 안 함)
    def verify_schema(self) -> None         # metadata table/column 존재를 information_schema로 읽기 검증
    def init(self) -> None                 # 아래 동작 절 참조(스키마 초기화)
    def ensure_compatible_schema(self, existing_conn: Connection | None = None) -> None
    def dispose(self) -> None              # engine.dispose()
    async def dispose_async(self) -> None  # async_engine.dispose()
```
(내부: `_apply_compatible_schema`, `_add_missing_columns`, `_execute_schema_ddl`, `_existing_columns` — information_schema 로 기존 컬럼 조회 후 없는 것만 DDL.)

### `repositories/event.py` — 이벤트 기록·멱등 처리 대장

- `src/packages/storage/repositories/event.py :: PROCESSING_STALE_SECONDS` — `= 90`. PROCESSING claim 신선도 창 — 이 시간 안의 PROCESSING 은 다른 인스턴스가 실제 처리 중으로 간주해 재클레임 거절(ack_wait 60s 뒤 재배달이 와도 원 claim 이 창을 넘길 때까지 획득 불가).
- `src/packages/storage/repositories/event.py :: EventRepository` — `DatabaseConnection` 상속.

```python
def record_event(self, evt: EventEnvelope) -> None
    # events 에 INSERT ... ON CONFLICT (event_id) DO NOTHING (멱등)
def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> EventProcessingRecord
    # claim 성공 → (status, attempts) / 실패 시 기존 행 조회:
    #   기존이 신선한 PROCESSING 이면 status=CLAIM_BLOCKED 로 치환, 행 없으면 ("unknown", 0)
def claim_event_processing(self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str) -> JsonObject | None
    # 단일 원자 UPSERT: INSERT (status=PROCESSING, attempts=1) ON CONFLICT (event_id, consumer)
    # DO UPDATE attempts+1, status=PROCESSING, last_error=NULL, updated_at=now()
    # WHERE status NOT IN TERMINAL_STATUSES AND (status != PROCESSING OR updated_at < now()-90s)
    # RETURNING status, attempts — 신선한 PROCESSING 이면 행 미반환(동시 중복 차단)
def get_event_processing(self, conn: Connection, table: Any, evt: EventEnvelope, consumer: str) -> JsonObject | None
def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None   # status=PROCESSED, last_error=NULL
def fail_event_processing(self, evt: EventEnvelope, consumer: str, error: str, status: str) -> None
    # status(RETRYING/DEAD_LETTERED), last_error=compact_error(error)
def event_processing_status_counts(self) -> dict[str, int]                     # status 별 count(메트릭용)
def delete_events_older_than(self, cutoff: datetime, *, limit: int = 1000) -> int
    # created_at < cutoff 인 events row 를 CTE로 limit 개 삭제하고 삭제 수 반환(retention)
```

### `repositories/dead_letter.py` — DLQ

- `src/packages/storage/repositories/dead_letter.py :: DeadLetterRepository` — `DatabaseConnection` 상속.

```python
def record_dead_letter(self, evt: EventEnvelope, consumer: str, error: str, attempts: int) -> JsonObject
    # event_dead_letters INSERT(status=open) RETURNING id, created_at —
    # 반환 dict 키: dead_letter_id, original_event_id, original_subject, consumer,
    # correlation_id, attempts, error(절단), created_at(ISO), status
def record_raw_dead_letter(self, raw: bytes, consumer: str, error: str) -> JsonObject
    # original_event_id = f"decode-failure:{uuid4()}", subject=__decode_failed__,
    # correlation_id=original_event_id, attempts=1, payload={"raw": raw.decode(errors="replace")}
    # 반환 dict 는 위 + payload
def list_dead_letters(self, limit: int) -> list[JsonObject]        # created_at desc, serialize_dead_letter
def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None
def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> bool
    # 원자 UPDATE: id 일치 AND status=open 만 → status=replayed, replayed_at=now(), replay_event_id
    # 첫 요청만 True(진 요청은 False → 409 처리). 검사+갱신이 한 문장이라 동시 replay 의 이중 재발행 차단
def open_dead_letter_count(self) -> int                            # status=open count(메트릭용)
```

### `repositories/outbox.py` — 트랜잭셔널 아웃박스

- `src/packages/storage/repositories/outbox.py :: DEFAULT_OUTBOX_LEASE_SECONDS` — `= 60`.
- `src/packages/storage/repositories/outbox.py :: OutboxRepository` — `DatabaseConnection` 상속.

```python
def stage_events(self, conn: Connection, events: list[EventEnvelope]) -> None
    # UoW 트랜잭션의 conn 으로 outbox INSERT ... ON CONFLICT (event_id) DO NOTHING
    # (occurred_at=evt.created_at, lease_id/leased_until=NULL)
async def unsent_events(self, limit: int, source: str | None) -> list[EventEnvelope]
    # lease claim: sent_at IS NULL AND (source=:source if source is not None)
    # AND (lease_id IS NULL OR leased_until < now())
    # 를 id 순 limit CTE + FOR UPDATE SKIP LOCKED 로 선점 →
    # UPDATE lease_id=uuid4, leased_until=now+60s RETURNING * → EventEnvelope 복원
async def mark_events_sent(self, event_ids: list[str]) -> None
    # sent_at=now(), lease 해제(lease_id/leased_until NULL)
async def mark_events_dead_lettered(self, events: list[EventEnvelope], consumer: str, error: str) -> None
    # 비재시도 outbox 이벤트를 event_dead_letters(status=open, attempts=1)에 남기고
    # 해당 outbox 행을 sent_at=now(), lease 해제로 표시해 relay 대상에서 제거
def outbox_pending_count(self) -> int    # sent_at IS NULL count(메트릭용)
def delete_sent_outbox_older_than(self, cutoff: datetime, *, limit: int = 1000) -> int
    # sent_at IS NOT NULL AND sent_at < cutoff 인 발행 완료 row 를 CTE로 limit 개 삭제(retention)
```

### `retention.py` — 코어 대형 payload 테이블 보존 정책

상수(앵커 `src/packages/storage/retention.py :: <이름>`):

| 상수 | 기본값 | 의미 |
|---|---|---|
| `OUTBOX_SENT_RETENTION_HOURS_ENV` | `OUTBOX_SENT_RETENTION_HOURS` | sent outbox 보존 시간 env |
| `EVENT_RETENTION_DAYS_ENV` | `EVENT_RETENTION_DAYS` | events 보존 일수 env |
| `AUDIT_LOG_RETENTION_DAYS_ENV` | `AUDIT_LOG_RETENTION_DAYS` | audit_log 보존 일수 env |
| `DB_RETENTION_DELETE_LIMIT_ENV` | `DB_RETENTION_DELETE_LIMIT` | 테이블별 delete batch 상한 env |
| `DEFAULT_OUTBOX_SENT_RETENTION_HOURS` | `"24"` | sent outbox 기본 보존 시간 |
| `DEFAULT_EVENT_RETENTION_DAYS` | `"7"` | events 기본 보존 일수 |
| `DEFAULT_AUDIT_LOG_RETENTION_DAYS` | `"7"` | audit_log 기본 보존 일수 |
| `DEFAULT_DB_RETENTION_DELETE_LIMIT` | `"1000"` | 기본 delete batch 상한 |

```python
@dataclass(frozen=True)
class RetentionSweepResult:
    outbox_sent: int = 0
    events: int = 0
    audit_log: int = 0
    @property
    def total(self) -> int

async def sweep_storage_retention(db: Any, *, now: datetime | None = None) -> RetentionSweepResult
    # env 기준 cutoff 산출 후 delete_sent_outbox_older_than,
    # delete_events_older_than, delete_audit_logs_older_than 을 각 1 batch 호출
```

### `sessions.py` — 세션·레이트리밋·이메일 인증 토큰

- `src/packages/storage/sessions.py :: AuthSession` — `@dataclass(frozen=True)`: `token: str`, `user_id: str`, `roles: list[str]`, `workspace_id: str`.
- `src/packages/storage/sessions.py :: RedisSessionStoreConfig` — `@dataclass(frozen=True)`:

| 필드 | 타입 | 설명 |
|---|---|---|
| `url` | `str` | Redis URL |
| `ttl_seconds` | `int` | 세션 TTL |
| `key_prefix` | `str` | 세션 키 프리픽스 |
| `token_bytes` | `int` | 세션 토큰 바이트 수(`secrets.token_urlsafe`) |
| `default_roles` | `tuple[str, ...]` | roles 미지정 시 기본 |
| `default_workspace_id` | `str` | workspace 미지정 시 기본 |
| `rate_limit_key_prefix` | `str` | 레이트리밋 키 프리픽스 |
| `rate_limit` | `int` | 기본 한도 |
| `rate_limit_window_seconds` | `int` | 기본 창 |
| `email_verification_key_prefix` | `str` | 인증 토큰 키 프리픽스 |
| `email_verification_ttl_seconds` | `int` | 인증 토큰 TTL |
| `email_verification_token_bytes` | `int` | 인증 토큰 바이트 수 |

- `src/packages/storage/sessions.py :: RateLimitExceeded` — `Exception`: `__init__(retry_after_seconds: int | None = None)`, 속성 `retry_after_seconds`.
- `src/packages/storage/sessions.py :: RedisSessionStoreNotConnected` — `RuntimeError`.
- `src/packages/storage/sessions.py :: SessionStore` — gateway가 소비하는 async Protocol.
- `src/packages/storage/sessions.py :: MemorySessionStore` — OSS 단일 controller용 process-local
  구현. Redis 구현과 같은 session/touch/delete, rate limit, escalating lock, 1회성 이메일
  token 계약을 제공하지만 restart 시 상태가 사라지고 다중 replica 간 공유되지 않는다.
- `src/packages/storage/sessions.py :: RedisSessionStore` — [contracts — SessionStore](contracts.md#모듈-interfacespy) 구현.

```python
class RedisSessionStore:
    def __init__(self, config: RedisSessionStoreConfig) -> None
    async def connect(self) -> None
        # AsyncRedis.from_url(decode_responses=True, socket_timeout=5, socket_connect_timeout=5,
        #   socket_keepalive=True, health_check_interval=30, retry_on_timeout=True) + ping()
        # 타임아웃/헬스체크 없으면 half-open 연결에서 명령 무한 대기(과거 로그인 hang 원인)
    async def close(self) -> None
    async def create_session(self, user_id: str, roles: list[str] | None = None,
                             workspace_id: str | None = None) -> AuthSession
        # token=token_urlsafe(token_bytes); setex("{key_prefix}:{token}", ttl, json{user_id, roles, workspace_id})
    async def get_session(self, token: str | None) -> AuthSession | None
    async def delete_session(self, token: str) -> None
    async def check_rate_limit(self, key: str, limit: int | None = None, window_seconds: int | None = None) -> None
        # INCR "{rl_prefix}:{key}"; 첫 증가 시 expire(window); count > threshold → RateLimitExceeded
    async def check_escalating_rate_limit(self, key: str, limit: int, window_seconds: int,
                                          lock_steps_seconds: tuple[int, ...], strike_ttl_seconds: int) -> None
        # lock:{key} TTL>0 이면 즉시 RateLimitExceeded(retry_after)
        # count:{key} INCR(첫 증가 시 expire) ≤ limit 이면 통과
        # 초과 시 strike:{key} INCR(첫 증가 시 strike_ttl) →
        # lock_seconds = lock_steps_seconds[min(strike_count, len(steps)) - 1] 로 잠금 setex 후 예외
    async def create_email_verification_token(self, user_id: str, email: str) -> str
        # setex("{ev_prefix}:{token}", ttl, json{user_id, email})
    async def consume_email_verification_token(self, token: str | None) -> dict[str, str] | None
        # GETDEL(1회성 소비) 후 {"user_id", "email"} 반환
```

### `database.py` — 공개 진입점(하위호환)

```python
from domains.registry import Database as Database   # 합성된 Database 재노출
async def wait_for_database(db: InitializableStore) -> None
    # DATABASE_STARTUP_MODE=verify면 db.verify_schema(), initialize면 db.init()
    # 동기 DB 시작 작업은 asyncio.to_thread에서 실행하고 retry_dependency로 대기
```
운영 계열(`APP_ENV=production|staging`)의 기본 모드는 `verify`, 그 외 하위 호환 기본은 `initialize`다. management 배포 스크립트는 환경과 무관하게 `verify`를 명시한다. `__all__` 로 `DATABASE_STARTUP_MODE_ENV`, `ERROR_MESSAGE_LIMIT`, `Database`, `compact_error`, `iso_or_none`, `row_dict`, `serialize_command`, `serialize_dead_letter`, `wait_for_database` 를 재노출한다. 앵커: `src/packages/storage/database.py :: wait_for_database`.

`src/packages/storage/__init__.py` 는 빈 모듈. `repositories/__init__.py` 는 docstring 만("도메인별 repository — 같은 도메인 SQL 을 한 파일에 모음").

## 데이터 모델 (Data Model)

### `events` — `src/packages/storage/schema.py :: EventModel`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `event_id` | Text | PK | 이벤트 ID |
| `subject` | Text | not null | subject |
| `source` | Text | not null | 발행 서비스 |
| `correlation_id` | Text | not null | 흐름 ID |
| `causation_id` | Text | null 허용 | 부모 이벤트 ID |
| `payload` | JSONB | not null | 본문 |
| `schema_version` | Integer | not null, server_default `'1'` | 봉투 버전 |
| `created_at` | TIMESTAMPTZ | not null, default now() | 생성 시각 |

호환 인덱스: `ix_events_correlation_created (correlation_id, created_at)` (OPERATIONAL_INDEXES).

### `event_processing` — `src/packages/storage/schema.py :: EventProcessing`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `event_id` | Text | PK(복합), not null | 이벤트 ID |
| `consumer` | Text | PK(복합), not null | 소비자(서비스) |
| `subject` | Text | not null | subject |
| `correlation_id` | Text | not null | 흐름 ID |
| `status` | Text | not null | `EventProcessingStatus` 값 |
| `attempts` | Integer | not null | 누적 시도 |
| `last_error` | Text | null 허용 | 마지막 오류 |
| `created_at` / `updated_at` | TIMESTAMPTZ | not null, default now() | 시각 |

PK: `PrimaryKeyConstraint("event_id", "consumer")`. 호환 인덱스: `ix_event_processing_status (status)`.

### `event_dead_letters` — `src/packages/storage/schema.py :: EventDeadLetter`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BigInteger | PK, autoincrement | DLQ ID |
| `original_event_id` | Text | not null | 원 이벤트 ID |
| `original_subject` | Text | not null | 원 subject(디코드 실패는 `__decode_failed__`) |
| `consumer` | Text | not null | 실패 소비자 |
| `correlation_id` | Text | not null | 흐름 ID |
| `attempts` | Integer | not null | 시도 횟수 |
| `error` | Text | not null | 오류(2000자 절단) |
| `payload` | JSONB | not null | 원 payload(raw 는 `{"raw": ...}`) |
| `status` | Text | not null | `open` / `replayed` / `archived` |
| `replayed_at` | TIMESTAMPTZ | null 허용 | replay 시각 |
| `replay_event_id` | Text | null 허용 | 재발행 이벤트 ID |
| `created_at` | TIMESTAMPTZ | not null, default now() | 적재 시각 |

호환 인덱스: `ix_event_dead_letters_open (status, id) WHERE status='open'`.

### `outbox` — `src/packages/storage/schema.py :: OutboxModel`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | BigInteger | PK, autoincrement | 행 ID |
| `event_id` | Text | unique, not null | 봉투 ID |
| `subject` / `source` / `correlation_id` | Text | not null | 봉투 메타 |
| `causation_id` | Text | null 허용 | 부모 |
| `occurred_at` | Text | not null | 봉투 created_at(ISO 문자열) |
| `payload` | JSONB | not null | 본문 |
| `schema_version` | Integer | not null, server_default `'1'` | 봉투 버전 |
| `lease_id` | Text | null 허용 | relay claim lease |
| `leased_until` | TIMESTAMPTZ | null 허용 | lease 만료 |
| `sent_at` | TIMESTAMPTZ | null 허용 | 발행 완료 시각(NULL=미발행) |

인덱스: `Index("ix_outbox_claim", "source", "sent_at", "leased_until", "id")`, `Index("ix_outbox_claim_all_sources", "sent_at", "leased_until", "id", WHERE sent_at IS NULL)`, `Index("ix_outbox_sent_at", "sent_at", WHERE sent_at IS NOT NULL)` (ORM 정의 + 호환/마이그레이션 DDL 동일).

## 동작 (Behavior)

### 스키마 초기화 (`DatabaseConnection.init`)
1. `domains.registry.load_domain_tables()` — `domains/*/models.py` 전수 import 로 `Base.metadata` 에 도메인 테이블 자동 등록(create_all 전 필수).
2. `engine.begin()` 트랜잭션에서 `configure_transaction` → `acquire_schema_init_lock`(전 배포 공통 advisory lock — 여러 워커의 동시 create_all/호환 DDL 상호 배제).
3. `_ACTIVE_CONN` 을 설정한 채 `metadata.create_all(conn)` → `ensure_compatible_schema(conn)`(위 호환 SQL 전체 순차 실행).
4. 합성 `Database` 하위(도메인 repo)가 `ensure_default_workspace` / `ensure_default_organization` / `ensure_default_role_permissions` 메서드를 제공하면 `getattr` 로 탐지해 호출(코어는 존재를 강제하지 않음).

AWS/로컬 배포는 storage와 PgBouncer Ready 확인 뒤 `management-schema-bootstrap` Job에서 위 초기화를 한 번 수행한다. 이후 API/워커의 `wait_for_database`는 `verify_schema()`만 실행하므로 기존 Pod의 DML과 새 Pod의 AccessExclusive DDL lock이 교차하는 deadlock을 만들지 않는다. `verify_schema()`는 `information_schema.columns` 한 번을 읽어 metadata와 비교하며 누락 table/column이 있으면 구체적인 항목과 함께 부팅을 거부한다.

### 도메인 자동발견(registry 연동)
`src/domains/registry.py`(도메인 zone, [domains](../domains/rca.md) 계열 스펙 참조)가 합성 루트다:
- `load_domain_tables()` / `load_domain_events()` / `load_domain_tools()` — `pkgutil.iter_modules(domains.__path__)` 로 각 도메인 패키지의 `models` / `events` / `tools` 모듈을 import(없으면 조용히 건너뜀; 다른 모듈의 ModuleNotFoundError 는 전파).
- `_discovered_repositories()` — `domains/*/repository.py` 에 정의된 `DatabaseConnection` 하위 클래스(정의 모듈 일치 확인)를 수집.
- `Database = type("Database", (EventRepository, DeadLetterRepository, OutboxRepository) + 발견된 도메인 repo, {})` — 코어 3종 + 도메인 repo 다중상속 동적 합성. `TYPE_CHECKING` 에서는 코어+명시 도메인 repo(Identity/AgentCommand/Rca/PullRequest/AuditLog/TargetAgent)를 상속한 스텁 클래스로 선언(타입체커 인식용).
- 결과: 팀원이 `domains/<새도메인>/{models,repository}.py` 를 추가하면 `packages/` 수정 0 으로 테이블·repo 가 포함된다.

### 코어 처리 대장/아웃박스 흐름
[runtime — EventProcessor](runtime.md#동작-behavior) 가 사용하는 순서: `record_event`(멱등 기록) → `begin_event_processing`(원자 claim) → 업무 트랜잭션에서 `stage_events`(outbox) + `finish_event_processing` → `OutboxRelay` 가 `unsent_events`(lease claim) → 발행 → `mark_events_sent`. `OutboxRelay`가 브로커의 비재시도 publish 오류(`MaxPayloadError`)를 받으면 `mark_events_dead_lettered`로 원 payload/error 를 DLQ에 남기고 해당 outbox 행을 sent 처리해 같은 oversized payload 무한 재시도를 끊는다.

## 불변식·오류 (Invariants & Errors)

1. `DATABASE_URL` 미설정 시 `DatabaseConnection()` 생성 자체가 `RuntimeError("DATABASE_URL is required")`.
2. **UoW 합류 규칙**: 활성 `_ACTIVE_CONN` 이 있으면 `connection()`/`unit_of_work()` 는 새 트랜잭션을 열지 않고 합류하며 commit 은 최상위 UoW 소유 — 중첩 커밋으로 인한 원자성 파괴 금지.
3. **claim 원자성**: `claim_event_processing` 은 단일 UPSERT 문으로 검사+갱신 — 종결 상태 재클레임 금지, 신선한(90s 이내) PROCESSING 재클레임 금지.
4. **DLQ replay 단일성**: `mark_dead_letter_replayed` 는 `status='open'` 조건부 원자 UPDATE — 첫 호출만 `True`. 원인이 해결됐지만 원 payload 재발행이 위험한 레거시 DLQ는 운영 절차로 `archived` 처리해 open 카운트와 replay 대상에서 제외한다.
5. **outbox lease**: `unsent_events` 는 `FOR UPDATE SKIP LOCKED` + lease(60s)로 다중 relay 인스턴스의 이중 발행을 억제. 정상 발행은 `mark_events_sent`, 브로커 정책상 재시도 불가 publish 오류는 `mark_events_dead_lettered` 만 sent 확정한다.
6. 스키마 초기화 advisory lock (namespace, key) 는 고정값 — 변경하면 bootstrap 실행끼리 상호 배제되지 않는다. API/워커 runtime에서는 `DATABASE_STARTUP_MODE=verify`로 DDL 자체를 실행하지 않는다.
7. 오류 메시지는 항상 `compact_error` 로 2000자 절단 후 저장.
8. `RedisSessionStore` 의 명령은 `connect()` 이전 호출 시 `RedisSessionStoreNotConnected`.
9. 이메일 인증 토큰은 `GETDEL` 로 정확히 1회 소비.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `DATABASE_URL` | str | (필수) | PostgreSQL URL(`postgresql://` → psycopg 드라이버로 치환) |
| `DB_LOCK_TIMEOUT_MS` | int(ms) | `5000` | 잠금 대기 한도 |
| `DB_STATEMENT_TIMEOUT_MS` | int(ms) | `30000` | 쿼리 실행 한도 |
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | int(ms) | `30000` | 유휴 트랜잭션 한도 |
| `DB_SCHEMA_INIT_LOCK_TIMEOUT_MS` | int(ms) | `60000` | 스키마 초기화 잠금 대기 한도 |
| `DB_SCHEMA_INIT_STATEMENT_TIMEOUT_MS` | int(ms) | `120000` | 스키마 초기화 DDL 실행 한도 |
| `DB_POOL_SIZE` | int | `2` | 풀 상주 커넥션 수 |
| `DB_MAX_OVERFLOW` | int | `2` | 순간 초과 허용 커넥션 수 |
| `DB_POOL_TIMEOUT_SECONDS` | int | `10` | 풀 커넥션 대기 한도 |
| `OUTBOX_SENT_RETENTION_HOURS` | int | `24` | sent outbox row 보존 시간 |
| `EVENT_RETENTION_DAYS` | int | `7` | events row 보존 일수 |
| `AUDIT_LOG_RETENTION_DAYS` | int | `7` | audit_log row 보존 일수 |
| `DB_RETENTION_DELETE_LIMIT` | int | `1000` | retention sweep의 테이블별 delete batch 상한 |

(풀은 항상 `pool_pre_ping=True`, `pool_recycle=300`. 게이트웨이/워커의 트래픽 특성 차이는 서비스별 deploy env 로 오버라이드.)

Redis 관련 값은 env 가 아니라 `RedisSessionStoreConfig` 로 주입된다(구성 값 결정은 [api-gateway](../services/gateway-api-gateway.md) 책임).
