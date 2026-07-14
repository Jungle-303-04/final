---
source_commit: d4b003525
status: synced
---

# packages/contracts — 서비스 경계를 가로지르는 공유 계약(타입·Protocol·상수)

> 소스: `src/packages/contracts/` · 테스트: `tests/test_ports.py`, `tests/test_schemas.py`, `tests/test_realtime_contracts.py`, `tests/test_stream_subjects.py`, `tests/test_event_registry.py`, `tests/test_event_envelope_versioning.py`

## 책임 (Responsibility)

- 서비스·도메인·프론트가 공유하는 **와이어 계약**을 정의한다: 이벤트 봉투/subject/body 베이스, HTTP 요청·응답 모델, 라우트 경로, 권한 enum, 스토어 능력 Protocol, outbound 전략 Protocol.
- **구현을 갖지 않는다**: NATS/DB/HTTP 클라이언트 구현은 `packages/events`, `packages/storage`, `packages/runtime` 에 있다. 이 패키지는 타입과 상수만 제공한다.
- 레이어 규칙상 `packages` 는 `domains` 를 import 하지 못하므로, 도메인 타입이 필요한 전략 계약(`AlertProvider`, `ScmProvider`, `ManifestRenderer`)은 `Any` 기반 **구조적 시그니처**로 둔다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config` | [config](config.md) | `Command`/`CommandStatus`/`Sandbox`/`Target` 상수 (gateway/requests.py) |
| lazy import | `domains.*.events` | [domains/*](../domains/rca.md) | `event_bus/bodies/__init__.py` 가 도메인 body 를 lazy re-export |
| 피참조 | `packages.events`, `packages.runtime`, `packages.storage`, 모든 services | [events](events.md), [runtime](runtime.md), [storage](storage.md) | 계약 소비 |

---

## 하위 모듈: `alert/`

알림 전송 outbound 경계 계약.

### 공개 인터페이스

- `src/packages/contracts/alert/provider.py :: AlertProvider` — `Protocol`

```python
class AlertProvider(Protocol):
    async def dispatch(self, alert: Any) -> Any: ...
```

`alert.requested` 를 채팅/이메일/온콜 채널로 전송하는 전략. `alert` 인자는 실제로는 `domains.alert.events.AlertRequestedBody`, 반환은 `AlertDispatchedBody` 임(레이어 규칙상 구조적 시그니처). `alert/__init__.py` 는 `AlertProvider` 만 re-export (`__all__ = ["AlertProvider"]`).

관련 도메인: [alert](../domains/alert.md).

---

## 하위 모듈: `event_bus/`

이벤트 버스의 **계약 표면**: 봉투 스키마, subject 카탈로그, 버스 Protocol, 처리 상태, 구독 이름 규칙, 이벤트 타입 레지스트리. 구현은 [events](events.md), 실행은 [runtime](runtime.md).

### `event_bus/__init__.py`

공개 import 표면. 다음 심볼을 re-export 한다(`__all__` 명시):
`ALL_EVENTS_SUBJECT`, `Event`, `EventBus`, `EventClient`, `EventConsumerBus`, `EventHandler`, `EventMessage`, `EventProcessingStatus`, `EventPublisher`, `EventRecorder`, `EventSubject`, `EventSubscription`, `JsonObject`, `STREAM_NAME`, `STREAM_SUBJECTS`, `WorkerSubscription`.

### `event_bus/interfaces.py`

- `src/packages/contracts/event_bus/interfaces.py :: JsonObject` — `JsonObject = dict[str, Any]` 타입 별칭.
- `src/packages/contracts/event_bus/interfaces.py :: ENVELOPE_SCHEMA_VERSION` — `= 1`. 봉투 스키마 버전. 호환 규칙: 필드 추가는 기본값과 함께만 허용, 필드 제거/의미 변경 금지(필요 시 새 subject 분리 + 버전 상승), 버전 없는 구버전 메시지는 1 로 간주.
- `src/packages/contracts/event_bus/interfaces.py :: Event` — `TypedDict`. 필드: `event_id: str`, `subject: str`, `source: str`, `correlation_id: str`, `causation_id: str | None`, `created_at: str`, `payload: JsonObject`, `schema_version: int`.
- `src/packages/contracts/event_bus/interfaces.py :: EventEnvelope` — `@dataclass(frozen=True)`. 이벤트 봉투(공통 메타데이터 + payload).

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `event_id` | `str` | (필수) | 이벤트 고유 ID |
| `subject` | `str` | (필수) | 주제(주소), 예: `git.changed` |
| `source` | `str` | (필수) | 발행한 서비스 이름 |
| `correlation_id` | `str` | (필수) | 같은 흐름(요청)의 이벤트를 묶는 ID |
| `causation_id` | `str \| None` | (필수) | 나를 유발한 직전 이벤트 ID(없으면 흐름 시작점) |
| `created_at` | `str` | (필수) | 생성 시각(ISO 문자열) |
| `payload` | `JsonObject` | (필수) | 본문 데이터(dict) |
| `schema_version` | `int` | `ENVELOPE_SCHEMA_VERSION` | 봉투 스키마 버전 |

메서드:
```python
@classmethod
def from_mapping(cls, raw: Mapping[str, Any]) -> EventEnvelope   # 미지 키는 무시(known 필드만 취함)
def to_dict(self) -> Event                                        # dataclass 필드에서 파생(필드 이름 단일 출처)
```

- `src/packages/contracts/event_bus/interfaces.py :: EventHandler` — `Callable[[EventEnvelope], Awaitable[list[EventEnvelope]]]`. 구독 이벤트 1건 처리 함수 시그니처.
- `src/packages/contracts/event_bus/interfaces.py :: EventMessage` — `Protocol`. 브로커 메시지: `data: bytes`, `async def ack() -> None`, `async def nak(delay: int = 0) -> None`.
- `src/packages/contracts/event_bus/interfaces.py :: EventSubscription` — `Protocol`. pull 구독: `async def fetch(batch: int, timeout: float | None = None) -> Sequence[EventMessage]`.
- `src/packages/contracts/event_bus/interfaces.py :: EventPublisher` — `Protocol`:
```python
async def emit(self, subject: str, source: str, payload: JsonObject,
               correlation_id: str | None = None, causation_id: str | None = None) -> EventEnvelope
```
- `src/packages/contracts/event_bus/interfaces.py :: EnvelopePublisher` — `Protocol`: `async def publish_envelope(evt: EventEnvelope) -> EventEnvelope`.
- `src/packages/contracts/event_bus/interfaces.py :: EventRecorder` — `Protocol`: `def record_event(evt: EventEnvelope) -> None` (발행 이벤트 영속 저장, 감사/재생용).
- `src/packages/contracts/event_bus/interfaces.py :: EventClient` — `Protocol`. `emit` 시그니처는 `EventPublisher.emit` 과 동일. 의미: 브로커 발행 + 저장 + causation 자동 연결(`RecordedEventClient` 가 구현).
- `src/packages/contracts/event_bus/interfaces.py :: EventConsumerBus` — `Protocol(EventPublisher, EnvelopePublisher)`. 발행+구독 버스(워커용): `async def connect() -> None`, `async def subscribe(subject: str, durable: str) -> EventSubscription`, `async def close() -> None`.
- `src/packages/contracts/event_bus/interfaces.py :: EventBus` — `Protocol(EventConsumerBus)`. 구체 구현 = `NatsEventBus`([events](events.md)). 서비스는 이 Protocol 에만 의존.

### `event_bus/processing.py`

- `src/packages/contracts/event_bus/processing.py :: EventProcessingStatus` — `StrEnum`. consumer 별 이벤트 처리 상태(멱등 ledger 기록). 흐름: `PROCESSING → PROCESSED`(성공) 또는 `PROCESSING → RETRYING → ... → DEAD_LETTERED`(소진).

| 멤버 | 값 | 의미 |
|---|---|---|
| `PROCESSING` | `"processing"` | 처리 시작(claim) |
| `PROCESSED` | `"processed"` | 성공 완료(ack) |
| `RETRYING` | `"retrying"` | 실패, 재시도 예정(nak) |
| `DEAD_LETTERED` | `"dead_lettered"` | 재시도 소진, DLQ 로 |

- `src/packages/contracts/event_bus/processing.py :: CLAIM_BLOCKED` — `= "claim_blocked"`. 저장 상태가 아닌 파생 신호 — 다른 소비자 인스턴스의 신선한 PROCESSING 이 claim 을 거절했음을 뜻함. 워커는 ack 도 처리도 아닌 nak 로 미룸.
- `src/packages/contracts/event_bus/processing.py :: TERMINAL_STATUSES` — `= (EventProcessingStatus.PROCESSED, EventProcessingStatus.DEAD_LETTERED)`. 종결 상태 — 재배달이 와도 재처리하지 않고 ack 로 소거.

### `event_bus/registry.py`

이벤트 타입 레지스트리(전역 카탈로그). "어떤 이벤트가 있나"만 담당(정적). 실제 구독/실행은 [runtime](runtime.md) 의 `App` + dispatch.

- `src/packages/contracts/event_bus/registry.py :: EventBodyContract` — `Protocol`: `@classmethod def from_body(cls, raw: Mapping[str, Any]) -> Any`.
- `src/packages/contracts/event_bus/registry.py :: Subscription` — `@dataclass(frozen=True)`. `App.on` 이 만드는 핸들러 바인딩.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `subject` | `EventSubject` | (필수) | 구독 subject |
| `body_type` | `type[EventBodyContract]` | (필수) | 디코드할 body 타입 |
| `fn` | `Callable[..., Any]` | (필수) | 핸들러 함수 |
| `wants_ctx` | `bool` | (필수) | 핸들러가 `(evt, ctx)` 2-인자인지 |

- `src/packages/contracts/event_bus/registry.py :: EventRegistry` — 전역 이벤트 카탈로그.
```python
def define(self, subject: EventSubject) -> Callable[[type[EventBodyContract]], type[EventBodyContract]]
    # 데코레이터: body_type.__subject__ = subject 를 동적 부착하고 _defs 에 등록
def note_handler(self, service: str, sub: Subscription) -> None      # App 이 핸들러를 카탈로그에 알림(make events 표시용, 중복 무시)
def note_raw_handler(self, service: str, handler: str) -> None      # 전체(>) 구독 프로젝터 알림
def describe(self) -> str                                            # make events 용 표(정의·핸들러·필드 나열)
```
- `src/packages/contracts/event_bus/registry.py :: events` — 모듈 전역 `EventRegistry()` 싱글턴.
- `src/packages/contracts/event_bus/registry.py :: event` — `= events.define`. `@event(SUBJECT)` 데코레이터로 body ↔ 이벤트 선언.

### `event_bus/subjects.py`

- `src/packages/contracts/event_bus/subjects.py :: STREAM_NAME` — `= "SERVICE_EVENTS"`. 전 서비스 이벤트가 적재되는 단일 JetStream 스트림.
- `src/packages/contracts/event_bus/subjects.py :: STREAM_MAX_AGE_SECONDS` — `= 7 * 24 * 60 * 60` (7일).
- `src/packages/contracts/event_bus/subjects.py :: STREAM_MAX_BYTES` — `= 512 * 1024 * 1024` (512 MiB; 1Gi PVC 파일시스템 오버헤드 고려).
- `src/packages/contracts/event_bus/subjects.py :: STREAM_DUPLICATE_WINDOW_SECONDS` — `= 24 * 60 * 60`. relay crash/retry 중복 publish 억제 창.
- `src/packages/contracts/event_bus/subjects.py :: EventSubject` — `StrEnum`. 네이밍 규칙: `"<도메인>.<행동>[.<상세>]"` 점 구분 소문자. 과거형 = 사실, 요청형 = 처리 요청. 전체 멤버:

| 멤버 | 값 | 의미 |
|---|---|---|
| `GIT_WEBHOOK_RECEIVED` | `git.webhook.received` | 깃 webhook 수신(입구) |
| `GIT_CHANGED` | `git.changed` | 변경 확정 |
| `MANIFEST_RENDERED` | `manifest.rendered` | k8s manifest 렌더 |
| `MANIFEST_INVALID` | `manifest.invalid` | 배포 가능한 manifest 부재/파싱 실패 |
| `DESIRED_DIFF_DETECTED` | `desired.diff.detected` | 원하는 상태와 차이 감지 |
| `DIFF_ANALYZED` | `diff.analyzed` | diff 위험도 분석 결과 |
| `AGENT_CONNECTED` | `agent.connected` | 에이전트 등록 |
| `CLUSTER_EVIDENCE_RECEIVED` | `cluster.evidence.received` | 증거 수신(입구) |
| `CLUSTER_INVENTORY_SNAPSHOT_RECORDED` | `cluster.inventory.snapshot.recorded` | inventory snapshot 저장 |
| `CLUSTER_DESIRED_STATE_CHANGED` | `cluster.desired_state.changed` | 목표 상태 등록/변경 |
| `CLUSTER_RECONCILE_REQUESTED` | `cluster.reconcile.requested` | 상태 동기화 요청 |
| `CLUSTER_RECONCILE_STARTED` | `cluster.reconcile.started` | 상태 동기화 시작 |
| `CLUSTER_DRIFT_DETECTED` | `cluster.drift.detected` | 목표/실제 상태 차이 |
| `CLUSTER_RECONCILE_COMPLETED` | `cluster.reconcile.completed` | 상태 동기화 판정 완료 |
| `CLUSTER_RECONCILE_FAILED` | `cluster.reconcile.failed` | 상태 동기화 실패 |
| `COMMAND_REQUESTED` | `command.requested` | 명령 요청 |
| `COMMAND_REJECTED` | `command.rejected` | 정책 위반 거부 |
| `COMMAND_DISPATCHED` | `command.dispatched` | 대상 클러스터로 라우팅 |
| `COMMAND_QUEUED_FOR_AGENT` | `command.queued_for_agent` | 에이전트 큐 적재 |
| `COMMAND_COMPLETED` | `command.completed` | 에이전트 실행 완료 |
| `INCIDENT_DETECTED` | `incident.detected` | 장애 플래그 판단 결과 |
| `EVIDENCE_BUILT` | `evidence.built` | 증거 번들 구성 |
| `EVIDENCE_BUNDLE_BUILT` | `evidence.bundle.built` | RCA 판단 근거 묶음 구성 |
| `RCA_CANDIDATES_PLANNED` | `rca.candidates.planned` | RCA 원인 후보 생성 |
| `RCA_CANDIDATES_EVALUATED` | `rca.candidates.evaluated` | RCA 원인 후보 평가 |
| `RCA_COMPLETED` | `rca.completed` | 근본 원인 분석 완료 |
| `RCA_ANALYSIS_BLOCKED` | `rca.analysis_blocked` | RCA 자동 확정 불가 |
| `RCA_FOLLOWUP_REQUIRED` | `rca.followup.required` | RCA 후속 조치 필요 |
| `RCA_RULE_MISSING` | `rca.rule_missing` | RCA rule 매칭 실패 |
| `RCA_BACKLOG_ITEM_CREATED` | `rca.backlog.created` | RCA 개선 backlog 적재 |
| `RCA_AI_FALLBACK_REQUESTED` | `rca.ai_fallback.requested` | AI fallback 분석 요청 |
| `RECOVERY_PLANNED` | `recovery.planned` | 복구 조치 계획 수립 |
| `RECOVERY_SELECTION_REQUESTED` | `recovery.selection_requested` | 사용자 복구 후보 선택 요청 |
| `RECOVERY_ACTION_SELECTED` | `recovery.action_selected` | 복구 후보 선택 완료 |
| `SAFE_PR_PATCH_PREPARED` | `safe_pr.patch_prepared` | Safe PR 패치 초안 준비 |
| `DIFF_EXPLAINED` | `diff.explained` | 패치 diff 와 위험 설명 |
| `SAFE_PR_READY_FOR_CREATION` | `safe_pr.ready_for_creation` | 검증된 Safe PR 생성 요청 |
| `ROLLOUT_DIAGNOSED` | `rollout.diagnosed` | 롤아웃 상태 진단 |
| `APPROVAL_RECOMMENDED` | `approval.recommended` | 승인/거절 보조 판단 |
| `RCA_ACTION_REQUIRED` | `rca.action_required` | 자동 진행 불가, 사람 조치 필요 |
| `ALERT_REQUESTED` | `alert.requested` | 알람 전송/사전 배포 게이트 요청 |
| `ALERT_DISPATCHED` | `alert.dispatched` | 알람 전송 완료(log/webhook provider) |
| `ALERT_REJECTED` | `alert.rejected` | 알람/정책 게이트 차단 |
| `EMAIL_VERIFICATION_REQUESTED` | `mail.email_verification.requested` | 이메일 인증 요청 |
| `EMAIL_VERIFICATION_SENT` | `mail.email_verification.sent` | 이메일 인증 발송 완료 |
| `EMAIL_VERIFICATION_FAILED` | `mail.email_verification.failed` | 이메일 인증 발송 실패 |
| `SAFE_PR_REQUESTED` | `safe_pr.requested` | PR 생성 요청(공통) |
| `SAFE_PR_CREATED` | `safe_pr.created` | repo-gateway 가 PR 생성 완료 |
| `SAFE_PR_FAILED` | `safe_pr.failed` | repo-gateway 가 PR 생성 실패 |
| `AI_MESSAGE_RECEIVED` | `ai.message.received` | 사용자 메시지 수신 |
| `AI_MESSAGE_RESPONDED` | `ai.message.responded` | agent 응답 생성 |
| `AI_MESSAGE_FAILED` | `ai.message.failed` | agent 응답 실패 |
| `WORKFLOW_CREATED` | `workflow.created` | 앱/바인딩/커밋 기준 실행 객체 생성 요청 |
| `WORKFLOW_RUN_STARTED` | `workflow.run.started` | 실행 객체 시작/재개 |
| `WORKFLOW_STEP_RECORDED` | `workflow.step.recorded` | 단계 상태 기록 |
| `WORKFLOW_RUN_COMPLETED` | `workflow.run.completed` | 실행 성공 종료 |
| `WORKFLOW_RUN_FAILED` | `workflow.run.failed` | 실행 실패 종료 |
| `APPROVAL_REQUESTED` | `approval.requested` | 쓰기 승인 필요 |
| `APPROVAL_GRANTED` | `approval.granted` | 승인 완료 또는 자동 승인 |
| `APPROVAL_REJECTED` | `approval.rejected` | 승인 거절 |
| `DEAD_LETTER_CREATED` | `dead_letter.created` | 죽은 편지(DLQ) 적재 |
| `PIPELINE_CONTRACT_FAILED` | `pipeline.contract_failed` | 워커 간 이벤트 계약 위반 |

- `src/packages/contracts/event_bus/subjects.py :: RESERVED_STREAM_SUBJECTS` — `= ("audit.>",)`. 발행 enum 없이 구독자만 있는 예약 프리픽스.
- `src/packages/contracts/event_bus/subjects.py :: STREAM_SUBJECTS` — `EventSubject` 각 값의 첫 세그먼트에서 `"<도메인>.>"` 와일드카드를 자동 파생하고 `RESERVED_STREAM_SUBJECTS` 와 합집합 후 정렬한 목록(내부 함수 `_derived_stream_subjects()` 산출). 새 이벤트/도메인을 enum 에 추가하면 자동 포함 — 수동 와일드카드 동기화 불필요.

### `event_bus/subscriptions.py`

- `src/packages/contracts/event_bus/subscriptions.py :: ALL_EVENTS_SUBJECT` — `= ">"`.
- `src/packages/contracts/event_bus/subscriptions.py :: durable_name`
```python
def durable_name(service_name: str, name: str | None = None) -> str
```
NATS consumer 이름. `name` 이 `None` 이면 `service_name`, 아니면 `f"{service_name}-{name}"` (같은 서비스의 여러 구독 충돌 방지 namespace).
- `src/packages/contracts/event_bus/subscriptions.py :: WorkerSubscription` — `@dataclass(frozen=True)`

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `service_name` | `str` | (필수) | 서비스 이름 |
| `subject` | `str` | (필수) | 구독 subject |
| `durable_name` | `str \| None` | `None` | durable 접미사 |

프로퍼티: `durable -> str` = `durable_name(self.service_name, self.durable_name)`.

---

## 하위 모듈: `event_bus/bodies/`

### `bodies/base.py` — body 베이스 + 직렬화

- `src/packages/contracts/event_bus/bodies/base.py :: JsonObject` — `dict[str, Any]` 별칭.
- `src/packages/contracts/event_bus/bodies/base.py :: EventBodyDecodeError` — `ValueError` 하위. payload 가 등록된 body 계약과 불일치할 때 발생.
- `src/packages/contracts/event_bus/bodies/base.py :: EventBody` — `@dataclass(frozen=True)` 베이스.
```python
def to_body(self) -> JsonObject                                # 객체 → wire dict (발행 시)
@classmethod
def from_body(cls, raw: Mapping[str, Any]) -> EventBody        # wire dict → 객체 (구독 시)
```
직렬화 규칙(단일 진실):
1. 필드 이름이 곧 wire 키. 카멜케이스 별칭은 `field(metadata={"payload_name": ...})`.
2. `to_body()`: 중첩 `EventBody` → 재귀 `to_body()`, `Mapping` → dict 재귀, `Sequence`(str/bytes 제외) → list 재귀, 그 외 그대로.
3. `from_body()` 검증(모두 `EventBodyDecodeError`):
   - `raw` 가 Mapping 이 아니면 `"{cls}: payload must be an object"`.
   - **미지 필드 거부**: expected 키 밖의 키가 있으면 `"unexpected field(s): ..."`.
   - 누락 필드: default/default_factory 있으면 채우고, 없으면 `"missing required field: {key}"`.
   - 타입별 디코드: `Union`/`UnionType` 은 `None` 허용 후 옵션 순차 시도(전부 실패 시 `"invalid type for field"`), 중첩 `EventBody` 는 Mapping 요구 후 재귀 `from_body`, `list/Sequence` 는 항목별 재귀(str/bytes 는 리스트 아님), `dict/Mapping` 은 `dict(value)` 복사, `bool`/`int` 는 **정확한 타입**(`type(value) is bool/int`, bool 은 int 로 통과 못함), `str` 은 `isinstance` 검사. 힌트 없음/`Any` 는 그대로 통과.

### `bodies/platform.py` — 플랫폼(런타임) 소유 이벤트 body

`dead_letter.created` 는 도메인이 아니라 런타임(`DeadLetterSink`)이 발행하므로 계약 계층에 둔다.

- `src/packages/contracts/event_bus/bodies/platform.py :: DeadLetterCreatedBody` — `@event(EventSubject.DEAD_LETTER_CREATED)` `@dataclass(frozen=True)`, `EventBody` 상속.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `dead_letter_id` | `int` | (필수) | DLQ 행 ID |
| `original_event_id` | `str` | (필수) | 원 이벤트 ID |
| `original_subject` | `str` | (필수) | 원 subject |
| `consumer` | `str` | (필수) | 실패한 소비자 |
| `attempts` | `int` | (필수) | 시도 횟수 |
| `error` | `str` | (필수) | 오류 메시지 |
| `created_at` | `str` | (필수) | 적재 시각(ISO) |
| `status` | `str` | (필수) | DLQ 상태 |
| `correlation_id` | `str` | (필수) | 흐름 ID |

DLQ 상태 어휘: `open`, `replayed`, `archived`. replay API는 `open` 상태만 재발행한다.
| `payload` | `JsonObject \| None` | `None` | 디코드 실패(raw) 경로에서만 원문이 실림 |

- `src/packages/contracts/event_bus/bodies/platform.py :: PipelineContractFailedBody` — `@event(EventSubject.PIPELINE_CONTRACT_FAILED)` `@dataclass(frozen=True)`, `EventBody` 상속. consumer 가 계약 위반 이벤트를 거부.

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `contract` | `str` | (필수) | 위반된 계약 이름 |
| `reason` | `str` | (필수) | 거부 사유 |
| `consumer` | `str` | (필수) | 거부한 소비자 |
| `payload` | `JsonObject` | (필수) | 위반 payload |
| `workspace_id` | `str` | (필수) | 워크스페이스 |
| `evidence_ref` | `str \| None` | `None` | 증거 참조 |
| `severity` | `str` | `"warning"` | 심각도 |
| `diagnostics` | `JsonObject` | `field(default_factory=dict)` | 진단 정보 |

### `bodies/__init__.py` — lazy re-export 표면

`src/packages/contracts/event_bus/bodies/__init__.py` 는 `EventBody`, `JsonObject` 를 eager import 하고, 도메인 body 는 모듈 레벨 `__getattr__` 로 **lazy 로딩**한다(도메인 `events.py` 가 `bodies.base` 를 import 하므로 eager re-export 는 순환 import 발생). 매핑 `_MODULE_BY_NAME` 은 심볼명 → 모듈 경로(대부분 `domains.<d>.events`; `DeadLetterCreatedBody`/`PipelineContractFailedBody` 만 `packages.contracts.event_bus.bodies.platform`)를 담는다. `__all__ = ["EventBody", "JsonObject", *_MODULE_BY_NAME]`. 미지 이름은 `AttributeError`. 조회된 값은 `globals()` 에 캐시.


---

## 하위 모듈: `gateway/`

api-gateway([services/gateway/api-gateway](../services/gateway-api-gateway.md))의 HTTP 요청/응답 Pydantic 모델·필드명·라우트 경로.

### `gateway/base.py`

- `src/packages/contracts/gateway/base.py :: StrictModel` — `pydantic.BaseModel` 하위, `model_config = ConfigDict(extra="forbid")`. 모든 gateway/realtime 모델의 베이스(계약 밖 필드 즉시 검증 실패).

### `gateway/fields.py`

- `src/packages/contracts/gateway/fields.py :: Gateway` — `StrEnum`. 요청/응답·payload 의 필드 이름 카탈로그(dict 인덱싱·json 직렬화에서 문자열로 동작). 멤버(이름 = 값의 대문자화; 예외만 병기):
`ACCEPTED="accepted"`, `ACTION`, `AGENT_ID`, `APPLIED`, `APPROVAL_REF`, `ACTOR`, `AUTHENTICATED`, `CAPABILITIES`, `CARDS`, `CLUSTER_ID`, `COMMAND`, `COMMAND_ID`, `CORRELATION_ID`, `DEAD_LETTER_ID`, `DEAD_LETTERS`, `DUPLICATE`, `EVIDENCE_KEY`, `ERROR`, `EVENT`, `EVENT_ID`, `FAILURE_POLICY`, `JOB`, `JOB_ID`, `EMAIL`, `LEASED`, `LEASED_UNTIL`, `LEASE_ID`, `MESSAGE`, `NAMESPACE`, `PAYLOAD`, `PROVIDER_KEY`, `PROVIDER_KEYS`, `PROVIDER_POLICY`, `POLICY_GENERATION`, `POLICY_DECISION_REF`, `REPLAY_EVENT`, `REQUESTED_BY`, `RESULT`, `RESOURCES`, `RETRYABLE`, `ROLES`, `SERVICE`, `SOURCE_ID`, `SESSION`, `SESSION_TOKEN`, `STATUS`, `STATUS_ARCHIVED="archived"`, `STATUS_OK="ok"`, `STATUS_OPEN="open"`, `STATUS_READY="ready"`, `STATUS_REPLAYED="replayed"`, `STDERR`, `STDOUT`, `USER_ID`, `VERIFICATION_REQUIRED`, `WINDOW_START`, `WORKSPACE_ID`.

### `gateway/requests.py`

모듈 상수(모두 `src/packages/contracts/gateway/requests.py` 앵커):

| 상수 | 값 | 의미 |
|---|---|---|
| `DEFAULT_WEBHOOK_REPLICAS` | `2` | webhook replicas 기본 |
| `MIN_WEBHOOK_REPLICAS` / `MAX_WEBHOOK_REPLICAS` | `1` / `10` | replicas 범위 |
| `DEFAULT_COMMAND_STATUS` | `CommandStatus.COMPLETED` (`Literal["completed","failed"]`) | 명령 결과 기본 상태 |
| `EMPTY_COMMAND_MESSAGE` | `""` | 빈 메시지 |
| `DEFAULT_TARGET_NAME` | `"target-cluster"` | 대상 클러스터 이름 기본 |
| `DEFAULT_TARGET_ENVIRONMENT` | `"sandbox"` | 대상 환경 기본 |
| `DEFAULT_PROMETHEUS_BASE_URL` | `"http://prometheus.target.svc:9090"` | 관측 스택 기본 주소(유일한 정의 지점, deploy/target Helm values 와 정렬) |
| `DEFAULT_LOKI_BASE_URL` | `"http://loki-gateway.target.svc"` | 〃 |
| `DEFAULT_TEMPO_BASE_URL` | `"http://tempo.target.svc:3200"` | 〃 |
| `DEFAULT_OTEL_SERVICE_NAME` | `"target-cluster-agent"` | OTel 서비스 이름 |
| `DEFAULT_OTEL_TRACES_ENDPOINT` | `f"http://opentelemetry-collector.{TARGET_NAMESPACE}.svc:4318/v1/traces"` | OTel trace 엔드포인트 |
| `MIN_EVIDENCE_INTERVAL_SECONDS` / `MAX_EVIDENCE_INTERVAL_SECONDS` | `1` / `3600` | evidence 주기 범위 |
| `DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS` / `MAX_EVIDENCE_JOB_MAX_ATTEMPTS` | `3` / `10` | evidence job 재시도 |
| `DEFAULT_AGENT_POLICY_GENERATION` | `1` | 정책 세대 기본 |
| `DEFAULT_PROVIDER_INTERVAL_SECONDS` | `8` | provider 주기 |
| `DEFAULT_PROVIDER_MIN_WORKERS` / `DEFAULT_PROVIDER_MAX_WORKERS` | `1` / `3` | provider 워커 수 |
| `DEFAULT_QUEUE_AGE_TARGET_SECONDS` | `15` | 큐 나이 목표 |
| `DEFAULT_AI_AGENT` | `"operations-chat"` | AI 대화 기본 에이전트 |
| `MAX_AI_MESSAGE_LENGTH` | `16_000` | AI 메시지 길이 상한 |
| `MAX_EVIDENCE_LOG_ENTRIES` | `2000` | agent evidence logs 항목 상한 |
| `MAX_EVIDENCE_PAYLOAD_BYTES` | `1_048_576` | evidence 직렬화 1MiB 상한(초과 시 422) |
| `EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE` | `"evidence payload exceeds size limit"` | 상한 초과 메시지 |
| `MAX_INVENTORY_RESOURCES` | `5000` | inventory 리소스 상한 |
| `MAX_DEPLOYMENT_REPLICAS` | `100` | scale 상한 |

요청 모델(모두 `StrictModel` 하위, 앵커는 `src/packages/contracts/gateway/requests.py :: <이름>`):

- `LoginRequest` — 자체 계정 로그인 입력. 권한 필드는 클라이언트 입력 금지(서버가 DB/session 기준 결정).

| 필드 | 타입 | 기본값 | 제약 |
|---|---|---|---|
| `email` | `str` | (필수) | `min_length=1`, `pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"` |
| `password` | `str` | (필수) | `min_length=8` |

- `SignupRequest` — `email`(위와 동일 제약), `password: str`(`min_length=8`), `password_confirm: str`(`min_length=8`).
- `ResendEmailVerificationRequest` — `email`, `password` (LoginRequest 와 동일 제약).
- `GitHubWebhookRequest`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `commit_sha` | `str` | (필수) |
| `image` | `str` | (필수, `min_length=1`) |
| `replicas` | `int` | `DEFAULT_WEBHOOK_REPLICAS` (`ge=1, le=10`) |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `repository_id` | `str` | `DEFAULT_REPOSITORY_ID` |
| `repo_ref` | `str` | (필수, `min_length=1`) |
| `branch` | `str` | `DEFAULT_REPO_BRANCH` |
| `watch_target_id` | `str` | `DEFAULT_WATCH_TARGET_ID` |
| `binding_id` | `str` | `DEFAULT_DEPLOYMENT_BINDING_ID` |
| `application_id` | `str` | `DEFAULT_APPLICATION_ID` |
| `workflow_run_id` | `str` | `DEFAULT_WORKFLOW_RUN_ID` |
| `environment` | `str` | `DEFAULT_ENVIRONMENT` |
| `cluster_id` | `str` | `Target.DEFAULT_CLUSTER_ID` |
| `manifest_path` | `str` | `DEFAULT_MANIFEST_PATH` |
| `source_type` | `str` | `""` (`max_length=40`) |
| `force` | `bool` | `False` |

- `AgentConnectRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `agent_id: str`, `capabilities: list[str] = Field(default_factory=list)`.
- `ClusterConnectRequest` — 제품 연결 위자드 입력. `name: str`(1~120자), `provider: Literal["aws","gcp","azure","onprem"]`. provider는 UI 표시/등록 hint이며 설치 자격증명은 요청 body로 받지 않는다.
- `AgentEvidenceRequest`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | `Target.DEFAULT_CLUSTER_ID` |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `correlation_id` | `str \| None` | `None` |
| `agent_id` | `str \| None` | `None` |
| `source_id` | `str \| None` | `None` |
| `window_start` | `str \| None` | `None` |
| `evidence_key` | `str \| None` | `None` |
| `kubernetes` | `dict[str, Any]` | `{}` |
| `metrics` | `dict[str, Any]` | `{}` |
| `logs` | `list[dict[str, Any]]` | `[]` (`max_length=MAX_EVIDENCE_LOG_ENTRIES`) |
| `traces` | `dict[str, Any]` | `{}` |

`@model_validator(mode="after") _bound_payload_size`: `{kubernetes, metrics, logs, traces}` 를 `json.dumps(default=str)` 직렬화한 바이트 길이가 `MAX_EVIDENCE_PAYLOAD_BYTES` 초과면 `ValueError(EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE)`.

- `RecoveryActionSelectRequest` — `reason: str | None = Field(default=None, max_length=500)`.
- `InventoryResource` — `resource_type: str`(`min_length=1, max_length=80`), `api_version: str = ""`(`max_length=120`), `kind: str = ""`(`max_length=120`), `namespace: str | None = None`(`max_length=253`), `name: str`(`min_length=1, max_length=253`), `uid: str | None = None`(`max_length=253`), `resource_version: str | None = None`(`max_length=253`), `status: str = "unknown"`(`max_length=80`), `health: str = "unknown"`(`max_length=80`), `labels: dict[str, str] = {}`, `annotations: dict[str, str] = {}`, `summary: dict[str, Any] = {}`, `raw: dict[str, Any] = {}`.
- `InventorySnapshotRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `agent_id: str`, `source: str = "cluster-agent"`(`min_length=1, max_length=120`), `collected_at: str | None = None`, `replace: bool = False`, `resources: list[InventoryResource] = []`(`max_length=MAX_INVENTORY_RESOURCES`), `summary/health/usage: dict[str, Any] = {}`.
- `TargetRegisterRequest`

| 필드 | 타입 | 기본값 / 제약 |
|---|---|---|
| `cluster_id` | `str \| None` | `None` — 미지정 시 서버가 `<name-slug>-<4자리 난수>` 생성 |
| `name` | `str` | `DEFAULT_TARGET_NAME` |
| `environment` | `str` | `DEFAULT_TARGET_ENVIRONMENT` |
| `cluster_role` | `Literal["management","target"]` | `"target"` — management 는 셀프 모니터링용 읽기 전용 클러스터 |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `management_base_url` | `str` | `""` — 클라이언트 생략 가능. 백엔드가 공개 URL env 로 정규화하고, 최종 미해결 시 preflight/register 에서 차단 |
| `image` | `str` | `""` |
| `prometheus_base_url` | `str` | `DEFAULT_PROMETHEUS_BASE_URL` |
| `loki_base_url` | `str` | `DEFAULT_LOKI_BASE_URL` |
| `tempo_base_url` | `str` | `DEFAULT_TEMPO_BASE_URL` |
| `otel_traces_endpoint` | `str` | `DEFAULT_OTEL_TRACES_ENDPOINT` |
| `evidence_interval_seconds` | `int` | `int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS)` (`ge=1, le=3600`) |
| `control_namespaces` | `str` | `""` — 제어(쓰기) 허용 네임스페이스 CSV. 빈 값이면 agent 기본(sandbox)만. 설치 manifest ConfigMap 의 `CONTROL_ALLOWED_NAMESPACES` 로 주입돼 클러스터별로 다르게 설정 가능 |
| `install_node_collector` | `bool` | `True` |
| `install_sample_workload` | `bool` | `False` |
| `sample_workload_name` | `str \| None` | `None` (`min_length=1, max_length=63, pattern=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"`) |
| `sample_workload_image` | `str \| None` | `None` (`min_length=1`) |
| `apply` | `bool` | `False` |
| `kube_context` | `str \| None` | `None` |
| `cloud_provider` | `str` | `"existing-k8s"` |
| `deploy_provider` | `str` | `"manual-manifest"` |
| `provider_config` | `dict[str, Any]` | `{}` — EKS/GKE/AKS/kind/minikube 등 provider별 bootstrap 힌트. 비밀값 저장 금지 |

`@model_validator(mode="after") _sample_workload_requires_explicit_config`: `install_sample_workload=True` 인데 name/image 중 하나라도 없으면 `ValueError`.

- `TargetPreflightRequest` — `cluster_id: str = ""`, `cluster_role: Literal["management","target"] = "target"`, `cloud_provider: str = "existing-k8s"`, `deploy_provider: str = "manual-manifest"`, `provider_config: dict[str, Any] = {}`, `apply: bool = False`, `kube_context: str | None = None`, `image: str = ""`, `management_base_url: str = ""`.
- `CommandRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `action: str = Command.DEFAULT_ACTION`, `namespace: str = Sandbox.NAMESPACE`, `reason: str | None = None`, `diff: dict[str, Any] | None = None`, `approval_ref: str | None = None`, `policy_decision_ref: str | None = None`.
- `DeploymentScaleRequest` — `replicas: int`(`ge=0, le=MAX_DEPLOYMENT_REPLICAS`), `reason: str | None`(`max_length=500`), `approval_ref: str | None = None`, `policy_decision_ref: str | None = None`.
- `DeploymentRestartRequest` — `reason: str | None`(`max_length=500`), `approval_ref: str | None = None`, `policy_decision_ref: str | None = None`.
- `AgentDebugQueryRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `query: dict[str, Any]`, `reason: str | None = None`.
- `AlertChannelUpsertRequest` — workspace 알림 채널 생성/수정 입력. `channel_id: str = ""`(빈 값이면 서버 생성), `name: str`(`min_length=1`), `kind: Literal["webhook"] = "webhook"`, `url: str`(`min_length=1`), `min_severity: Literal["info","warning","critical"] = "warning"`, `enabled: bool = True`.
- `EmailCheckRequest` — `email: str`. `/auth/check-email` 사전 검증 요청.
- `RepoValidateRequest` — `url: str`, `token: str | None = None`. URL은 GitHub `owner/repo`로 정규화되며 token 원문은 응답에 절대 포함하지 않는다.
- `AlertChannelTestRequest` — 저장 전 알림 테스트. `name`, `kind="webhook"`, `url`, `min_severity`, `severity`, `message`.
- `RcaRuleValidateRequest` — `yaml_text: str`(`max_length=100_000`). RCA 룰 저장 전 검증 전용.
- `MetricsValidateRequest` — `source="prometheus"`, `query`, `base_url`, `range_seconds`, `step_seconds`. PromQL dry-run 검증 전용.
- `AlertmanagerAlert` — 외부 Alertmanager webhook alert 항목. `model_config.extra="allow"`이고 외부 camelCase 계약을 유지한다. 필드: `status: str = "firing"`, `labels/annotations: dict[str, Any] = {}`, `startsAt: str = ""`, `endsAt: str = ""`, `fingerprint: str = ""`.
- `AlertmanagerWebhookRequest` — Alertmanager v4 webhook payload. `model_config.extra="allow"`. 필드: `version: str = "4"`, `groupKey: str = ""`, `status: str = "firing"`, `receiver: str = ""`, `alerts: list[AlertmanagerAlert] = []`.
- `AiConversationCreateRequest` — `message: str`(`min_length=1, max_length=MAX_AI_MESSAGE_LENGTH`), `title: str | None`(`max_length=120`), `agent: str = DEFAULT_AI_AGENT`(`min_length=1, max_length=80`), `context: dict[str, Any] = {}`.
- `AiMessageCreateRequest` — `message: str`(위와 동일), `agent: str | None = None`(`min_length=1, max_length=80`), `context: dict[str, Any] = {}`.
- `ApplicationUpsertRequest` — `name: str`(`min_length=1, max_length=120`), `repo_ref: str = ""`(`max_length=240`), `repository_id: str = ""`, `default_branch: str = DEFAULT_REPO_BRANCH`, `manifest_path: str = DEFAULT_MANIFEST_PATH`, `metadata: dict[str, Any] = {}`.
- `ApplicationConnectRequest` — `name: str`(`min_length=1, max_length=120`), `repo_ref: str`(`min_length=1, max_length=240`), `token: str | None = None`(`min_length=1, max_length=500`), `branch: str = DEFAULT_REPO_BRANCH`(`min_length=1, max_length=200`), `manifest_path: str = DEFAULT_MANIFEST_PATH`(`min_length=1, max_length=500`), `source_type: str = ""`(`max_length=40`), `cluster_id: str`(`min_length=1, max_length=120`), `namespace: str = Sandbox.NAMESPACE`, `environment: str = DEFAULT_ENVIRONMENT`, `metadata/deploy_policy/access_policy: dict[str, Any] = {}`.
- `RepositoryProbeRequest` — `repo_ref: str`(`min_length=1, max_length=240`).
- `RepositoryManifestValidationRequest` — `repo_ref: str`(`min_length=1, max_length=240`), `branch: str = DEFAULT_REPO_BRANCH`(`min_length=1, max_length=200`), `manifest_path: str = DEFAULT_MANIFEST_PATH`(`min_length=1, max_length=500`), `source_type: str = ""`(`max_length=40`).
- `DeploymentBindingUpsertRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `namespace: str = Sandbox.NAMESPACE`, `environment: str = DEFAULT_ENVIRONMENT`, `manifest_path: str = DEFAULT_MANIFEST_PATH`, `resource_class: str = "application"`, `deploy_policy: dict[str, Any] = {}`, `access_policy: dict[str, Any] = {}`.
- `CatalogInstallRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `namespace: str = Sandbox.NAMESPACE`, `application_name: str`(`min_length=1, max_length=120`), `release_name: str | None`(미지정 시 application name, `min_length=1, max_length=120`), `version: str | None`(`max_length=80`), `values: dict[str, Any] = {}`.
- `ApprovalDecisionRequest` — `reason: str | None = None`.
- `CommandStartRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `workspace_id: str = DEFAULT_WORKSPACE_ID`, `agent_id: str`, `lease_id: str`.
- `CommandHeartbeatRequest` — `CommandStartRequest` 상속(필드 동일).
- `CommandResultRequest` — `model_config.extra="allow"`(agent 가 추가 필드를 실어도 수용). 필드: `status: Literal["completed","failed"] = DEFAULT_COMMAND_STATUS`, `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `workspace_id: str = DEFAULT_WORKSPACE_ID`, `agent_id: str`, `lease_id: str`, `applied: bool = False`, `message: str = EMPTY_COMMAND_MESSAGE`, `retryable: bool = False`, `resources: list[dict[str, Any]] = []`, `stdout: str = ""`, `stderr: str = ""`.
- `EvidenceJobScheduleRequest` — `source_id: str = "cluster-snapshot"`, `window_start: str`, `provider_keys: list[str]`(`min_length=1`).
- `EvidenceJobResultRequest` — `agent_id: str`, `lease_id: str`, `status: Literal["completed","failed"]`, `result: dict[str, Any] = {}`, `error: str = ""`. `@model_validator(mode="after") _bound_result_size`: `{"result": result}` 를 `json.dumps(default=str)` 직렬화한 바이트 길이가 `MAX_EVIDENCE_PAYLOAD_BYTES` 초과면 `ValueError(EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE)`.
- `EvidenceProviderPolicy` — `enabled: bool = True`, `interval_seconds: int = DEFAULT_PROVIDER_INTERVAL_SECONDS`(`ge=1`), `min_workers: int = DEFAULT_PROVIDER_MIN_WORKERS`(`ge=0`), `max_workers: int = DEFAULT_PROVIDER_MAX_WORKERS`(`ge=0`), `queue_age_target_seconds: int = DEFAULT_QUEUE_AGE_TARGET_SECONDS`(`ge=1`), `queries: list[dict[str, Any]] = []`.
- `EvidenceRuntimePolicy` — `failure_policy: Literal["allow_partial","strict"] = "allow_partial"`, `max_attempts: int = DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS`(`ge=1, le=MAX_EVIDENCE_JOB_MAX_ATTEMPTS`), `providers: dict[str, EvidenceProviderPolicy] = {}`.
- `DesiredResource` — `resource_id: str`, `scope: Literal["target-agent","system","user-workload"] = "target-agent"`, `kind: Literal["ConfigMap","Deployment"]`, `namespace: str`, `name: str`, `action: Literal["observe","apply"] = "observe"`, `state: dict[str, Any] = {}`.
- `BootstrapPolicy` — `mode: Literal["management","target"] = "target"`, `resources: list[DesiredResource] = []`.
- `DesiredStatePolicy` — `resources: list[DesiredResource] = []`.
- `AgentPolicy` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `generation: int = DEFAULT_AGENT_POLICY_GENERATION`(`ge=1`), `cluster_role: Literal["management","target"] = "target"`, `evidence: EvidenceRuntimePolicy = EvidenceRuntimePolicy()`, `bootstrap: BootstrapPolicy = BootstrapPolicy()`, `desired_state: DesiredStatePolicy = DesiredStatePolicy()`.
- `AgentPolicyResponse` — `policy: AgentPolicy | None = None` (요청 모듈에 위치함에 주의).
- `AgentPolicyStatusRequest` — `cluster_id: str = Target.DEFAULT_CLUSTER_ID`, `generation: int = DEFAULT_AGENT_POLICY_GENERATION`(`ge=1`), `status: Literal["applied","failed","unchanged"] = "applied"`, `message: str = EMPTY_COMMAND_MESSAGE`, `details: dict[str, Any] = {}`.
- `ProviderSelectionRequest` — `source_provider/deploy_provider/cloud_provider/secret_provider: str | None = None`, `capabilities: list[str] = []`, `credential_refs: dict[str, str] = {}`.
- `AgentReconcileStatusRequest` — `AgentPolicyStatusRequest` 와 동일 필드 구성이되 `status` 기본값만 `"unchanged"`.

### `gateway/policy_merge.py`

부분 갱신(`model_fields_set` 기반) 병합 함수 3종:

```python
def merge_agent_policy(base: AgentPolicy, incoming: AgentPolicy) -> AgentPolicy
def merge_evidence_policy(base: EvidenceRuntimePolicy, incoming: EvidenceRuntimePolicy) -> EvidenceRuntimePolicy
def merge_provider_policy(base: EvidenceProviderPolicy, incoming: EvidenceProviderPolicy) -> EvidenceProviderPolicy
```
- `src/packages/contracts/gateway/policy_merge.py :: merge_agent_policy` — base dump 위에 `generation` 은 항상 incoming 값. `cluster_id`/`cluster_role`/`bootstrap`/`desired_state` 는 incoming 에 **명시 설정된 경우만** 교체. `evidence` 는 명시 설정 시 `merge_evidence_policy` 재귀 병합. 최종 `AgentPolicy.model_validate` 로 재검증.
- `src/packages/contracts/gateway/policy_merge.py :: merge_evidence_policy` — `failure_policy`/`max_attempts` 는 명시 설정 시 교체. `providers` 는 명시 설정 시 provider 키별로 base provider(없으면 `EvidenceProviderPolicy()`)와 `merge_provider_policy` 병합(기존 키는 유지).
- `src/packages/contracts/gateway/policy_merge.py :: merge_provider_policy` — incoming 의 `model_fields_set` 필드만 base 위에 덮어씀.

### `gateway/responses.py`

- `src/packages/contracts/gateway/responses.py :: JsonMap` — `dict[str, Any]` 별칭.
- `src/packages/contracts/gateway/responses.py :: AuditJourneyStage` — 감사 이벤트의 서버 권위
  여정 단계. `alert|evidence|rca|recovery|command|pr|workflow|cluster|ai|notification|system|unknown`.

응답 모델(모두 `StrictModel`, 앵커 `src/packages/contracts/gateway/responses.py :: <이름>`):

| 모델 | 필드 |
|---|---|
| `HealthResponse` | `status: str`, `service: str \| None = None` |
| `AcceptedResponse` | `accepted: bool`, `event_id: str`, `correlation_id: str` |
| `AcceptedEventResponse` | `AcceptedResponse` + `event: JsonMap` |
| `EventIdAcceptedResponse` | `accepted: bool`, `event_id: str` |
| `AuthSessionResponse` | `authenticated: bool`, `user_id: str`, `roles: list[str]`, `workspace_id: str` |
| `EmailVerificationResponse` | `accepted: bool`, `verification_required: bool`, `email: str \| None = None` |
| `UserApprovalResponse` | `accepted: bool`, `user_id: str`, `status: str`, `role: str`, `workspace_id: str` |
| `LogoutResponse` | `authenticated: bool` |
| `AgentCommandPollResponse` | `command: JsonMap \| None` |
| `CommandStartedResponse` | `accepted: bool`, `correlation_id: str` |
| `CommandHeartbeatResponse` | `accepted: bool`, `correlation_id: str` |
| `AgentDebugQueryResponse` | `accepted: bool`, `command_id: str`, `correlation_id: str` |
| `CommandStatusResponse` | `command_id/cluster_id/correlation_id/action/status: str`, `result: dict[str, Any] = {}`, `completed_at: str \| None = None` — 콘솔이 명령 진행 상태·agent 실측 결과를 폴링(임의 완료 표시 금지 계약) |
| `RcaTimelineItem` | `workspace_id: str`, `correlation_id: str`, `cluster_id/incident_id/evidence_ref: str \| None = None`, `current_subject: str`, `status: str`, `root_cause: str \| None = None`, `confidence: float \| None = None`, `supporting_evidence/missing_evidence: list[str] = []`, `action_route/command_id/pr_url/error_reason/updated_at: str \| None = None` |
| `RcaTimelineResponse` | `items: list[RcaTimelineItem]` |
| `AuditTimelineItem` | `event_id: str`(non-empty 자기 ID), `subject/source/created_at: str`, `causation_id: str \| None = None`(직접 부모 ID), `journey_stage: AuditJourneyStage`, `payload_summary: JsonMap = {}` |
| `AuditTimelineResponse` | `items: list[AuditTimelineItem] = []`, `limit: int`, `has_more: bool`, `next_cursor: str \| None = None` |
| `RcaIncidentResponse` | `item: RcaTimelineItem` |
| `EvidenceSourceSummaryItem` / `EvidenceRecordItem` / `EvidenceQueryResponse` | evidence query 응답. `EvidenceQueryResponse`는 `items`, `limit`, `offset`, `has_more`, `next_cursor: str \| None = None`을 포함한다. `next_cursor`가 있으면 다음 페이지 요청의 `cursor`로 넘긴다 |
| `RcaCandidateScoreItem` / `RcaEvidenceRefItem` / `RcaMissingCheckItem` / `RcaReportSummaryItem` / `RcaReportListResponse` | RCA report query 응답. `RcaReportListResponse`는 `items`, `limit`, `offset`, `has_more`, `next_cursor: str \| None = None`을 포함한다 |
| `EvidenceJobScheduleResponse` | `accepted: bool`, `evidence_key: str`, `queued: int`, `job_ids: list[str]` |
| `EvidenceJobPollResponse` | `job: JsonMap \| None` |
| `EvidenceJobResultResponse` | `accepted: bool`, `evidence_key/event_id/correlation_id: str \| None = None` |
| `InventorySnapshotResponse` | `accepted: bool`, `snapshot_id: str`, `cluster_id: str`, `resource_count: int`, `marked_deleted: int = 0`, `resource_types: list[str] = []` |
| `InventoryResourceResponse` | `inventory_key/snapshot_id/workspace_id/cluster_id/resource_type/api_version/kind/name/status/health: str`, `namespace/uid/resource_version: str \| None = None`, `labels/annotations/summary: JsonMap = {}`, `observed_at/first_seen_at/last_seen_at/deleted_at/created_at/updated_at: str \| None = None` — public 응답은 Kubernetes raw object 를 노출하지 않는다 |
| `InventoryResourceListResponse` | `cluster_id: str`, `resource_type: str \| None = None`, `resources: list[InventoryResourceResponse]` |
| `InventoryResourceDetailResponse` | `cluster_id: str`, `identity: JsonMap`, `resource: InventoryResourceResponse`, `related: dict[str, list[InventoryResourceResponse]] = {}`, `events: list[InventoryResourceResponse] = []` — 단일 리소스 드릴다운용 실제 read model 관계 |
| `PhysicalTopologyServer` / `PhysicalTopologyPod` / `PhysicalTopologyResponse` | `GET /topology?view=physical` 전용 strict 응답. server는 실측 `cpu_pct/mem_pct`와 서버 계산 `matched_pod_count/total_pod_count` 및 각 count completeness를, pod는 stable inventory id·`server_id` 참조·실측 `cpu_mcores/mem_mib`·requests 근거가 있을 때만 계산한 `usage_pct`·`phase/health/restarts/matches_filter`를 가진다. 응답은 global cut과 구분한 `cluster_projection_revision`, 서버별 12개 초과 `truncated`, projection/metrics completeness, 공통 `counts/snapshot`을 함께 주며 raw/annotation/secret은 노출하지 않는다. 과거 snapshot에는 최신 usage를 섞지 않는다. |
| `ResourceMetricHistoryPoint` / `ResourceMetricHistorySeries` / `ResourceMetricsHistoryResponse` | `GET /metrics/history` 전용 strict batch 응답. point는 `observed_at`과 실측 `cpu_mcores/mem_mib` nullable 값, series는 stable `resource_id`·pod identity·`has_sparkline_points`·completeness 3값·reason을 가진다. 응답은 고유 series ID, 공통 completeness/reason, pinned `FilterSnapshotMeta`를 검증한다. `exact` series는 모든 반환 point에 CPU가 있어야 하고 데이터 부재는 0이 아니라 null/빈 points다. |
| `ClusterUsageSample` / `ClusterUsageResponse` | `sampled_at: str \| None`, `usage: JsonMap` / `cluster_id: str`, `samples: list[ClusterUsageSample]` |
| `InventorySummaryResponse` | `cluster_id: str`, `latest_snapshot: JsonMap \| None = None`, `counts: list[JsonMap] = []` |
| `FleetClusterSummaryItem` | `cluster_id/name/health: str`(health 는 healthy\|warning\|critical\|stale\|unknown), `pods_running/pods_total/nodes_ready/nodes_total/open_incidents/restarts_recent: int = 0`, `cpu_pct/mem_pct: float \| None = None`(실측 없으면 None), `last_seen_at: str \| None = None` |
| `FleetTotals` | `clusters/healthy/warning/critical/stale/unknown/open_incidents/pending_approvals/running_workflows/dead_letters: int = 0` — dead_letters 는 플랫폼 전역 카운트 |
| `FleetSummaryResponse` | `clusters: list[FleetClusterSummaryItem] = []`, `totals: FleetTotals = FleetTotals()` |
| `ClusterWorkloadHealthItem` | `name/kind/health: str`, `namespace: str \| None = None`, `ready: str = ""`("ready/desired"), `restarts: int = 0` |
| `ClusterWarningEventItem` | `name: str`, `namespace/reason/message/involved_kind/involved_name: str \| None = None`, `count: int = 0`, `last_seen_at: str \| None = None` |
| `ClusterOpenIncidentItem` | `incident_id/correlation_id/status: str`, `symptom/root_cause/created_at: str \| None = None` |
| `ClusterUsageSnapshot` | `sampled_at: str \| None = None`, `pods_running/pods_total/nodes_ready/nodes_total/restart_total: int = 0`, `cpu_pct/mem_pct: float \| None = None` |
| `ClusterSummaryDetailResponse` | `cluster_id/name/health: str`, `workloads: dict[str, list[ClusterWorkloadHealthItem]] = {}`(health 값 → 목록), `warning_events: list[ClusterWarningEventItem] = []`, `open_incidents: list[ClusterOpenIncidentItem] = []`, `usage: ClusterUsageSnapshot \| None = None` |
| `NodeSummaryItem` | `name: str`, `ready: bool`, `health: str`, `pods_running/pods_capacity/restarts_recent: int`, `cpu_pct/mem_pct: float \| None = None`, `conditions: list[str] = []` |
| `ClusterNodesSummaryResponse` | `cluster_id: str`, `nodes: list[NodeSummaryItem] = []` |
| `PodSummaryItem` | `name/namespace/phase/health/ready: str`, `restarts: int`, `owner_kind/owner_name: str \| None = None`, `cpu_mcores/mem_mib: float \| None = None`, `incident_correlation_id: str \| None = None` |
| `NodePodsSummaryResponse` | `cluster_id: str`, `node_name: str`, `pods: list[PodSummaryItem] = []` |
| `EmailCheckResponse` | `available: bool`, `reason_code: str = ""`, `detail: str = ""`, `retry_after: int \| None = None` |
| `RepoValidateResponse` | `accessible: bool`, `private: bool \| None`, `default_branch: str \| None`, `normalized: str`, `reason/code: str \| None`, `credential_ref: str \| None` |
| `RepoManifestFile` / `RepoManifestFileListResponse` | `path: str`, `kinds: list[str]` / `repo`, `branch`, `manifests`, `warnings` |
| `ValidationErrorItem` | `code: str`, `detail: str`, `line: int \| None` |
| `AlertChannelTestResponse` | `valid: bool`, `delivered: bool`, `code: str \| None`, `detail: str`, `status_code: int \| None` |
| `RcaRuleValidateResponse` | `valid: bool`, `errors: list[ValidationErrorItem]`, `matched_symptom: str \| None`, `candidates_count: int` |
| `MetricsValidateResponse` | `valid: bool`, `code: str \| None`, `detail: str`, `result_type: str \| None` |
| `BootstrapStep` | `label: str`, `command: str` |
| `TargetInstallResponse` | `registered: bool`, `cluster_id: str`, `status: str`, `applied: bool`, `apply_output: str \| None`, `install_manifest: str`, `agent_token: str`, `install_command: str = ""`, `bootstrap_command: str = ""`, `bootstrap_steps: list[BootstrapStep] = []`, `connect_timeout_seconds`, `connect_expires_at`, `connection_stage: str \| None = None`(등록 응답은 `token_issued`) — per-cluster agent 토큰 **원문**은 등록 관리자에게 1회만 반환(서버는 해시만 저장, agent 는 `x-agent-token` 으로 인증) |
| `ClusterAgentStatus` | `workspace_id/cluster_id/agent_id/status: str`, `capabilities: list[str] = []`, `details: JsonMap = {}`, `last_seen_at/created_at/updated_at: str \| None = None` |
| `ClusterSummary` | `workspace_id/cluster_id/name/environment/status: str`, `settings: JsonMap = {}`, `connection_status: str`, `provider: str \| None = None`(`eks\|gke\|aks\|onprem\|kind\|unknown`), `connection_stage: str \| None = None`, `last_agent_id/last_agent_seen_at: str \| None = None`, 호환 필드 `node_count/pod_count/incident_count: int \| None = None`, BQ-069 제품 필드 `server_count/app_count/open_incidents: int \| None = None`, `last_seen_at/created_at/updated_at: str \| None = None`. inventory·incident source가 값을 증명하지 못하면 0이 아니라 `None`이다. |
| `ClusterListResponse` | `clusters: list[ClusterSummary]` |
| `ClusterResponse` | `cluster: ClusterSummary`, `agents: list[ClusterAgentStatus] = []` |
| `ClusterConnectionStatusResponse` | `cluster_id: str`, `connection_status: str`, `connection_stage: str \| None = None`, `last_agent_id/last_seen_at: str \| None = None`, `agents: list[ClusterAgentStatus] = []`, `connect_timeout_seconds`, `connect_expires_at` |
| `ClusterConnectResponse` | `cluster_id: str`, `install_command: str`(non-empty, 서버가 발급한 일회성 토큰 포함), `expires_at: str` |
| `ClusterConnectStatusResponse` | `status: Literal["waiting","connected","expired"]`, `agent_version/connected_at: str \| None = None`. 확인되지 않은 연결 시각은 합성하지 않는다. |
| `AlertChannelResponse` / `AlertChannelListResponse` | `channel_id/workspace_id/name/kind/url/min_severity: str`, `enabled: bool`, `created_at/updated_at: str \| None = None` / `channels: list[AlertChannelResponse]` |
| `DeadLettersResponse` | `dead_letters: list[JsonMap]` |
| `DeadLetterReplayResponse` | `accepted: bool`, `dead_letter_id: int`, `replay_event: JsonMap` |
| `AiConversationAcceptedResponse` | `accepted: bool`, `conversation_id/message_id/event_id/correlation_id: str` |
| `AiConversationResponse` | `conversation: JsonMap`, `messages: list[JsonMap]` |
| `AiConversationListResponse` | `conversations: list[JsonMap]` |
| `ApplicationResponse` / `ApplicationListResponse` | `application: JsonMap` / `applications: list[JsonMap]` |
| `DeploymentBindingResponse` / `DeploymentBindingListResponse` | `deployment: JsonMap` / `deployments: list[JsonMap]` |
| `PromotionGateResponse` | `eligible`, `command_completed`, `applied_not_false`, `rollout_ready_not_false: bool`; `command_status: str`; `applied/rollout_ready: bool \| None`; `failed_resources: list[JsonMap]`; `failed_resource_count: int` |
| `WorkflowRunItemResponse` | 기존 run의 동적 필드를 `extra="allow"`로 보존하고 `promotion_gate: PromotionGateResponse \| None`를 구조화 |
| `WorkflowRunListResponse` | `runs: list[WorkflowRunItemResponse]` |
| `CatalogItemListResponse` / `CatalogItemResponse` / `CatalogInstallAcceptedResponse` | `items: list[JsonMap]` / `item: JsonMap` / `accepted: bool`, `command_id/correlation_id/status: str` |
| `ProviderCatalogResponse` | `providers: dict[str, list[JsonMap]]` |
| `ProviderValidationResponse` | `valid: bool`, `errors: list[str]`, `warnings: list[str]`, `selected: dict[str, JsonMap]` |

### `gateway/routes.py`

HTTP 경로 상수(모두 `src/packages/contracts/gateway/routes.py` 앵커). 값 그대로:

`HEALTHZ_PATH="/healthz"`, `READYZ_PATH="/readyz"`, `AUTH_SESSION_PATH="/auth/session"`, `AUTH_SESSION_REFRESH_PATH="/auth/session/refresh"`, `AUTH_SIGNUP_PATH="/auth/signup"`, `AUTH_LOGIN_PATH="/auth/login"`, `AUTH_LOGOUT_PATH="/auth/logout"`, `AUTH_CHECK_EMAIL_PATH="/auth/check-email"`, `AUTH_VERIFY_EMAIL_PATH="/auth/verify-email"`, `AUTH_RESEND_VERIFICATION_PATH="/auth/resend-verification"`, `AUTH_APPROVE_USER_PATH="/auth/users/{user_id}/approve"`, `GITHUB_WEBHOOK_PATH="/github/webhook"`, `ALERTMANAGER_WEBHOOK_PATH="/webhooks/alertmanager"`, `AGENT_CONNECT_PATH="/agent/connect"`, `AGENT_EVIDENCE_PATH="/agent/evidence"`, `EVIDENCE_QUERY_PATH="/evidence"`, `RCA_REPORTS_PATH="/rca-reports"`, `TARGETS_PATH="/targets"`, `TARGETS_PREFLIGHT_PATH="/targets/preflight"`, `INSTALL_MANIFEST_PATH="/install/{agent_token}"`, `COMMANDS_PATH="/commands"`, `COMMAND_STATUS_PATH="/commands/{command_id}"`, `APPROVAL_GRANT_PATH="/approvals/{approval_id}/grant"`, `APPROVAL_REJECT_PATH="/approvals/{approval_id}/reject"`, `DEAD_LETTERS_PATH="/dead-letters"`, `DEAD_LETTER_REPLAY_PATH="/dead-letters/{dead_letter_id}/replay"`, `AI_CONVERSATIONS_PATH="/ai/conversations"`, `AI_CONVERSATION_PATH="/ai/conversations/{conversation_id}"`, `AI_CONVERSATION_MESSAGES_PATH="/ai/conversations/{conversation_id}/messages"`, `ORGS_PATH="/orgs"`, `ORG_PATH="/orgs/{org_id}"`, `GROUPS_PATH="/groups"`, `GROUP_PATH="/groups/{group_id}"`, `GROUP_MEMBERS_PATH="/groups/{group_id}/members"`, `GROUP_MEMBER_PATH="/groups/{group_id}/members/{user_id}"`, `USERS_PATH="/users"`, `ALERT_CHANNELS_PATH="/alert-channels"`, `ALERT_CHANNEL_PATH="/alert-channels/{channel_id}"`, `ALERT_CHANNEL_TEST_PATH="/alert-channels/test"`, `ACCESS_PATH="/access"`, `ACCESS_ITEM_PATH="/access/{access_id}"`, `APPLICATIONS_PATH="/applications"`, `APPLICATION_CONNECT_PATH="/applications/connect"`, `APPLICATION_PATH="/applications/{application_id}"`, `APPLICATION_DEPLOYMENTS_PATH="/applications/{application_id}/deployments"`, `APPLICATION_RUNS_PATH="/applications/{application_id}/runs"`, `REPOSITORY_DISCOVERY_PROBE_PATH="/repositories/discovery/probe"`, `REPOSITORY_DISCOVERY_BRANCHES_PATH="/repositories/discovery/branches"`, `REPOSITORY_DISCOVERY_MANIFESTS_PATH="/repositories/discovery/manifests"`, `REPOSITORY_DISCOVERY_VALIDATE_PATH="/repositories/discovery/validate"`, `REPOS_VALIDATE_PATH="/repos/validate"`, `REPOS_BRANCHES_PATH="/repos/branches"`, `REPOS_MANIFESTS_PATH="/repos/manifests"`, `CATALOG_ITEMS_PATH="/catalog/items"`, `CATALOG_ITEM_PATH="/catalog/items/{item_id}"`, `CATALOG_ITEM_INSTALLS_PATH="/catalog/items/{item_id}/installs"`, `AGENT_COMMAND_POLL_PATH="/agent/commands/poll"`, `AGENT_COMMAND_START_PATH="/agent/commands/{command_id}/start"`, `AGENT_COMMAND_HEARTBEAT_PATH="/agent/commands/{command_id}/heartbeat"`, `AGENT_COMMAND_RESULT_PATH="/agent/commands/{command_id}/result"`, `AGENT_EVIDENCE_JOB_SCHEDULE_PATH="/agent/evidence/jobs"`, `AGENT_EVIDENCE_JOB_POLL_PATH="/agent/evidence/jobs/poll"`, `AGENT_EVIDENCE_JOB_RESULT_PATH="/agent/evidence/jobs/{job_id}/result"`, `AGENT_INVENTORY_SNAPSHOTS_PATH="/agent/inventory/snapshots"`, `AGENT_POLICY_PATH="/agent/policy"`, `AGENT_POLICY_STATUS_PATH="/agent/policy/status"`, `AGENT_RECONCILE_STATUS_PATH="/agent/reconcile/status"`, `AGENT_DEBUG_QUERY_PATH="/agent/debug/query"`, `CLUSTERS_PATH="/clusters"`, `CLUSTER_PATH="/clusters/{cluster_id}"`, `CLUSTER_CONNECTION_STATUS_PATH="/clusters/{cluster_id}/connection-status"`, `CLUSTER_NODES_SUMMARY_PATH="/clusters/{cluster_id}/nodes/summary"`, `CLUSTER_NODE_PODS_SUMMARY_PATH="/clusters/{cluster_id}/nodes/{node_name}/pods/summary"`, `CLUSTER_INVENTORY_RESOURCES_PATH="/clusters/{cluster_id}/inventory/resources"`, `CLUSTER_INVENTORY_RESOURCE_DETAIL_PATH="/clusters/{cluster_id}/inventory/resource-detail"`, `CLUSTER_INVENTORY_SUMMARY_PATH="/clusters/{cluster_id}/inventory/summary"`, `CLUSTER_INVENTORY_WORKLOADS_PATH="/clusters/{cluster_id}/inventory/workloads"`, `CLUSTER_INVENTORY_SERVICES_PATH="/clusters/{cluster_id}/inventory/services"`, `CLUSTER_INVENTORY_EVENTS_PATH="/clusters/{cluster_id}/inventory/events"`, `CLUSTER_USAGE_PATH="/clusters/{cluster_id}/usage"`, `CLUSTER_METRIC_QUERY_PRESETS_PATH="/clusters/{cluster_id}/metric-query-presets"`, `CLUSTER_METRIC_QUERY_PRESET_PATH="/clusters/{cluster_id}/metric-query-presets/{preset_id}"`, `CLUSTER_METRIC_QUERY_PRESET_RUN_PATH="/clusters/{cluster_id}/metric-query-presets/{preset_id}/run"`, `CLUSTER_METRIC_WIDGETS_PATH="/clusters/{cluster_id}/metric-widgets"`, `CLUSTER_METRIC_WIDGET_PATH="/clusters/{cluster_id}/metric-widgets/{widget_id}"`, `METRICS_VALIDATE_PATH="/metrics/validate"`, `CLUSTER_DEPLOYMENT_SCALE_PATH="/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/scale"`, `CLUSTER_DEPLOYMENT_RESTART_PATH="/clusters/{cluster_id}/namespaces/{namespace}/deployments/{deployment}/restart"`, `CLUSTER_POLICY_PATH="/clusters/{cluster_id}/policy"`, `PROVIDERS_CATALOG_PATH="/providers/catalog"`, `PROVIDERS_CLUSTER_DISCOVERY_PATH="/providers/cluster-discovery"`, `PROVIDERS_VALIDATE_PATH="/providers/validate"`, `DASHBOARD_RCA_TIMELINE_PATH="/dashboard/rca/timeline"`, `DASHBOARD_RCA_INCIDENT_PATH="/dashboard/rca/incidents/{incident_id}"`, `FLEET_SUMMARY_PATH="/fleet/summary"`, `CLUSTER_SUMMARY_PATH="/clusters/{cluster_id}/summary"`, `RCA_RULES_VALIDATE_PATH="/rca/rules/validate"`, `RCA_RECOVERY_PLAN_BY_CORRELATION_PATH="/rca/recovery-plans/by-correlation/{correlation_id}"`, `RCA_RECOVERY_ACTION_SELECT_PATH="/rca/recovery-plans/{plan_id}/actions/{action_id}/select"`.

제품 연결 위자드가 추가로 사용하는 경로는 `CLUSTERS_CONNECT_PATH="/clusters/connect"`, `CLUSTER_CONNECTION_PATH="/clusters/{cluster_id}/connection"`이다.

Resources 물리 뷰의 additive 경로는 `TOPOLOGY_PATH="/topology"`다. `view=physical`과 정확히 한
개의 `clusters`가 필요하며, 다른 view는 후속 계약(BQ-075) 전까지 422로 닫는다.

Resources 스파크라인 batch 경로는 `RESOURCE_METRICS_HISTORY_PATH="/metrics/history"`다.
`ids`는 `/resources`의 pod `inventory_key` 목록이며 common filter와 pinned snapshot cut에서
서버가 권한 교집합을 재검증한다.

경로 포맷 헬퍼:
```python
def agent_command_result_path(command_id: str) -> str
def agent_command_start_path(command_id: str) -> str
def agent_command_heartbeat_path(command_id: str) -> str
def agent_evidence_job_result_path(job_id: str) -> str
def dashboard_rca_incident_path(incident_id: str) -> str
```

### `gateway/__init__.py`

`routes` 모듈, `Gateway`, 그리고 requests/responses 중 일부를 re-export 한다(`__all__` 명시). requests 에서: `AgentConnectRequest`, `AgentEvidenceRequest`, `AgentPolicy`, `AgentPolicyResponse`, `AgentPolicyStatusRequest`, `AgentReconcileStatusRequest`, `ApprovalDecisionRequest`, `CommandRequest`, `CommandResultRequest`, `CommandStartRequest`, `GitHubWebhookRequest`, `LoginRequest`, `ResendEmailVerificationRequest`, `SignupRequest`. responses 에서: `AcceptedEventResponse`, `AcceptedResponse`, `AgentCommandPollResponse`, `AuthSessionResponse`, `CommandStartedResponse`, `DeadLetterReplayResponse`, `DeadLettersResponse`, `EmailVerificationResponse`, `EventIdAcceptedResponse`, `HealthResponse`, `LogoutResponse`, `RcaIncidentResponse`, `RcaTimelineItem`, `RcaTimelineResponse`, `TargetInstallResponse`, `UserApprovalResponse`. 나머지 모델은 각 모듈에서 직접 import.

---

## 하위 모듈: `gitops/`

### `gitops/__init__.py`

GitOps 도메인 상태 enum·기본값·지원 K8s 리소스 계약. 관련 도메인: [gitops](../domains/gitops.md).

Enum (`StrEnum`, 앵커 `src/packages/contracts/gitops/__init__.py :: <이름>`):

| Enum | 멤버(값) |
|---|---|
| `GitProvider` | `GITHUB="github"` |
| `RepositoryStatus` | `ACTIVE="active"`, `INVALID_CREDENTIAL="invalid_credential"`, `DISABLED="disabled"` |
| `WatchTargetStatus` | `ACTIVE="active"`, `PAUSED="paused"` |
| `DeploymentBindingStatus` | `ACTIVE="active"`, `PAUSED="paused"`, `INVALID_CONFIG="invalid_config"` |
| `ManifestArtifactStatus` | `RENDERED="rendered"`, `INVALID_CONFIG="invalid_config"` |
| `ApplicationStatus` | `ACTIVE="active"`, `PAUSED="paused"`, `ARCHIVED="archived"` |
| `WorkflowRunStatus` | `STARTED="started"`, `RENDERING="rendering"`, `DIFFING="diffing"`, `POLICY_CHECKING="policy_checking"`, `WAITING_FOR_APPROVAL="waiting_for_approval"`, `APPLYING="applying"`, `ROLLOUT_WAITING="rollout_waiting"`, `SUCCEEDED="succeeded"`, `FAILED="failed"` |
| `WorkflowStepName` | `GIT="git"`, `RENDER="render"`, `DIFF="diff"`, `POLICY="policy"`, `APPROVAL="approval"`, `SAFE_PR="safe_pr"`, `APPLY="apply"`, `HEALTH="health"` |
| `WorkflowStepStatus` | `PENDING="pending"`, `RUNNING="running"`, `SUCCEEDED="succeeded"`, `FAILED="failed"`, `SKIPPED="skipped"` |
| `ApprovalStatus` | `REQUESTED="requested"`, `GRANTED="granted"`, `REJECTED="rejected"`, `EXPIRED="expired"`, `NOT_REQUIRED="not_required"` |
| `ResourceClass` | `APPLICATION="application"`, `PLATFORM="platform"`, `SYSTEM="system"` |

- `src/packages/contracts/gitops/__init__.py :: KubernetesResourceContract` — `@dataclass(frozen=True)`: `api_version: str`, `kind: str`, `api_prefix: str`, Kubernetes resource collection name, `namespaced: bool = True`.
- `src/packages/contracts/gitops/__init__.py :: SUPPORTED_KUBERNETES_RESOURCES` — `dict[tuple[str, str], KubernetesResourceContract]`. 등록: `("apps/v1","Deployment")` → `api_prefix="/apis/apps/v1"`, collection name `"deployments"`; `("v1","Service")` → `api_prefix="/api/v1"`, collection name `"services"`; `("v1","ConfigMap")` → `api_prefix="/api/v1"`, collection name `"configmaps"`.
- `src/packages/contracts/gitops/__init__.py :: supported_kubernetes_resource`
```python
def supported_kubernetes_resource(api_version: str, kind: str) -> KubernetesResourceContract
```
미지원 조합이면 `ValueError(f"unsupported manifest kind: {api_version}/{kind}")`.

- `src/packages/contracts/gitops/__init__.py :: promotion_gate_from_command_result(result)` — 자동 승격과 API 투영이 함께 쓰는 단일 판정 계약. `status == "completed"`, `applied is not False`, 실패 resource 0건, `rollout.ready is not False`를 모두 만족할 때만 `eligible=true`. `applied`·`rollout.ready` 미제공은 현행 worker 의미를 보존해 각각 `*_not_false=true`, 공개 값은 `null`이다.

상수: `DEFAULT_REPOSITORY_ID=""`, `DEFAULT_WATCH_TARGET_ID=""`, `DEFAULT_DEPLOYMENT_BINDING_ID=""`, `DEFAULT_APPLICATION_ID=""`, `DEFAULT_WORKFLOW_RUN_ID=""`, `DEFAULT_ENVIRONMENT="sandbox"`, `DEFAULT_REPO_REF=""`, `DEFAULT_REPO_BRANCH="main"`, `DEFAULT_MANIFEST_PATH="deploy.yaml"`, `GITHUB_TOKEN_ENV="GITHUB_TOKEN"`, `GITHUB_TOKEN_REF_ENV="GITHUB_TOKEN_REF"`, `GITHUB_API_BASE_ENV="GITHUB_API_BASE"`, `DEFAULT_GITHUB_API_BASE="https://api.github.com"`, `GITHUB_WEB_BASE_ENV="GITHUB_WEB_BASE"`(owner/name 축약 repo_ref 의 clone URL 웹 호스트, GitHub Enterprise 는 이 env 로 교체), `DEFAULT_GITHUB_WEB_BASE="https://github.com"`.

### `gitops/renderer.py`

- `src/packages/contracts/gitops/renderer.py :: ManifestRenderer` — `Protocol`: `def render(self, manifest: Any) -> Any`. `Manifest` 값 객체 → `RenderedManifest` 변환 전략(실 타입은 `domains.gitops.events`).

---

## 하위 모듈: `scm/`

- `src/packages/contracts/scm/provider.py :: ScmProvider` — `Protocol`: `async def create_pull_request(self, request: Any, ctx: Any) -> str`. safe PR 생성 outbound 경계 전략 — 성공 시 PR URL 반환. `request` 는 실제로 `domains.scm.events.SafePrRequestedBody`, `ctx` 는 `EventContext`. `scm/__init__.py` 는 `ScmProvider` 만 re-export. 관련 도메인: [scm](../domains/scm.md).

---

## 모듈: `auth.py`

- `src/packages/contracts/auth.py :: Actor` — `@dataclass(frozen=True)`. 요청 주체(로그인 구현과 독립적인 내부 표현).

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `user_id` | `str` | (필수) | 사용자 ID |
| `roles` | `tuple[str, ...]` | `(ServiceRole.SERVICE_ADMIN.value,)` | 역할 목록 |

메서드: `def to_body(self) -> dict[str, object]` — `{"user_id": ..., "roles": list(self.roles)}`.

---

## 모듈: `identity.py`

권한·역할 계약. 관련 도메인: [identity](../domains/identity.md).

### Enum (`StrEnum`)

- `src/packages/contracts/identity.py :: ServiceRole` — `SERVICE_ADMIN="service_admin"`, `USER="user"`.
- `src/packages/contracts/identity.py :: OrganizationRole` — `OWNER="owner"`, `ADMIN="admin"`, `MEMBER="member"`.
- `src/packages/contracts/identity.py :: GroupRole` — `MANAGER="manager"`, `MEMBER="member"`.
- `src/packages/contracts/identity.py :: ResourceRole` — `OBSERVER="observer"`, `RELEASE_OPERATOR="release_operator"`, `INCIDENT_OPERATOR="incident_operator"`, `CLUSTER_STEWARD="cluster_steward"`.
- `src/packages/contracts/identity.py :: Permission` — 40개 멤버: `SERVICE_MANAGE="service.manage"`, `SERVICE_AUDIT_READ="service.audit.read"`, `ORGANIZATION_CREATE="organization.create"`, `ORGANIZATION_DELETE="organization.delete"`, `ORGANIZATION_STATUS_MANAGE="organization.status.manage"`, `ORGANIZATION_OWNER_ASSIGN="organization.owner.assign"`, `ORGANIZATION_MEMBER_MANAGE="organization.member.manage"`, `ORGANIZATION_POLICY_MANAGE="organization.policy.manage"`, `GROUP_CREATE="group.create"`, `GROUP_MEMBER_MANAGE="group.member.manage"`, `RESOURCE_ASSIGN="resource.assign"`, `RESOURCE_ROLE_GRANT="resource.role.grant"`, `PROFILE_READ="profile.read"`, `CLUSTER_READ="cluster.read"`, `INVENTORY_READ="inventory.read"`, `DASHBOARD_READ="dashboard.read"`, `DASHBOARD_MANAGE="dashboard.manage"`, `EVIDENCE_READ="evidence.read"`, `RCA_READ="rca.read"`, `MANIFEST_READ="manifest.read"`, `APPLICATION_READ="application.read"`, `APPLICATION_MANAGE="application.manage"`, `DEPLOYMENT_READ="deployment.read"`, `DEPLOY_RUN="deploy.run"`, `WORKLOAD_SCALE="workload.scale"`, `IMAGE_UPDATE="image.update"`, `CONFIG_UPDATE="config.update"`, `RESTART_RUN="restart.run"`, `ROLLBACK_RUN="rollback.run"`, `INCIDENT_RESPOND="incident.respond"`, `CATALOG_READ="catalog.read"`, `CATALOG_INSTALL="catalog.install"`, `STACK_READ="stack.read"`, `STACK_PLAN="stack.plan"`, `STACK_APPLY="stack.apply"`, `RUNNER_JOB_READ="runner_job.read"`, `RUNNER_JOB_CANCEL="runner_job.cancel"`, `CLUSTER_POLICY_MANAGE="cluster.policy.manage"`, `CLUSTER_ROLE_MANAGE="cluster.role.manage"`, `DANGEROUS_ACTION_APPROVE="dangerous_action.approve"`.
- `src/packages/contracts/identity.py :: UserStatus` — `ACTIVE="active"`, `PENDING_EMAIL_VERIFICATION="pending_email_verification"`, `PENDING_APPROVAL="pending_approval"`.
- `src/packages/contracts/identity.py :: WorkspaceStatus` — `ACTIVE="active"`.
- `src/packages/contracts/identity.py :: AccessResourceType` — `REPOSITORY="repository"`, `CLUSTER="cluster"`, `NAMESPACE="namespace"`, `WORKLOAD="workload"`, `APPLICATION="application"`, `ENVIRONMENT="environment"`, `DEPLOYMENT="deployment"`, `DEPLOYMENT_BINDING="deployment_binding"`, `MANIFEST_PATH="manifest_path"`, `CATALOG_ITEM="catalog_item"`, `STACK="stack"`, `RUNNER_JOB="runner_job"`, `INCIDENT="incident"`, `SYSTEM_RESOURCE="system_resource"`.
- `src/packages/contracts/identity.py :: AccessStatus` — `ACTIVE="active"`, `DISABLED="disabled"`.
- `src/packages/contracts/identity.py :: ClusterRegistrationStatus` — `REGISTERED="registered"`, `PENDING_INSTALL="pending_install"`, `INSTALL_EXPIRED="install_expired"`.

### Dataclass

- `src/packages/contracts/identity.py :: PermissionProfile` — `@dataclass(frozen=True)`: `key: str`, `label: str`, `category: str`, `scope: str`, `permissions: tuple[str, ...]`, `cannot_do: tuple[str, ...]`.
- `src/packages/contracts/identity.py :: ResourceAccessRequest` — `@dataclass(frozen=True)`: `user_id: str`, `organization_id: str`, `resource_type: str`, `resource_id: str`, `permission: str`.

### 상수

- 기본 ID: `DEFAULT_WORKSPACE_ID="default"`, `DEFAULT_WORKSPACE_NAME="Default Workspace"`, `DEFAULT_ORGANIZATION_ID="default"`, `DEFAULT_ORGANIZATION_NAME="Default Organization"`, `DEFAULT_GROUP_ID="default-operations"`, `DEFAULT_GROUP_NAME="Default Operations"`, `GLOBAL_ROLE_POLICY_ORGANIZATION_ID="__global__"`.
- 권한 집합(누적 구조):
  - `OBSERVABILITY_PERMISSIONS: frozenset[str]` = {cluster.read, inventory.read, dashboard.read, evidence.read, rca.read, manifest.read, application.read, deployment.read, catalog.read, stack.read, runner_job.read}.
  - `RELEASE_PERMISSIONS` = `OBSERVABILITY_PERMISSIONS` ∪ {dashboard.manage, application.manage, deploy.run, workload.scale, image.update, config.update, catalog.install, stack.plan}.
  - `INCIDENT_PERMISSIONS` = `RELEASE_PERMISSIONS` ∪ {restart.run, rollback.run, incident.respond, runner_job.cancel}.
  - `CLUSTER_STEWARD_PERMISSIONS` = `INCIDENT_PERMISSIONS` ∪ {stack.apply, cluster.policy.manage, cluster.role.manage, dangerous_action.approve}.
- 역할→권한 매핑:
  - `RESOURCE_ROLE_PERMISSIONS: dict[str, frozenset[str]]` — observer→OBSERVABILITY, release_operator→RELEASE, incident_operator→INCIDENT, cluster_steward→CLUSTER_STEWARD.
  - `ORGANIZATION_ROLE_PERMISSIONS` — owner→{organization.delete, organization.status.manage, organization.owner.assign, organization.member.manage, organization.policy.manage, group.create, resource.assign}, admin→{organization.member.manage, group.create, resource.assign}, member→{profile.read}.
  - `GROUP_ROLE_PERMISSIONS` — manager→{group.member.manage, resource.role.grant}, member→{profile.read}.
  - `SERVICE_ROLE_PERMISSIONS` — service_admin→모든 `Permission` 값, user→{profile.read}.
- `PLATFORM_RESOURCE_TYPES: tuple[str, ...]` — (cluster, namespace, workload, application, environment, deployment, deployment_binding, manifest_path, catalog_item, stack, runner_job, incident) 순서 고정.
- `ROLE_PROFILES: tuple[PermissionProfile, ...]` — 9개 프로필(순서·라벨·cannot_do 고정): service_admin("서비스 최고 관리자", category=service, scope=service, cannot_do=("감사 로그 없이 운영 작업 수행",)), owner("조직 소유자", organization/organization, ("다른 조직 접근","리소스 역할 없이 클러스터 작업")), admin("조직 관리자", organization/organization, ("조직 삭제","조직 소유자 지정","리소스 역할 없이 클러스터 작업")), manager("그룹 관리자", group/group, ("자기 권한 승격","조직 전체 관리","클러스터 작업 자동 획득")), member("조직 구성원", base/organization, ("기본 클러스터 접근","멤버/그룹/권한 관리")), observer("관측 담당", resource/cluster, ("배포","수정","삭제","위험 작업")), release_operator("배포 담당", resource/cluster, ("삭제","위험 명령","권한 관리")), incident_operator("운영 담당", resource/cluster, ("클러스터 권한 부여/회수","조직/그룹 관리")), cluster_steward("클러스터 책임자", resource/cluster, ("조직 멤버 관리","그룹 자체 관리")). 각 `permissions` 는 해당 매핑의 `tuple(sorted(...))`.
- `DEFAULT_ROLE_PERMISSION_ROWS: tuple[tuple[str, str, str, str, str], ...]` — `(GLOBAL_ROLE_POLICY_ORGANIZATION_ID, resource_type, role, permission, AccessStatus.ACTIVE.value)` 을 `PLATFORM_RESOURCE_TYPES × RESOURCE_ROLE_PERMISSIONS(권한 sorted)` 전개로 생성.

### 함수

- `src/packages/contracts/identity.py :: resource_role_allows_permission`
```python
def resource_role_allows_permission(role: str, permission: str) -> bool
```
`Permission(permission)`·`ResourceRole(role)` 로 값 정규화 후 `RESOURCE_ROLE_PERMISSIONS` 조회(미지 값이면 enum 변환 단계에서 `ValueError`).

---

## 모듈: `interfaces.py`

플랫폼 인프라 능력 Protocol 모음.

- `src/packages/contracts/interfaces.py :: CommandRecord` — `dict[str, Any]` 별칭.
- `src/packages/contracts/interfaces.py :: EventProcessingRecord` — `@dataclass(frozen=True)`: `status: str`, `attempts: int`.
- `src/packages/contracts/interfaces.py :: InitializableStore` — `Protocol`: `def init(self) -> None`.
- `src/packages/contracts/interfaces.py :: EventProcessingStore` — `Protocol(EventRecorder)`:
```python
def begin_event_processing(self, evt: EventEnvelope, consumer: str) -> EventProcessingRecord
def finish_event_processing(self, evt: EventEnvelope, consumer: str) -> None
def fail_event_processing(self, evt: EventEnvelope, consumer: str, error: str, status: str) -> None
def unit_of_work(self) -> AbstractContextManager[Any]        # 트랜잭션 컨텍스트
def stage_events(self, conn: Any, events: list[EventEnvelope]) -> None  # outbox 적재
```
- `src/packages/contracts/interfaces.py :: DeadLetterStore` — `Protocol`:
```python
def record_dead_letter(self, evt: EventEnvelope, consumer: str, error: str, attempts: int) -> JsonObject
def record_raw_dead_letter(self, raw: bytes, consumer: str, error: str) -> JsonObject
def list_dead_letters(self, limit: int) -> list[JsonObject]
def get_dead_letter(self, dead_letter_id: int) -> JsonObject | None
def mark_dead_letter_replayed(self, dead_letter_id: int, replay_event_id: str) -> bool
```
- `src/packages/contracts/interfaces.py :: UserStore` — `Protocol`:
```python
def get_user_by_email(self, email: str) -> JsonObject | None
def create_user(self, user_id: str, email: str, password_hash: str, display_name: str, status: str, role: str) -> JsonObject | None
def complete_email_verification(self, user_id: str) -> JsonObject | None
def approve_user(self, user_id: str, workspace_id: str) -> JsonObject | None
def get_default_workspace_id_for_user(self, user_id: str) -> str | None
def grant_resource_access(self, payload: JsonObject) -> JsonObject
def can_access(self, user_id: str, organization_id: str, resource_type: str, resource_id: str, permission: str) -> bool
def user_has_resource_access(self, user_id: str, workspace_id: str, resource_type: str, resource_id: str, action: str) -> bool
def accessible_resource_ids(self, user_id: str, workspace_id: str, resource_type: str, action: str) -> set[str] | None
```
- `src/packages/contracts/interfaces.py :: SessionStore` — `Protocol` (전부 async):
```python
async def create_session(self, user_id: str, roles: list[str] | None = None, workspace_id: str | None = None) -> Any
async def get_session(self, token: str | None) -> Any | None
async def delete_session(self, token: str) -> None
async def check_rate_limit(self, key: str, limit: int | None = None, window_seconds: int | None = None) -> None
async def check_escalating_rate_limit(self, key: str, limit: int, window_seconds: int, lock_steps_seconds: tuple[int, ...], strike_ttl_seconds: int) -> None
async def create_email_verification_token(self, user_id: str, email: str) -> str
async def consume_email_verification_token(self, token: str | None) -> JsonObject | None
```
- `src/packages/contracts/interfaces.py :: ManagementPlaneClient` — `Protocol` (cluster-agent → management plane, 전부 async):
```python
async def register_agent(self, cluster_id: str, agent_id: str, capabilities: list[str]) -> None
async def poll_command(self, cluster_id: str, workspace_id: str, agent_id: str, timeout_seconds: int) -> CommandRecord | None
async def start_command(self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str) -> None
async def heartbeat_command(self, command_id: str, cluster_id: str, workspace_id: str, lease_id: str, agent_id: str) -> None
async def complete_command(self, command_id: str, workspace_id: str, lease_id: str, agent_id: str, result: JsonObject) -> None
async def schedule_evidence_jobs(self, source_id: str, window_start: str, provider_keys: list[str]) -> JsonObject
async def poll_evidence_job(self, provider_key: str, agent_id: str, timeout_seconds: int) -> JsonObject | None
async def complete_evidence_job(self, job_id: str, agent_id: str, lease_id: str, status: str, result: JsonObject, error: str) -> JsonObject
async def record_inventory_snapshot(self, payload: JsonObject) -> JsonObject
async def fetch_policy(self, cluster_id: str, generation: int) -> JsonObject | None
async def report_policy_status(self, status: JsonObject) -> None
async def report_reconcile_status(self, status: JsonObject) -> None
```
- `src/packages/contracts/interfaces.py :: OutboxReader` — `Protocol`:
```python
async def unsent_events(self, limit: int, source: str | None) -> list[EventEnvelope]
async def mark_events_sent(self, event_ids: list[str]) -> None
async def mark_events_dead_lettered(self, events: list[EventEnvelope], consumer: str, error: str) -> None
```

---

## 모듈: `realtime.py`

Realtime 계약(`realtime.v1`) — cluster-agent → realtime-gateway → browser fan-out. 관련 서비스: [realtime-gateway](../services/realtime-realtime-gateway.md), [cluster-agent](../services/target-cluster-agent.md).

경계 원칙: node-collector 는 이 경로에 불참(`/metrics` 는 Prometheus scrape 가 정식 경로). agent 의 live summary 는 raw metric 이 아닌 **bounded 요약**(상한을 계약으로 강제). 메시지는 `StrictModel`(extra 금지) — 계약 밖 필드는 즉시 검증 실패.

상수:

| 상수 | 값 | 의미 |
|---|---|---|
| `REALTIME_PROTOCOL` | `"realtime.v1"` | 프로토콜 식별자 |
| `AGENT_LIVE_PATH` | `"/live/agent"` | agent WebSocket 경로(producer/gateway 공용 계약, 중복 리터럴 금지) |
| `BROWSER_LIVE_PATH` | `"/live/browser"` | browser WebSocket 경로 |
| `STATE_CLUSTERS_KEY` | `"clusters"` | snapshot.state 구조 키 |
| `STATE_RESOURCES_KEY` | `"resources"` | 〃 |
| `MAX_HOT_PODS` | `20` | live summary hot pod 상한 |
| `MAX_WINDOW_MS` | `60_000` | 요약 window 상한 |
| `BROWSER_QUEUE_MAX` | `32` | browser fan-out 큐 상한(느린 client 는 밀린 메시지 버리고 snapshot 복구) |
| `DELTA_KEY_SEGMENTS` | `4` | resource.delta key 조각 수 |

타입 별칭: `RolloutPhase = Literal["idle", "progressing", "degraded"]`, `DeltaOp = Literal["replace", "remove"]`.

모델(모두 `StrictModel`, 앵커 `src/packages/contracts/realtime.py :: <이름>`):

- `HotPod` — 주의가 필요한 pod 1개: `namespace: str`(`min_length=1`), `pod: str`(`min_length=1`), `cpu_ratio: float | None = None`(`ge=0.0`), `restart_count: int = 0`(`ge=0`), `ready: bool = True`.
- `LiveSummary` — agent 주기 송신 클러스터 요약: `cluster_id: str`(`min_length=1`), `window_ms: int = 1000`(`ge=0, le=MAX_WINDOW_MS`), `pods_ready: int = 0`(`ge=0`), `pods_total: int = 0`(`ge=0`), `restart_delta: int = 0`(`ge=0`), `rollout_phase: RolloutPhase = "idle"`, `hot_pods: list[HotPod] = []`(`max_length=MAX_HOT_PODS`).
- `Subscription` — browser 구독 필터(빈 문자열 = 전체 허용): `workspace_id: str`(`min_length=1`), `cluster_id: str = ""`, `namespace: str = ""`, `app: str = ""`.
- `HelloMessage` — `type: Literal["hello"] = "hello"`, `protocol: str = REALTIME_PROTOCOL`.
- `SnapshotMessage` — 접속(또는 overflow 복구) 시 1회 전송되는 최신 상태 전체: `type: Literal["snapshot"] = "snapshot"`, `seq: int = 0`(`ge=0`), `state: dict[str, Any] = {}`.
- `LiveSummaryMessage` — agent→gateway ingest 및 gateway→browser fan-out 공용(seq 는 gateway 부여): `type: Literal["live.summary"] = "live.summary"`, `seq: int = 0`(`ge=0`), `cluster_id: str`(`min_length=1`), `summary: LiveSummary`.
- `ResourceDelta` — 개별 리소스 변경 1건(key = `"<cluster>/<namespace>/<kind>/<name>"`): `type: Literal["resource.delta"] = "resource.delta"`, `seq: int = 0`(`ge=0`), `op: DeltaOp = "replace"`, `key: str`(`min_length=1`), `value: dict[str, Any] | None = None`.
- `PingMessage` — `type: Literal["ping"] = "ping"`, `ts: float`.

- `src/packages/contracts/realtime.py :: RealtimeMessage` — `Annotated[HelloMessage | SnapshotMessage | LiveSummaryMessage | ResourceDelta | PingMessage, Field(discriminator="type")]` union 타입.
- `src/packages/contracts/realtime.py :: RealtimeEnvelope` — `TypeAdapter[RealtimeMessage]`. 수신 payload 검증의 단일 진입점(수동 dict 검사 금지).
- `src/packages/contracts/realtime.py :: parse_realtime_message`
```python
def parse_realtime_message(payload: Any) -> RealtimeMessage   # RealtimeEnvelope.validate_python
```
- `src/packages/contracts/realtime.py :: delta_key_parts`
```python
def delta_key_parts(key: str) -> tuple[str, str, str, str]
```
`key.split("/", 3)` 후 부족한 조각은 빈 문자열로 채워 `(cluster, namespace, kind, name)` 반환.

---

## 모듈: `security.py`

- `src/packages/contracts/security.py :: SecretRef` — `@dataclass(frozen=True)`: `value: str`. Raw secret 대신 경계를 지나는 참조값.
- `src/packages/contracts/security.py :: SecretVaultPort` — `Protocol`: `def read_secret(self, ref: SecretRef) -> str`.
- `src/packages/contracts/security.py :: TokenVaultPort` — `Protocol`: `def read_token(self, ref: SecretRef) -> str`.

구현은 [security](security.md).

---

## 모듈: `stores.py`

워커가 `ctx.db` 로 보는 **능력별 store Protocol(전부 async)**. `ctx.db` 는 `AsyncDb`([runtime](runtime.md)) 로 감싸져 모든 메서드가 async. 핸들러가 `ctx: EventContext[RcaStore]` 로 받으면 타입체커가 그 store 의 메서드만 노출한다(다른 서비스 DB 능력 은닉).

앵커는 모두 `src/packages/contracts/stores.py :: <이름>`:

- `RcaStore`:
```python
async def save_evidence(self, correlation_id: str, workspace_id: str, kind: str, body: JsonObject) -> None
async def save_rca_report(self, correlation_id: str, workspace_id: str, root_cause: str, action: str, body: JsonObject) -> None
async def find_recent_rca_report(self, workspace_id: str, root_cause: str, resource_key: str, window_seconds: int) -> JsonObject | None
```
- `RcaBacklogStore`:
```python
async def upsert_rca_backlog_item(self, body: JsonObject) -> None
async def resolve_rca_backlog_item_for_rule(self, workspace_id: str, symptom: str, reason: str) -> int
```
- `RecoveryPlanStore`: `async def upsert_recovery_selection_request(self, correlation_id: str, workspace_id: str, plan: JsonObject) -> None`.
- `RepoChangeStore`:
```python
async def save_repo_change(self, correlation_id: str, commit_sha: str, manifest: JsonObject,
                           workspace_id: str = "default", repository_id: str | None = None,
                           watch_target_id: str | None = None, binding_id: str | None = None,
                           manifest_path: str | None = None) -> None
async def record_manifest_artifact(self, payload: JsonObject) -> JsonObject
async def find_rendered_manifest_artifacts(self, workspace_id: str, binding_id: str, commit_sha: str,
                                           manifest_path: str, renderer_version: str) -> list[JsonObject]
```
- `WorkflowStore`:
```python
async def upsert_application(self, payload: JsonObject) -> JsonObject
async def start_workflow_run(self, payload: JsonObject) -> JsonObject
async def update_workflow_run(self, payload: JsonObject) -> JsonObject
async def record_workflow_step(self, payload: JsonObject) -> JsonObject
async def request_workflow_approval(self, payload: JsonObject) -> JsonObject
async def resolve_workflow_approval(self, payload: JsonObject) -> JsonObject
async def attach_workflow_command(self, workflow_run_id: str, command_id: str) -> None
async def update_workflow_run_for_command(self, payload: JsonObject) -> JsonObject
async def get_workflow_identity_for_command(self, command_id: str) -> JsonObject | None
```
- `PolicyDecisionStore`: `async def request_workflow_approval(self, payload: JsonObject) -> JsonObject`, `async def resolve_workflow_approval(self, payload: JsonObject) -> JsonObject`.
- `PullRequestStore`: `async def save_pull_request(self, correlation_id: str, pr_url: str, title: str, body: str, status: str) -> None`.
- `AgentCommandStore`:
```python
async def get_workflow_approval(self, approval_id: str, workspace_id: str = "default") -> JsonObject | None
async def queue_agent_command(self, correlation_id: str, plan: JsonObject, status: str) -> None
async def fail_expired_agent_commands(self) -> list[JsonObject]
```
- `TargetReconcileStore`: `async def list_target_desired_states(self, workspace_id: str, cluster_id: str) -> list[JsonObject]`, `async def record_target_reconcile_result(self, payload: JsonObject) -> JsonObject`.
- `AuditStore`: `async def append_audit_log(self, evt: EventEnvelope) -> None`, `async def append_audit_logs(self, rows: list[JsonObject]) -> None`.
- `DashboardStore`: `async def upsert_rca_timeline(self, row: JsonObject) -> None`.
- `AiConversationStore`: `async def record_ai_response(self, payload: JsonObject) -> None`, `async def record_ai_failure(self, payload: JsonObject) -> None`.

---

## 모듈: `target.py`

- `src/packages/contracts/target.py :: TargetComponent` — `StrEnum`: `CLUSTER_AGENT="cluster-agent"`, `NODE_COLLECTOR="node-collector"`.
- `src/packages/contracts/target.py :: TargetDesiredStateStatus` — `StrEnum`: `ACTIVE="active"`.
- `src/packages/contracts/target.py :: TargetReconcileStatus` — `StrEnum`: `REQUESTED="requested"`, `IN_SYNC="in_sync"`, `DRIFTED="drifted"`, `FAILED="failed"`.
- `src/packages/contracts/target.py :: TARGET_NAMESPACE` — `= "target"`.
- `src/packages/contracts/target.py :: SANDBOX_NAMESPACE` — `= "sandbox"`.

관련 도메인: [target](../domains/target.md).

---

## 불변식·오류 (Invariants & Errors)

1. **StrictModel**: gateway/realtime 의 모든 Pydantic 모델은 `extra="forbid"` — 미지 필드는 422/ValidationError.
2. **EventBody 디코드**: 미지 필드·필수 누락·타입 불일치는 `EventBodyDecodeError`. `bool`/`int` 는 정확한 타입 검사(암묵 캐스팅 없음).
3. **봉투 버전**: 필드 추가는 기본값과 함께만, 제거/의미 변경 금지. 버전 미기재 메시지는 `schema_version=1` 로 간주.
4. **`STREAM_SUBJECTS` 자동 파생**: `EventSubject` 에 새 도메인 프리픽스를 추가하면 스트림 subject 도 자동 갱신 — 수동 목록 관리 금지.
5. **레이어 경계**: 이 패키지는 `domains` 를 정적 import 하지 않는다(`bodies/__init__.py` 의 lazy `__getattr__` 만 예외적 런타임 참조).
6. `supported_kubernetes_resource` 미지원 조합, `resource_role_allows_permission` 미지 enum 값은 `ValueError`.

## 설정 (Settings)

이 패키지가 이름만 정의하는 env 키(소비는 각 서비스):

| 키 | 정의 위치 | 의미 |
|---|---|---|
| `GITHUB_TOKEN` | `gitops/__init__.py :: GITHUB_TOKEN_ENV` | GitHub 토큰 |
| `GITHUB_TOKEN_REF` | `gitops/__init__.py :: GITHUB_TOKEN_REF_ENV` | GitHub 토큰 secret ref |
| `GITHUB_API_BASE` | `gitops/__init__.py :: GITHUB_API_BASE_ENV` | GitHub API 호스트(기본 `https://api.github.com`) |
| `GITHUB_WEB_BASE` | `gitops/__init__.py :: GITHUB_WEB_BASE_ENV` | GitHub 웹 호스트(기본 `https://github.com`) |
