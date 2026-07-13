---
source_commit: 664925a6
status: synced
---

# packages/config — 설정·상수·로깅·에러 가드·의존성 대기(최하층 공용 유틸)

> 소스: `src/packages/config/` · 테스트: `tests/test_env_defaults.py`, `tests/test_error_paths.py`, `tests/test_runtime_dependencies.py`

## 책임 (Responsibility)

- 전 서비스 공용의 **최하층 유틸**: env 조회, ISO 시각, 서비스 공유 상수(브로커 URL·인증 쿠키·명령 액션·위험도 태그), 제어(쓰기) 명령 허용 네임스페이스 정책, 구조적(JSON) 로깅, `require`/`fail` 에러 가드, 의존성 기동 대기.
- 다른 `packages/*` 를 import 하지 않는다(단, `retry.py`/`control.py` 는 같은 패키지 내 `errors`/`logs`/`settings`/`constants` 만 사용). 도메인 지식 없음.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | stdlib only (`os`, `json`, `logging`, `asyncio`, `enum`, `datetime`) | — | — |
| 피참조 | `packages.contracts/events/storage/runtime/security/ai` | [contracts](contracts.md) 외 | 상수·env·로깅 소비 |

## 공개 인터페이스 (Public API)

### `settings.py`

```python
def env(name: str, default: str) -> str          # os.getenv(name, default)
def required_env(name: str) -> str               # 없거나 빈 값이면 RuntimeError(f"{name} is required")
def now_iso() -> str                             # datetime.now(UTC).isoformat()
```
앵커: `src/packages/config/settings.py :: env`, `src/packages/config/settings.py :: required_env`, `src/packages/config/settings.py :: now_iso`.

### `constants.py`

네임스페이스 클래스(전부 `Final` 클래스 속성; 앵커 `src/packages/config/constants.py :: <이름>`):

- `Nats` — `DEFAULT_URL: Final[str] = "nats://nats:4222"`.
- `Redis` — `DEFAULT_URL: Final[str] = "redis://redis:6379/0"`.
- `Runtime` — `DEFAULT_SERVICE_NAME = "service"`, `DEFAULT_HTTP_PORT = "8000"`, `SERVICE_NAME_ENV = "SERVICE_NAME"`.
- `Target` — `DEFAULT_CLUSTER_ID = "default-target-cluster"`, `DEFAULT_EVIDENCE_INTERVAL_SECONDS = "30"`.
- `Auth` — `LOCAL_USER_ID = "local-user"`, `DEFAULT_SESSION_TTL_SECONDS = "86400"`, `SESSION_TTL_ENV = "SESSION_TTL_SECONDS"`, `SESSION_COOKIE_NAME = "service_session"`, `COOKIE_SECURE_ENV = "COOKIE_SECURE"`, `COOKIE_SAMESITE = "lax"`. (세션 쿠키는 httpOnly 로 XSS 토큰 탈취 차단; Secure 는 운영 기본 on, 로컬 http 는 `COOKIE_SECURE=0`; SameSite=lax 로 CSRF 완화.)
- `GitHub` — `PROVIDER = "github"`.
- `Command` — `DEFAULT_ACTION = "rollout_restart"`, `APPLY_MANIFEST_ACTION = "apply_manifest"`, `DELETE_WORKLOAD_ACTION = "delete_workload"`, `KUBERNETES_DEPLOYMENT_SCALE_ACTION = "k8s.apps.v1.deployments.scale"`, `TELEMETRY_QUERY_RUN_ACTION = "telemetry.query.run"`.
- `CommandStatus` — `QUEUED: Final = "queued"`, `LEASED: Final = "leased"`, `RUNNING: Final = "running"`, `COMPLETED: Final = "completed"`, `FAILED: Final = "failed"`. (타입 미지정 `Final` → mypy 가 Literal 로 추론해 `Literal["completed","failed"]` 필드에 그대로 대입 가능.)
- `src/packages/config/constants.py :: RiskLevel` — `StrEnum`. diff 위험도 태그(생산자 gitops·소비자 command 공유, wire 에 값 문자열 그대로):

| 멤버 | 값 | 의미 |
|---|---|---|
| `SANDBOX_ONLY` | `"sandbox-only"` | sandbox 한정 변경 → 안전 판정 표식 |
| `NON_SANDBOX_NAMESPACE` | `"non-sandbox-namespace"` | sandbox 밖 네임스페이스 → 검토 필요 |
| `REVIEW_REQUIRED` | `"review-required"` | 렌더 상태상 사람 검토 필요 |

- `Sandbox` — `NAMESPACE = "sandbox"`, `RISK_TAG: Final[RiskLevel] = RiskLevel.SANDBOX_ONLY`(호환 별칭), `UNSAFE_NAMESPACE_RISK_TAG: Final[RiskLevel] = RiskLevel.NON_SANDBOX_NAMESPACE`(호환 별칭), `NO_DIFF_REASON = "desired and actual images already match"`(변경 없음 판정 사유 — 생산자/소비자 공유, 중복 정의 금지).

### `control.py` — 제어(쓰기) 명령 허용 네임스페이스 정책

기존에 게이트웨이 검증·command-worker 정책 룰·cluster-agent 쓰기 가드 3곳에 각각 고정값 사용돼 있던 "sandbox 만 허용"의 **단일 기준**. 매 호출 시 env 를 읽으므로 재기동 없이 반영된다(호출 빈도 대비 비용 무시 가능).

- `src/packages/config/control.py :: CONTROL_ALLOWED_NAMESPACES_ENV` — `"CONTROL_ALLOWED_NAMESPACES"` (CSV; 기본은 `Sandbox.NAMESPACE` 하나 — env 미설정 시 기존 동작과 동일).
- `src/packages/config/control.py :: CONTROL_NAMESPACE_DENIED_MESSAGE` — `"namespace is not allowed by control policy"` (3계층 공통 거부 사유 문구).
- `src/packages/config/control.py :: CONTROL_PROTECTED_NAMESPACES` — `("management",)`. 보호 네임스페이스는 `CONTROL_ALLOWED_NAMESPACES`에 명시돼도 제어 허용목록에서 제거된다.
```python
def control_namespace_protected(namespace: str) -> bool
def control_allowed_namespaces() -> tuple[str, ...]   # CSV 파싱(trim·순서 보존 중복 제거), 보호 namespace 제거, env 비면 ("sandbox",)
def control_namespace_allowed(namespace: str) -> bool # namespace in control_allowed_namespaces()
```
앵커: `src/packages/config/control.py :: control_namespace_protected`, `src/packages/config/control.py :: control_allowed_namespaces`, `src/packages/config/control.py :: control_namespace_allowed`.

소비자: api-gateway command 라우터의 `validate_control_namespace`, command-worker 정책 룰 `NamespaceAllowlistRule`(`src/domains/command/policy.py`), cluster-agent 쓰기 가드. 관리 플레인은 프로세스 env, 대상 클러스터 agent 는 설치 manifest ConfigMap 의 `CONTROL_ALLOWED_NAMESPACES` 로 주입받는다(클러스터별로 다르게 설정 가능).

### `errors.py`

- `src/packages/config/errors.py :: SYSTEM_PREFIX` — `= "[event-system]"`.
```python
def fail(message: str, error: type[Exception] = RuntimeError) -> NoReturn
    # raise error(f"[event-system] {message}")
def require(condition: object, message: str, error: type[Exception] = ValueError) -> None
    # falsy 면 fail(message, error)
```
앵커: `src/packages/config/errors.py :: fail`, `src/packages/config/errors.py :: require`.

### `logs.py` — 구조적(JSON) 로깅

한 줄 = JSON 1개. 전 서비스 동일 형식 → 로그 수집기에서 `correlation_id` 등으로 질의, pod 경계 넘는 흐름 추적.

- `src/packages/config/logs.py :: CONTEXT_KEY` — `= "context"`. `logger.info("action", extra={"context": {...}})` 의 키.
- `src/packages/config/logs.py :: JsonFormatter` — `logging.Formatter` 하위. `__init__(service: str)`. `format()` 출력 필드: `ts`(`%Y-%m-%dT%H:%M:%S%z`), `level`(소문자), `service`, `action`(= 로그 메시지), record 의 `context` dict 를 최상위에 병합, `exc_info` 있으면 `error` 에 포맷된 traceback. `json.dumps(ensure_ascii=False)`.
```python
def configure_logging(service: str, level: int = logging.INFO) -> None
    # 프로세스 시작 시 1회. 루트 로거 핸들러를 stdout JsonFormatter 하나로 교체
def get_logger(name: str) -> logging.Logger
```

### `retry.py` — 의존성 기동 대기

- `src/packages/config/retry.py :: DEPENDENCY_RETRY_LIMIT_ENV` — `"DEPENDENCY_RETRY_LIMIT"`; `DEPENDENCY_RETRY_LIMIT`(기본 60).
- `src/packages/config/retry.py :: DEPENDENCY_RETRY_DELAY_SECONDS_ENV` — `"DEPENDENCY_RETRY_DELAY_SECONDS"`; `DEPENDENCY_RETRY_DELAY_SECONDS`(기본 2).
- `src/packages/config/retry.py :: retry_dependency`
```python
async def retry_dependency(attempt: Callable[[], Awaitable[None]], *, label: str,
                           limit: int = DEPENDENCY_RETRY_LIMIT,
                           delay: int = DEPENDENCY_RETRY_DELAY_SECONDS) -> None
```
`attempt` 성공까지 최대 `limit` 회(간격 `delay`s) 재시도. 각 실패는 `dependency_waiting` WARNING(context: dependency/attempt/limit/exception_type). 소진 시 `fail(f"{label} 연결 실패")` → `[event-system] <label> 연결 실패` RuntimeError.

직접 계약 테스트는 첫 성공 시 추가 호출·sleep이 없고, 일시 실패는 성공 전까지
정확한 attempt/limit/예외 타입 컨텍스로 기록하는지 고정한다. 한도 소진과 `limit=0`은
표준 시스템 오류로 종료하며, task `CancelledError`는 실패 로그나 재시도 지연으로
변환하지 않고 호출자에게 전파한다.

`src/packages/config/__init__.py` 는 빈 모듈.

## 동작 (Behavior)

- 서비스 부팅: `configure_logging(service)` 1회 → 이후 모든 로거가 JSON 으로 stdout 출력.
- 인프라 접속(nats/postgres): `retry_dependency(attempt, label=...)` 로 기동 순서 자유화([events](events.md) `NatsEventBus.connect`, [storage](storage.md) `wait_for_database` 가 소비).

## 불변식·오류 (Invariants & Errors)

1. `required_env` 는 빈 문자열도 미설정으로 취급한다.
2. 시스템 오류 메시지는 항상 `[event-system]` 프리픽스(`fail`/`require` 경유)로 통일한다.
3. `RiskLevel`/`Sandbox.NO_DIFF_REASON`/`CONTROL_NAMESPACE_DENIED_MESSAGE` 등 wire·계층 공유 리터럴은 이 모듈이 유일한 정의 지점 — 서비스 쪽 중복 정의 금지.
4. `configure_logging` 은 루트 핸들러를 **교체**한다(누적 아님) — 중복 로그 방지.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `DEPENDENCY_RETRY_LIMIT` | int | `60` | 의존성 대기 재시도 횟수 |
| `DEPENDENCY_RETRY_DELAY_SECONDS` | int | `2` | 재시도 간격 초 |
| `SERVICE_NAME` | str | `service` | 서비스 이름(이름만 정의; 소비는 runtime/events) |
| `SESSION_TTL_SECONDS` | int | `86400` | 세션 TTL(이름만 정의; 소비는 api-gateway) |
| `CONTROL_ALLOWED_NAMESPACES` | csv | `sandbox` | 제어(쓰기) 명령 허용 네임스페이스 — 게이트웨이·command-worker·cluster-agent 공유 단일 기준. `management`는 보호 네임스페이스라 값에 넣어도 항상 제거 |
| `COOKIE_SECURE` | bool-ish | 운영 on | 세션 쿠키 Secure(이름만 정의) |
