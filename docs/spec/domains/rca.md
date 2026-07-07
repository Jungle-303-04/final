---
source_commit: 664925a6
status: synced
---

# rca — 증거 수신·근본원인분석(RCA)·복구 계획 도메인

> 소스: `src/domains/rca/` · 테스트: `tests/test_rca_evidence.py`, `tests/test_rca_feedback_flow.py`, `tests/test_agent_evidence_ingest.py`, `tests/test_alertmanager_webhook.py`, `tests/test_operational_event_followups.py`, `tests/test_schemas.py`

## 책임 (Responsibility)

- 클러스터 agent가 보낸 **증거(evidence)를 HTTP로 수신**하고 `cluster.evidence.received` 이벤트로 변환·중복 제거하여 이벤트 버스에 적재한다.
- 외부 모니터링(Alertmanager) **webhook을 수신**해 firing 알림을 같은 `cluster.evidence.received` 파이프라인으로 흘려 인시던트를 트리거한다(Bearer 토큰 인증, evidence-window dedup).
- RCA 파이프라인 전 구간(증거 정규화 → 장애 감지 → 근거 번들 → 원인 후보 생성/평가 → 완료/차단/후속조치 → 복구 계획/선택 → Safe PR 패치)의 **이벤트 body 계약을 정의**한다.
- 증거·RCA 리포트·RCA backlog·복구 계획을 **DB에 영속**한다(`RcaRepository`).
- 사람이 복구 후보를 **선택하는 HTTP 엔드포인트**를 제공하고, 선택 시 승인 레코드 생성 + `recovery.action_selected` 이벤트를 발행한다.
- **하지 않는 것**: 실제 RCA 분석/AI 추론(services 계층의 워커 담당), 이벤트 버스 구독 루프 실행, 복구 조치 실행.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.contracts.event_bus` | [contracts](../packages/contracts.md) | `EventBody`, `JsonObject`, `@event` 레지스트리, `EventSubject` |
| import | `packages.contracts.gitops` | [contracts](../packages/contracts.md) | `DEFAULT_APPLICATION_ID` 등 GitOps 기본값, `ApprovalStatus` |
| import | `packages.contracts.identity` | [contracts](../packages/contracts.md) | `DEFAULT_WORKSPACE_ID`, `Permission`, `ResourceRole` |
| import | `packages.contracts.auth` | [contracts](../packages/contracts.md) | `Actor` |
| import | `packages.contracts.gateway` | [contracts](../packages/contracts.md) | 라우트 경로 상수, `AgentEvidenceRequest`, `RecoveryActionSelectRequest`, `AcceptedResponse` |
| import | `packages.config.settings` | [config](../packages/config.md) | `env()` — Alertmanager webhook 토큰 조회 |
| import | `packages.events.envelope` | [events](../packages/events.md) | `event()` 봉투 생성 |
| import | `packages.runtime.dependencies` | [runtime](../packages/runtime.md) | `get_db`, `get_events` FastAPI 의존성 |
| import | `packages.storage.base` / `packages.storage.engine` | [storage](../packages/storage.md) | `Base`, 컬럼 헬퍼, `DatabaseConnection`, `unit_of_work_or_null` |
| import | `domains.identity.dependencies` | [identity](./identity.md) | `ClusterAgentIdentity`, `require_cluster_agent`, `require_session`, `require_cluster_access` |
| 발행 | `cluster.evidence.received`, `recovery.action_selected` | — | 라우터에서 직접 적재/발행 |
| 계약 정의 | RCA/recovery/safe_pr 계열 이벤트 전부 | — | services의 워커들이 이 body 정의를 사용해 발행/구독 |

## 공개 인터페이스 (Public API)

### 모듈

- `src/domains/rca/__init__.py` — 도메인 패키지 선언(심볼 없음).
- `src/domains/rca/models.py` — SQLAlchemy 테이블 4개.
- `src/domains/rca/events.py` — 이벤트 body·값 객체 dataclass 정의.
- `src/domains/rca/repository.py` — `RcaRepository` 와 복구 계획 상태 상수.
- `src/domains/rca/router.py` — FastAPI 라우터(agent evidence 수신, 복구 후보 선택).
- `src/domains/rca/query_router.py` — FastAPI 라우터(세션 워크스페이스 범위 evidence/RCA report 조회).

### repository 상수 — `src/domains/rca/repository.py`

| 심볼 | 값 | 앵커 |
|---|---|---|
| `RECOVERY_PLAN_STATUS_SELECTION_REQUESTED` | `"selection_requested"` | `src/domains/rca/repository.py :: RECOVERY_PLAN_STATUS_SELECTION_REQUESTED` |
| `RECOVERY_PLAN_STATUS_SELECTED` | `"selected"` | `src/domains/rca/repository.py :: RECOVERY_PLAN_STATUS_SELECTED` |
| `OPEN_RECOVERY_PLAN_STATUSES` | `(RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,)` | `src/domains/rca/repository.py :: OPEN_RECOVERY_PLAN_STATUSES` |

### `RcaRepository` — `src/domains/rca/repository.py :: RcaRepository`

`packages.storage.engine :: DatabaseConnection` 상속. 모든 메서드는 `self.connection()` 컨텍스트로 실행.

| 메서드 시그니처 | 쿼리 의미 | 앵커 |
|---|---|---|
| `save_evidence(self, correlation_id: str, workspace_id: str, kind: str, body: JsonObject) -> None` | `evidence` 테이블에 단순 INSERT(pg_insert) | `src/domains/rca/repository.py :: RcaRepository.save_evidence` |
| `upsert_rca_backlog_item(self, body: JsonObject) -> None` | `rca_backlog_items`에 `backlog_id` 충돌 시 UPDATE. `missing_evidence`는 `{"items": body["missing_evidence"]}` 로 감싸 저장. 신규 INSERT 시 `occurrence_count=1`, 충돌 시 `occurrence_count + 1` 증가. `incident_id/reason/evidence_ref/missing_evidence/status/payload/updated_at` 갱신(단, `symptom/title/workspace_id/created_at`은 최초값 유지) | `src/domains/rca/repository.py :: RcaRepository.upsert_rca_backlog_item` |
| `list_rca_reports(self, workspace_id: str, *, limit: int = 5) -> list[JsonObject]` | `rca_reports`를 `workspace_id`로 필터, `created_at DESC, id DESC` 정렬, `limit` 건 조회(최신순). AI 도구 등 읽기 전용 소비자용 | `src/domains/rca/repository.py :: RcaRepository.list_rca_reports` |
| `list_evidence_records(self, workspace_id: str, *, correlation_id=None, kind=None, since=None, until=None, limit=50, offset=0) -> list[JsonObject]` | `evidence`를 `workspace_id` 필수 + 선택 필터(`correlation_id/kind`, `created_at >= since`, `created_at < until`)로 조회. `created_at DESC, id DESC` 정렬 + `limit/offset` 페이지네이션. `created_at`은 ISO 문자열로 직렬화 — `/evidence` 조회 API 용 | `src/domains/rca/repository.py :: RcaRepository.list_evidence_records` |
| `list_rca_report_records(self, workspace_id: str, *, correlation_id=None, since=None, until=None, limit=50, offset=0) -> list[JsonObject]` | `rca_reports`를 같은 방식(워크스페이스 필수, 선택 필터, 최신순, limit/offset)으로 조회. payload 요약은 라우터(`rca_report_summary`)가 수행 — `/rca-reports` 조회 API 용 | `src/domains/rca/repository.py :: RcaRepository.list_rca_report_records` |
| `upsert_recovery_selection_request(self, correlation_id: str, workspace_id: str, plan: JsonObject) -> None` | `recovery_plans`에 `(workspace_id, plan_id)` 유니크 기준 upsert. status는 `selection_requested`로 넣되, 기존 row가 이미 `selected`면 status를 **유지**(CASE 식) — 나머지 필드(`correlation_id/incident_id/evidence_ref/payload/updated_at`)는 갱신 | `src/domains/rca/repository.py :: RcaRepository.upsert_recovery_selection_request` |
| `get_recovery_plan(self, plan_id: str, workspace_id: str) -> JsonObject | None` | `recovery_plans`에서 `(plan_id, workspace_id)` 일치 1건을 dict로 반환(`plan_id, workspace_id, correlation_id, incident_id, evidence_ref, status, selected_action_id, selected_by, payload` 컬럼), 없으면 `None` | `src/domains/rca/repository.py :: RcaRepository.get_recovery_plan` |
| `select_recovery_plan_action_if_open(self, plan_id: str, workspace_id: str, action_id: str, selected_by: str) -> JsonObject | None` | status가 `OPEN_RECOVERY_PLAN_STATUSES`(= `selection_requested`)인 row만 조건부 UPDATE → `status="selected"`, `selected_action_id`, `selected_by`, `updated_at=now()`. `RETURNING payload, correlation_id`. 열려 있지 않으면(이미 selected 등) `None` — 동시 선택 경합 방지 | `src/domains/rca/repository.py :: RcaRepository.select_recovery_plan_action_if_open` |
| `save_rca_report(self, correlation_id: str, workspace_id: str, root_cause: str, action: str, body: JsonObject) -> None` | `rca_reports`에 단순 INSERT(pg_insert) | `src/domains/rca/repository.py :: RcaRepository.save_rca_report` |
| `find_recent_rca_report(self, workspace_id: str, root_cause: str, resource_key: str, window_seconds: int) -> JsonObject | None` | 리포트 dedup 조회 — `(workspace_id, root_cause, created_at >= now-window)` 최신 20건을 읽어 `payload.incident` 의 리소스 키(`rca_report_resource_key`)가 일치하는 첫 건의 `{id, correlation_id, created_at}` 반환, 없으면 `None`. rca-worker 가 저장 전에 호출해 장애 지속 중 동일 리포트 무한 적재를 막는다 | `src/domains/rca/repository.py :: RcaRepository.find_recent_rca_report` |

모듈 함수: `rca_report_resource_key(incident: JsonObject | None) -> str` —
`"{namespace}/{resource_kind}/{resource_name}"`(incident dict 아니면 `"unknown"`) —
dedup 리소스 키의 단일 출처(rca-worker 와 repository 가 공유).
앵커: `src/domains/rca/repository.py :: rca_report_resource_key`.

### 라우터 심볼 — `src/domains/rca/router.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` (prefix 없음, 게이트웨이가 마운트) | `src/domains/rca/router.py :: router` |
| `DEFAULT_EVIDENCE_SOURCE_ID` | `"cluster-snapshot"` | `src/domains/rca/router.py :: DEFAULT_EVIDENCE_SOURCE_ID` |
| `RECOVERY_PLAN_NOT_FOUND` | `"recovery plan not found"` | `src/domains/rca/router.py :: RECOVERY_PLAN_NOT_FOUND` |
| `RECOVERY_ACTION_NOT_FOUND` | `"recovery action not found"` | `src/domains/rca/router.py :: RECOVERY_ACTION_NOT_FOUND` |
| `RECOVERY_PLAN_ALREADY_RESOLVED` | `"recovery plan already resolved"` | `src/domains/rca/router.py :: RECOVERY_PLAN_ALREADY_RESOLVED` |
| `RECOVERY_SELECTION_ACCESS_DENIED` | `"recovery selection access denied"` | `src/domains/rca/router.py :: RECOVERY_SELECTION_ACCESS_DENIED` |
| `HTTP_NOT_FOUND` | `404` | `src/domains/rca/router.py :: HTTP_NOT_FOUND` |
| `HTTP_CONFLICT` | `409` | `src/domains/rca/router.py :: HTTP_CONFLICT` |
| `ALERTMANAGER_WEBHOOK_TOKEN_ENV` | `"ALERTMANAGER_WEBHOOK_TOKEN"` | `src/domains/rca/router.py :: ALERTMANAGER_WEBHOOK_TOKEN_ENV` |
| `ALERTMANAGER_SOURCE_ID` | `"alertmanager-webhook"` | `src/domains/rca/router.py :: ALERTMANAGER_SOURCE_ID` |
| `WEBHOOK_NOT_CONFIGURED` | `"alertmanager webhook is not configured"` | `src/domains/rca/router.py :: WEBHOOK_NOT_CONFIGURED` |
| `WEBHOOK_TOKEN_INVALID` | `"invalid webhook token"` | `src/domains/rca/router.py :: WEBHOOK_TOKEN_INVALID` |
| `CLUSTER_NOT_REGISTERED` | `"cluster is not registered"` | `src/domains/rca/router.py :: CLUSTER_NOT_REGISTERED` |
| `HTTP_UNAUTHORIZED` | `401` | `src/domains/rca/router.py :: HTTP_UNAUTHORIZED` |
| `HTTP_SERVICE_UNAVAILABLE` | `503` | `src/domains/rca/router.py :: HTTP_SERVICE_UNAVAILABLE` |
| `require_alertmanager_token` | `(request: Request) -> None` — `ALERTMANAGER_WEBHOOK_TOKEN` env 미설정이면 503(fail-closed), `Authorization: Bearer <token>`을 `secrets.compare_digest`로 대조해 불일치/누락이면 401 | `src/domains/rca/router.py :: require_alertmanager_token` |
| `alertmanager_evidence_key` | `(workspace_id: str, cluster_id: str, payload: AlertmanagerWebhookRequest) -> str` — firing 알림들의 `"{fingerprint}@{startsAt}"` 정렬 목록 + `groupKey`를 sha256 → `f"{workspace_id}:{cluster_id}:alertmanager:{digest[:32]}"`. 같은 그룹의 반복 통지(repeat_interval)는 같은 키로 dedup, 새 알림 추가·startsAt 변경 시 새 인시던트 | `src/domains/rca/router.py :: alertmanager_evidence_key` |
| `build_alertmanager_evidence_body` | `(workspace_id, cluster_id, payload, evidence_key) -> ClusterEvidenceReceivedBody` — firing 알림만 `metrics.alertmanager = {group_key, receiver, alerts}`로 실음. `kubernetes={}`, `logs=[]`, `traces={}`, `source_id=ALERTMANAGER_SOURCE_ID`, `window_start=min(firing startsAt)` | `src/domains/rca/router.py :: build_alertmanager_evidence_body` |
| `alertmanager_webhook` | `async (payload: AlertmanagerWebhookRequest, request: Request, cluster_id: str, workspace_id: str = DEFAULT_WORKSPACE_ID, events, db) -> AcceptedResponse` | `src/domains/rca/router.py :: alertmanager_webhook` |
| `scoped_evidence_key` | `(identity: ClusterAgentIdentity, evidence_key: str | None) -> str | None` — `evidence_key`가 falsy면 `None`, 아니면 `f"{identity.workspace_id}:{identity.cluster_id}:{evidence_key}"` | `src/domains/rca/router.py :: scoped_evidence_key` |
| `build_cluster_evidence_body` | `(payload: AgentEvidenceRequest, identity: ClusterAgentIdentity) -> ClusterEvidenceReceivedBody` — `payload.model_dump(exclude={"correlation_id"})` 후 `workspace_id/cluster_id`를 토큰 identity로 덮어쓰고 `evidence_key`를 스코프 처리 | `src/domains/rca/router.py :: build_cluster_evidence_body` |
| `agent_evidence` | `async (payload: AgentEvidenceRequest, identity: ClusterAgentIdentity = Depends(require_cluster_agent), events: Any = Depends(get_events), db: Any = Depends(get_db)) -> AcceptedResponse` | `src/domains/rca/router.py :: agent_evidence` |
| `recovery_approval_id` | `(plan_id: str, action_id: str) -> str` — `f"approval-{sha256(f'{plan_id}\|{action_id}\|recovery-action').hexdigest()[:32]}"` (결정적 승인 ID) | `src/domains/rca/router.py :: recovery_approval_id` |
| `recovery_policy_decision_ref` | `(approval_ref: str) -> str` — `f"recovery:{approval_ref}:selected"` | `src/domains/rca/router.py :: recovery_policy_decision_ref` |
| `candidate_by_action_id` | `(plan: RecoveryPlan, action_id: str) -> RecoveryActionCandidate` — 후보 목록에서 `action_id` 일치를 찾고 없으면 `HTTPException(404, RECOVERY_ACTION_NOT_FOUND)` | `src/domains/rca/router.py :: candidate_by_action_id` |
| `candidate_with_approval` | `(candidate: RecoveryActionCandidate, *, approval_ref: str, policy_decision_ref: str) -> RecoveryActionCandidate` — `dataclasses.replace`로 `draft.params`에 `approval_ref`/`policy_decision_ref` 주입한 새 후보 반환 | `src/domains/rca/router.py :: candidate_with_approval` |
| `recovery_approval_payload` | `(plan: RecoveryPlan, selected: RecoveryActionCandidate, *, workspace_id: str, approval_ref: str, policy_decision_ref: str, selected_by: str, reason: str) -> dict[str, Any]` — 워크플로 승인 레코드 payload 구성(아래 동작 참조) | `src/domains/rca/router.py :: recovery_approval_payload` |
| `select_recovery_action` | `async (plan_id: str, action_id: str, payload: RecoveryActionSelectRequest, current: Any = Depends(require_session), db: Any = Depends(get_db), events: Any = Depends(get_events)) -> AcceptedResponse` | `src/domains/rca/router.py :: select_recovery_action` |
| `db_call` | `async (func: Any, *args: Any, **kwargs: Any) -> Any` — `asyncio.to_thread(func, *args, **kwargs)` 로 동기 DB 호출을 스레드로 위임 | `src/domains/rca/router.py :: db_call` |

### 조회 라우터 심볼 — `src/domains/rca/query_router.py`

세션 워크스페이스 범위 read-only 조회 라우터. agent 토큰 가드(router.py)와 분리해 `require_session` 만 사용한다.

| 심볼 | 정의 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` (prefix 없음, 게이트웨이가 마운트) | `src/domains/rca/query_router.py :: router` |
| `DEFAULT_QUERY_LIMIT` | `50` | `src/domains/rca/query_router.py :: DEFAULT_QUERY_LIMIT` |
| `MAX_QUERY_LIMIT` | `200` | `src/domains/rca/query_router.py :: MAX_QUERY_LIMIT` |
| `HTTP_UNPROCESSABLE` | `422` | `src/domains/rca/query_router.py :: HTTP_UNPROCESSABLE` |
| `INVALID_TIMESTAMP_DETAIL` | `"must be an ISO-8601 timestamp"` | `src/domains/rca/query_router.py :: INVALID_TIMESTAMP_DETAIL` |
| `list_evidence` | `async (correlation_id, kind, since, until, limit=Query(50, ge=1, le=200), offset=Query(0, ge=0), current=Depends(require_session), db=Depends(get_db)) -> EvidenceQueryResponse` — `has_more` 판정을 위해 `limit+1` 건 조회 후 `limit` 개로 자름 | `src/domains/rca/query_router.py :: list_evidence` |
| `list_rca_reports` | `async (correlation_id, since, until, limit, offset, current, db) -> RcaReportListResponse` — 같은 페이지네이션, 항목은 `rca_report_summary` 요약 | `src/domains/rca/query_router.py :: list_rca_reports` |
| `parse_query_timestamp` | `(value: str \| None, name: str) -> datetime \| None` — ISO-8601(`Z` suffix 허용) 파싱, 실패 시 `HTTPException(422)` | `src/domains/rca/query_router.py :: parse_query_timestamp` |
| `evidence_record` | `(row: JsonObject) -> JsonObject` — `EvidenceRecordItem` 필드 매핑 | `src/domains/rca/query_router.py :: evidence_record` |
| `rca_report_summary` | `(row: JsonObject) -> JsonObject` — payload 원문 대신 `incident`/`rca_detail` 화이트리스트 필드만 추출(secret 원문 미노출) | `src/domains/rca/query_router.py :: rca_report_summary` |

### HTTP 엔드포인트

| 메서드+경로 | 요청 모델 | 응답 모델 | 권한/의존성 | 핸들러 앵커 |
|---|---|---|---|---|
| `POST /agent/evidence` (`gateway_routes.AGENT_EVIDENCE_PATH`) | `AgentEvidenceRequest` ([contracts](../packages/contracts.md)) | `AcceptedResponse` | `Depends(require_cluster_agent)` — `x-agent-token` 헤더 per-cluster 토큰, 실패 시 401. `get_events`, `get_db` | `src/domains/rca/router.py :: agent_evidence` |
| `POST /webhooks/alertmanager?cluster_id=` (`gateway_routes.ALERTMANAGER_WEBHOOK_PATH`) | query: `cluster_id: str`(필수), `workspace_id: str = "default"` + body: `AlertmanagerWebhookRequest`(Alertmanager v4 webhook, `groupKey`/`receiver`/`alerts[]`) | `AcceptedResponse` | `require_alertmanager_token` — `Authorization: Bearer` 토큰(핸들러 내부 호출). 미설정 503, 불일치 401 | `src/domains/rca/router.py :: alertmanager_webhook` |
| `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select` (`gateway_routes.RCA_RECOVERY_ACTION_SELECT_PATH`) | path: `plan_id: str`, `action_id: str` + body: `RecoveryActionSelectRequest` (`reason: str | None`, max 500자) | `AcceptedResponse` | `Depends(require_session)` (유효 세션 401 가드) + 핸들러 내부에서 `require_cluster_access(..., Permission.DEPLOY_RUN.value)` (실패 시 `RECOVERY_SELECTION_ACCESS_DENIED`). `get_db`, `get_events` | `src/domains/rca/router.py :: select_recovery_action` |

| `GET /evidence` (`gateway_routes.EVIDENCE_QUERY_PATH`) | query: `correlation_id?`, `kind?`, `since?`/`until?`(ISO-8601), `limit`(기본 50, 최대 200), `offset`(≥0) | `EvidenceQueryResponse` | `Depends(require_session)` — 세션 워크스페이스로만 범위 지정. `get_db` | `src/domains/rca/query_router.py :: list_evidence` |
| `GET /rca-reports` (`gateway_routes.RCA_REPORTS_PATH`) | query: `correlation_id?`, `since?`/`until?`, `limit`, `offset` | `RcaReportListResponse` | `Depends(require_session)` — 세션 워크스페이스로만 범위 지정. `get_db` | `src/domains/rca/query_router.py :: list_rca_reports` |

`AcceptedResponse` 스키마: `accepted: bool`, `event_id: str`, `correlation_id: str`.

## 데이터 모델 (Data Model)

컬럼 헬퍼(모두 [storage](../packages/storage.md) `packages/storage/base.py`): `text_column()` = `Text NOT NULL`, `jsonb_column()` = `JSONB NOT NULL`, `created_at_column()`/`updated_at_column()` = `TIMESTAMP(timezone=True) NOT NULL server_default=now()`.

### Evidence — `src/domains/rca/models.py :: Evidence`

`__tablename__ = "evidence"` — 수신된 원본 증거 기록.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `BigInteger` | PK, autoincrement | 대리 키 |
| `workspace_id` | `Text` | NOT NULL | 워크스페이스 ID |
| `correlation_id` | `Text` | NOT NULL | 이벤트 상관관계 ID |
| `kind` | `Text` | NOT NULL | 증거 종류 |
| `payload` | `JSONB` | NOT NULL | 증거 원문 body |
| `created_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 생성 시각 |

### RcaReport — `src/domains/rca/models.py :: RcaReport`

`__tablename__ = "rca_reports"` — RCA 완료 리포트.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `BigInteger` | PK, autoincrement | 대리 키 |
| `workspace_id` | `Text` | NOT NULL | 워크스페이스 ID |
| `correlation_id` | `Text` | NOT NULL | 이벤트 상관관계 ID |
| `root_cause` | `Text` | NOT NULL | 근본 원인 |
| `action` | `Text` | NOT NULL | 권고 조치 |
| `payload` | `JSONB` | NOT NULL | `rca.completed` body 전문 |
| `created_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 생성 시각 |

### RcaBacklogItem — `src/domains/rca/models.py :: RcaBacklogItem`

`__tablename__ = "rca_backlog_items"` — RCA rule 개선 backlog.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `backlog_id` | `Text` | PK | backlog 항목 ID(자연 키) |
| `workspace_id` | `Text` | NOT NULL | 워크스페이스 ID |
| `incident_id` | `Text` | NOT NULL | 관련 incident ID |
| `symptom` | `Text` | NOT NULL | 대표 증상 |
| `title` | `Text` | NOT NULL | backlog 제목 |
| `reason` | `Text` | NOT NULL | 생성 사유 |
| `evidence_ref` | `Text` | NOT NULL | 근거 참조 키 |
| `missing_evidence` | `JSONB` | NOT NULL | 부족 근거 목록 — `{"items": [...]}` 형태로 저장 |
| `status` | `Text` | NOT NULL | backlog 상태 |
| `occurrence_count` | `Integer` | NOT NULL | 동일 backlog 재발 횟수(upsert마다 +1) |
| `payload` | `JSONB` | NOT NULL | 원본 이벤트 payload |
| `created_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 생성 시각 |
| `updated_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 갱신 시각(upsert 시 `func.now()`) |

### RecoveryPlanRecord — `src/domains/rca/models.py :: RecoveryPlanRecord`

`__tablename__ = "recovery_plans"`, `__table_args__ = (UniqueConstraint("workspace_id", "plan_id"),)` — 복구 계획 선택 상태.

| 필드명 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `BigInteger` | PK, autoincrement | 대리 키 |
| `plan_id` | `Text` | NOT NULL, UNIQUE(workspace_id, plan_id) | 복구 계획 ID |
| `workspace_id` | `Text` | NOT NULL, UNIQUE(workspace_id, plan_id) | 워크스페이스 ID |
| `correlation_id` | `Text` | NOT NULL | 이벤트 상관관계 ID |
| `incident_id` | `Text` | NOT NULL | 관련 incident ID |
| `evidence_ref` | `Text` | NOT NULL | 근거 참조 키 |
| `status` | `Text` | NOT NULL | `selection_requested` \| `selected` (상태 머신 참조) |
| `selected_action_id` | `Text` | nullable | 선택된 복구 후보 `action_id` |
| `selected_by` | `Text` | nullable | 선택한 사용자 ID |
| `payload` | `JSONB` | NOT NULL | `RecoveryPlan` 직렬화 전문 |
| `created_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 생성 시각 |
| `updated_at` | `TIMESTAMP(tz)` | NOT NULL, server_default `now()` | 갱신 시각 |

### 이벤트 값 객체 (dataclass, `@event` 미등록 — 이벤트 body에 중첩되어 사용)

모두 `frozen=True` dataclass이며 `packages.contracts.event_bus.bodies.base :: EventBody` 상속([contracts](../packages/contracts.md)). `JsonObject`는 contracts의 JSON dict 타입 별칭.

#### Evidence — `src/domains/rca/events.py :: Evidence`

RCA 입력 증거 값 객체. (주의: `models.py`의 테이블 `Evidence`와 **이름이 같지만 다른 클래스**다.)

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | — |
| `kubernetes` | `JsonObject` | — |
| `metrics` | `JsonObject` | — |
| `logs` | `list[JsonObject]` | — |
| `traces` | `JsonObject` | — |
| `object_ref` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` (= `"default"`) |

#### IncidentRecord — `src/domains/rca/events.py :: IncidentRecord`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `incident_id` | `str` | — |
| `cluster_id` | `str` | — |
| `resource_kind` | `str` | — |
| `resource_name` | `str` | — |
| `namespace` | `str | None` | — |
| `symptom` | `str` | — |
| `severity` | `str` | — |
| `first_seen_at` | `str | None` | — |
| `summary` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `secondary_symptoms` | `list[str]` | `[]` |

#### EvidenceReference — `src/domains/rca/events.py :: EvidenceReference`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `evidence_ref` | `str` | — |
| `source` | `str` | — |
| `name` | `str` | — |
| `check_id` | `str` | — |
| `summary` | `str` | — |
| `query` | `str | None` | `None` |

#### EvidenceItem — `src/domains/rca/events.py :: EvidenceItem`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `source` | `str` | — |
| `name` | `str` | — |
| `value` | `JsonObject` | — |
| `summary` | `str` | — |
| `evidence_ref` | `str` | `""` |
| `check_id` | `str` | `""` |
| `query` | `str | None` | `None` |

메서드: `reference(self) -> EvidenceReference` — 동일 필드로 `EvidenceReference` 생성 (`src/domains/rca/events.py :: EvidenceItem.reference`).

#### EvidenceBundle — `src/domains/rca/events.py :: EvidenceBundle`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `incident_id` | `str` | — |
| `items` | `list[EvidenceItem]` | — |
| `missing_evidence` | `list[str]` | — |
| `complete` | `bool` | — |
| `missing_evidence_checks` | `list[MissingEvidenceCheck]` | `field(default_factory=list)` |

#### CauseCandidate — `src/domains/rca/events.py :: CauseCandidate`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `candidate_id` | `str` | — |
| `title` | `str` | — |
| `description` | `str` | — |
| `expected_evidence` | `list[str]` | — |
| `checks` | `list[str]` | — |
| `signals` | `list[JsonObject]` | `field(default_factory=list)` — 판별 신호 그룹(`{"id", "any_of": [fact/log_pattern/event_pattern matcher]}`). 평가 의미론은 [ai-agent 카탈로그 DSL](../services/ai-agent.md#causesloaderpy--yaml-카탈로그-로더) 참조 |
| `source` | `str` | `CAUSE_CANDIDATE_SOURCE_RULE` |

후보 출처 상수: `CAUSE_CANDIDATE_SOURCE_RULE = "rule"` (`src/domains/rca/events.py :: CAUSE_CANDIDATE_SOURCE_RULE`),
`CAUSE_CANDIDATE_SOURCE_AI_FALLBACK = "ai_fallback"` (`src/domains/rca/events.py :: CAUSE_CANDIDATE_SOURCE_AI_FALLBACK`) —
rule 엔진 후보와 ai-fallback-worker 의 LLM 후보를 구분한다.

#### CauseEvaluation — `src/domains/rca/events.py :: CauseEvaluation`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `candidate_id` | `str` | — |
| `score` | `float` | — |
| `checks` | `list[str]` | — |
| `supporting_evidence` | `list[str]` | — |
| `missing_evidence` | `list[str]` | — |
| `reason` | `str` | — |
| `supporting_evidence_refs` | `list[EvidenceReference]` | `field(default_factory=list)` |
| `missing_evidence_checks` | `list[MissingEvidenceCheck]` | `field(default_factory=list)` |

#### MissingEvidenceCheck — `src/domains/rca/events.py :: MissingEvidenceCheck`

| 필드 | 타입 |
|---|---|
| `check_id` | `str` |
| `source` | `str` |
| `status` | `str` |
| `reason` | `str` |

#### RcaReportDetail — `src/domains/rca/events.py :: RcaReportDetail`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `root_cause` | `str` | — |
| `confidence` | `float` | — |
| `selected_candidate_id` | `str` | — |
| `supporting_evidence` | `list[str]` | — |
| `missing_evidence` | `list[str]` | — |
| `reason` | `str` | — |
| `missing_evidence_checks` | `list[MissingEvidenceCheck]` | `field(default_factory=list)` |
| `supporting_evidence_refs` | `list[EvidenceReference]` | `field(default_factory=list)` |

#### RcaRuleMissing — `src/domains/rca/events.py :: RcaRuleMissing`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `incident_id` | `str` | — |
| `symptom` | `str` | — |
| `evidence_ref` | `str` | — |
| `missing_evidence` | `list[str]` | — |
| `message` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

#### HealingActionDraft — `src/domains/rca/events.py :: HealingActionDraft`

| 필드 | 타입 |
|---|---|
| `action_type` | `str` |
| `namespace` | `str` |
| `resource_kind` | `str` |
| `resource_name` | `str` |
| `reason` | `str` |
| `risk_level` | `str` |
| `dry_run` | `bool` |
| `source_evidence` | `list[str]` |
| `params` | `JsonObject` |

#### RecoveryActionCandidate — `src/domains/rca/events.py :: RecoveryActionCandidate`

| 필드 | 타입 |
|---|---|
| `action_id` | `str` |
| `title` | `str` |
| `description` | `str` |
| `draft` | `HealingActionDraft` |
| `route` | `str` |
| `rank` | `int` |
| `score` | `float` |
| `risk_level` | `str` |
| `blast_radius` | `str` |
| `approval_required` | `bool` |
| `prerequisites` | `list[str]` |
| `validation_checks` | `list[str]` |
| `rollback_plan` | `str` |
| `evidence_refs` | `list[str]` |

#### RecoveryPlan — `src/domains/rca/events.py :: RecoveryPlan`

| 필드 | 타입 |
|---|---|
| `plan_id` | `str` |
| `incident_id` | `str` |
| `evidence_ref` | `str` |
| `summary` | `str` |
| `target` | `JsonObject` |
| `recommended_action_id` | `str` |
| `execution_route` | `str` |
| `selection_required` | `bool` |
| `candidates` | `list[RecoveryActionCandidate]` |

## 이벤트 (Events)

이 도메인은 RCA 파이프라인 이벤트의 **body 계약을 정의**한다. 모든 body는 `@event(EventSubject.…)` 데코레이터로 subject 레지스트리에 등록된 `frozen` dataclass다. 라우팅 키(subject)는 `packages.contracts.event_bus.subjects :: EventSubject` 값이다([contracts](../packages/contracts.md)).

### 발행 (Publishes) — 도메인 라우터가 직접 발행

#### `cluster.evidence.received` — `src/domains/rca/events.py :: ClusterEvidenceReceivedBody`

`POST /agent/evidence` 처리 시 봉투로 만들어 outbox에 적재.

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | — |
| `kubernetes` | `JsonObject` | — |
| `metrics` | `JsonObject` | — |
| `logs` | `list[JsonObject]` | — |
| `traces` | `JsonObject` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `agent_id` | `str | None` | `None` |
| `source_id` | `str | None` | `None` |
| `window_start` | `str | None` | `None` |
| `evidence_key` | `str | None` | `None` |

#### `recovery.action_selected` — `src/domains/rca/events.py :: RecoveryActionSelectedBody`

`POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select` 성공 시 `events.accept_body`로 발행.

| 필드 | 타입 | 기본값 |
|---|---|---|
| `plan` | `RecoveryPlan` | — |
| `selected` | `RecoveryActionCandidate` | — |
| `selected_by` | `str` | — |
| `auto_selected` | `bool` | — |
| `reason` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

### 계약 정의 (Defines) — services 워커가 발행/구독하는 body

#### `incident.detected` — `src/domains/rca/events.py :: IncidentDetectedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `cluster_id` | `str` | — |
| `detected` | `bool` | — |
| `reason` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `severity` | `str | None` | `None` |
| `affected` | `list[JsonObject] | None` | `None` |
| `evidence` | `Evidence | None` | `None` |
| `incident` | `IncidentRecord | None` | `None` |

#### `evidence.built` — `src/domains/rca/events.py :: EvidenceBuiltBody`

| 필드 | 타입 |
|---|---|
| `evidence` | `Evidence` |

#### `evidence.bundle.built` — `src/domains/rca/events.py :: EvidenceBundleBuiltBody`

| 필드 | 타입 |
|---|---|
| `evidence` | `Evidence` |
| `incident` | `IncidentRecord` |
| `evidence_bundle` | `EvidenceBundle` |

#### `rca.rule_missing` — `src/domains/rca/events.py :: RcaRuleMissingBody`

| 필드 | 타입 |
|---|---|
| `rule_missing` | `RcaRuleMissing` |
| `incident` | `IncidentRecord` |

#### `rca.backlog.created` — `src/domains/rca/events.py :: RcaBacklogItemCreatedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `backlog_id` | `str` | — |
| `title` | `str` | — |
| `reason` | `str` | — |
| `evidence_ref` | `str` | — |
| `incident_id` | `str` | — |
| `symptom` | `str` | — |
| `missing_evidence` | `list[str]` | — |
| `status` | `str` | — |
| `payload` | `JsonObject` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

#### `rca.ai_fallback.requested` — `src/domains/rca/events.py :: RcaAiFallbackRequestedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `reason` | `str` | — |
| `evidence_ref` | `str` | — |
| `incident` | `IncidentRecord` | — |
| `evidence_bundle` | `EvidenceBundle` | — |
| `missing_evidence` | `list[str]` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `evidence` | `Evidence \| None` | `None` |

`evidence`는 AI fallback 결과(`rca.candidates.planned`)가 rule 경로와 같은 rca-worker 계약(evidence 필수)을
지나도록 plan-worker 가 원본 증거를 동봉하는 필드다. 소비자: ai-fallback-worker, rca-feedback-worker.

#### `rca.candidates.planned` — `src/domains/rca/events.py :: RcaCandidatesPlannedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `candidate_count` | `int` | — |
| `evidence_ref` | `str` | — |
| `candidates` | `list[CauseCandidate]` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `evidence` | `Evidence | None` | `None` |
| `incident` | `IncidentRecord | None` | `None` |
| `evidence_bundle` | `EvidenceBundle | None` | `None` |
| `rule_missing` | `RcaRuleMissing | None` | `None` |

#### `rca.candidates.evaluated` — `src/domains/rca/events.py :: RcaCandidatesEvaluatedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `candidate_count` | `int` | — |
| `evidence_ref` | `str` | — |
| `candidates` | `list[CauseCandidate]` | — |
| `evaluations` | `list[CauseEvaluation]` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `evidence` | `Evidence | None` | `None` |
| `incident` | `IncidentRecord | None` | `None` |
| `evidence_bundle` | `EvidenceBundle | None` | `None` |
| `rule_missing` | `RcaRuleMissing | None` | `None` |

#### `rca.analysis_blocked` — `src/domains/rca/events.py :: RcaAnalysisBlockedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `reason_code` | `str` | — |
| `reason` | `str` | — |
| `evidence_ref` | `str` | — |
| `rca_detail` | `RcaReportDetail` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `evidence` | `Evidence | None` | `None` |
| `incident` | `IncidentRecord | None` | `None` |
| `evidence_bundle` | `EvidenceBundle | None` | `None` |
| `candidates` | `list[CauseCandidate]` | `field(default_factory=list)` |
| `evaluations` | `list[CauseEvaluation]` | `field(default_factory=list)` |
| `rule_missing` | `RcaRuleMissing | None` | `None` |
| `missing_evidence` | `list[str]` | `field(default_factory=list)` |
| `next_actions` | `list[JsonObject]` | `field(default_factory=list)` |
| `diagnostics` | `JsonObject` | `field(default_factory=dict)` |
| `severity` | `str` | `"warning"` |

#### `rca.followup.required` — `src/domains/rca/events.py :: RcaFollowupRequiredBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `reason_code` | `str` | — |
| `summary` | `str` | — |
| `evidence_ref` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `severity` | `str` | `"warning"` |
| `incident` | `IncidentRecord | None` | `None` |
| `missing_evidence` | `list[str]` | `field(default_factory=list)` |
| `next_actions` | `list[JsonObject]` | `field(default_factory=list)` |
| `diagnostics` | `JsonObject` | `field(default_factory=dict)` |

#### `rca.completed` — `src/domains/rca/events.py :: RcaCompletedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `root_cause` | `str` | — |
| `action` | `str` | — |
| `evidence_ref` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `evidence` | `Evidence | None` | `None` |
| `incident` | `IncidentRecord | None` | `None` |
| `evidence_bundle` | `EvidenceBundle | None` | `None` |
| `candidates` | `list[CauseCandidate] | None` | `None` |
| `evaluations` | `list[CauseEvaluation] | None` | `None` |
| `rca_detail` | `RcaReportDetail | None` | `None` |
| `rule_missing` | `RcaRuleMissing | None` | `None` |

#### `rca.action_required` — `src/domains/rca/events.py :: RcaActionRequiredBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `reason` | `str` | — |
| `evidence_ref` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `reason_code` | `str` | `"action_required"` |
| `severity` | `str` | `"warning"` |
| `missing_evidence` | `list[str]` | `field(default_factory=list)` |
| `next_actions` | `list[JsonObject]` | `field(default_factory=list)` |
| `diagnostics` | `JsonObject` | `field(default_factory=dict)` |

#### `recovery.planned` — `src/domains/rca/events.py :: RecoveryPlannedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `draft` | `HealingActionDraft` | — |
| `plan` | `RecoveryPlan | None` | `None` |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

#### `recovery.selection_requested` — `src/domains/rca/events.py :: RecoverySelectionRequestedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `plan` | `RecoveryPlan` | — |
| `reason` | `str` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

#### `safe_pr.patch_prepared` — `src/domains/rca/events.py :: SafePrPatchPreparedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `title` | `str` | — |
| `body` | `str` | — |
| `patch` | `JsonObject` | — |
| `provider` | `str` | — |
| `request` | `JsonObject` | `field(default_factory=dict)` |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `repository_id` | `str` | `DEFAULT_REPOSITORY_ID` (= `""`) |
| `binding_id` | `str` | `DEFAULT_DEPLOYMENT_BINDING_ID` (= `""`) |
| `application_id` | `str` | `DEFAULT_APPLICATION_ID` (= `""`) |
| `workflow_run_id` | `str` | `DEFAULT_WORKFLOW_RUN_ID` (= `""`) |
| `environment` | `str` | `DEFAULT_ENVIRONMENT` (= `"sandbox"`) |
| `manifest_path` | `str` | `DEFAULT_MANIFEST_PATH` (= `"deploy.yaml"`) |
| `approval_ref` | `str | None` | `None` |
| `policy_decision_ref` | `str | None` | `None` |
| `next_alert` | `JsonObject | None` | `None` |

#### `diff.explained` — `src/domains/rca/events.py :: DiffExplainedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `summary` | `str` | — |
| `risk` | `str` | — |
| `details` | `JsonObject` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |
| `ready_for_creation` | `bool` | `False` |
| `reason` | `str` | `""` |

#### `rollout.diagnosed` — `src/domains/rca/events.py :: RolloutDiagnosedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `diagnosis` | `str` | — |
| `next_action` | `str` | — |
| `details` | `JsonObject` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

#### `approval.recommended` — `src/domains/rca/events.py :: ApprovalRecommendedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `recommendation` | `str` | — |
| `reason` | `str` | — |
| `details` | `JsonObject` | — |
| `workspace_id` | `str` | `DEFAULT_WORKSPACE_ID` |

## 동작 (Behavior)

### 1. Agent evidence 수신 — `POST /agent/evidence`

1. `require_cluster_agent`가 `x-agent-token`을 해시해 등록 레지스트리에서 `ClusterAgentIdentity(workspace_id, cluster_id)`를 얻는다(실패 시 401).
2. `scoped_evidence_key`로 요청의 `evidence_key`를 `"{workspace_id}:{cluster_id}:{evidence_key}"`로 네임스페이스한다(없으면 `None`).
3. `build_cluster_evidence_body` — 요청 body를 dump하되 `correlation_id`는 제외하고, `workspace_id`/`cluster_id`를 **토큰 identity로 강제 덮어쓴다**(body 값 신뢰 안 함).
4. `packages.events.envelope :: event`로 봉투 생성: subject = `body.__subject__`(= `cluster.evidence.received`), source = `getattr(events, "source", "api-gateway")`, `payload.correlation_id` 전달.
5. 멱등 처리 분기 (DB 호출은 전부 `db_call` = `asyncio.to_thread` 경유):
   - `evidence_key` 있음: `db.get_evidence_window(evidence_key)`로 기존 창을 조회 — 존재하면 **기존 `event_id`/`correlation_id`로 즉시 응답**(중복 수신 무시). 없으면 `db.record_evidence_event_once(evidence_key=…, workspace_id=…, cluster_id=…, source_id=evidence_body.source_id or DEFAULT_EVIDENCE_SOURCE_ID, window_start=evidence_body.window_start or evidence_body.evidence_key or evidence_key, agent_id=…, event_envelope=…, payload=evidence_body.to_body())`로 원자적 기록.
   - `evidence_key` 없음: `db.stage_event_once(event_envelope)`로 outbox 적재.
6. `AcceptedResponse(accepted=True, event_id=…, correlation_id=…)` 반환.

### 1b. Alertmanager webhook 수신 — `POST /webhooks/alertmanager?cluster_id=`

1. `require_alertmanager_token` — `ALERTMANAGER_WEBHOOK_TOKEN` 미설정이면 503 `WEBHOOK_NOT_CONFIGURED`(입구 자체를 잠금, fail-closed), Bearer 토큰 불일치/누락이면 401 `WEBHOOK_TOKEN_INVALID`.
2. `db.get_cluster_registration(workspace_id, cluster_id)` — 미등록 클러스터면 404 `CLUSTER_NOT_REGISTERED`.
3. firing 알림이 하나도 없으면(resolved만) 수락만 하고 인시던트를 열지 않는다 — `AcceptedResponse(accepted=True, event_id="", correlation_id="")`.
4. `alertmanager_evidence_key`로 dedup 키 생성 → `build_alertmanager_evidence_body`로 `ClusterEvidenceReceivedBody`(source_id `alertmanager-webhook`) 구성 → envelope 생성.
5. `db.get_evidence_window(evidence_key)` — 기존 창이 있으면 기존 `event_id`/`correlation_id`로 즉시 응답(중복 통지 무시). 없으면 `db.record_evidence_event_once(...)`로 윈도우 기록+outbox 스테이징(agent evidence와 동일한 멱등 경로, `agent_id=None`, `window_start=body.window_start or evidence_key`).
6. `AcceptedResponse(accepted=True, event_id, correlation_id)` 반환.

### 2. 복구 후보 선택 — `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select`

1. `require_session`으로 사용자 세션 확보, `workspace_id = current.workspace_id`.
2. `db.get_recovery_plan(plan_id, workspace_id)` — 없으면 404 `RECOVERY_PLAN_NOT_FOUND`.
3. `RecoveryPlan.from_body(record["payload"])`로 계획 역직렬화, `plan.target["cluster_id"]` 추출.
4. `require_cluster_access(db, current, workspace_id, cluster_id, Permission.DEPLOY_RUN.value, detail=RECOVERY_SELECTION_ACCESS_DENIED)` — 클러스터 리소스 권한 검사.
5. `candidate_by_action_id`로 후보 조회 — 없으면 404 `RECOVERY_ACTION_NOT_FOUND`.
6. `recovery_approval_id(plan_id, action_id)`로 결정적 `approval_ref` 생성, `recovery_policy_decision_ref(approval_ref)`로 정책 결정 참조 생성, `candidate_with_approval`로 후보의 `draft.params`에 두 참조를 주입.
7. `reason = payload.reason or f"operator selected recovery action: {selected.title}"`.
8. `unit_of_work_or_null(db)` 트랜잭션 안에서:
   - `db.select_recovery_plan_action_if_open(...)` — 열려 있지 않으면(`None`) 409 `RECOVERY_PLAN_ALREADY_RESOLVED`.
   - `db.request_workflow_approval(recovery_approval_payload(...))` — `status=ApprovalStatus.GRANTED.value`, `requested_role=ResourceRole.RELEASE_OPERATOR.value`, `decision="selected"`, details에 `approval_ref/policy_decision_ref/recovery_plan_id/recovery_action_id/selected_candidate` 포함. `workflow_run_id/application_id/binding_id/environment`는 `selected.draft.params`에서 취하고 없으면 gitops 기본값. `workspace_id`는 `plan.target → params → 세션` 우선순위.
   - `events.accept_body(RecoveryActionSelectedBody(...), correlation_id=record["correlation_id"], actor=Actor(current.user_id, tuple(current.roles)))` — `auto_selected=False`로 발행.
9. `AcceptedResponse(accepted=True, event_id=…, correlation_id=…)` 반환.

### 복구 계획 상태 머신 (`recovery_plans.status`)

| 현재 상태 | 트리거 | 다음 상태 | 코드 |
|---|---|---|---|
| (없음) | `upsert_recovery_selection_request` | `selection_requested` | `src/domains/rca/repository.py :: RcaRepository.upsert_recovery_selection_request` |
| `selection_requested` | `upsert_recovery_selection_request` (재수신) | `selection_requested` (payload 등 갱신) | 동일 |
| `selected` | `upsert_recovery_selection_request` (재수신) | `selected` **유지** (status 되돌림 금지, 나머지 필드만 갱신) | 동일 |
| `selection_requested` | `select_recovery_plan_action_if_open` | `selected` (+ `selected_action_id`, `selected_by` 기록) | `src/domains/rca/repository.py :: RcaRepository.select_recovery_plan_action_if_open` |
| `selected` | `select_recovery_plan_action_if_open` | 변화 없음 — `None` 반환 → API 409 | 동일 |

열린 상태 집합은 `OPEN_RECOVERY_PLAN_STATUSES = ("selection_requested",)` 뿐이다.

## 불변식·오류 (Invariants & Errors)

### 불변식

- **테넌트 위조 차단**: agent evidence의 `workspace_id`/`cluster_id`는 항상 토큰 identity에서 취한다. 요청 body의 값은 무시된다 (`build_cluster_evidence_body`).
- **evidence_key 네임스페이스**: `evidence_windows`의 PK가 `evidence_key` 단일이므로, 반드시 `"{workspace_id}:{cluster_id}:"` 접두사로 스코프해 타 워크스페이스 agent의 키 선점·증거 억제·`event_id`/`correlation_id` 테넌트 누수를 막는다 (`scoped_evidence_key`).
- **증거 수신 멱등성**: 동일 `evidence_key` 재수신 시 새 이벤트를 만들지 않고 기존 `event_id`/`correlation_id`를 반환한다.
- **복구 선택 단조성**: `recovery_plans.status`는 `selected`에서 되돌아가지 않는다. 선택은 조건부 UPDATE(`status IN open`)로만 이뤄져 동시 요청 중 하나만 성공한다.
- **backlog upsert**: `backlog_id` 충돌 시 `occurrence_count`를 원자적으로 +1 하며 `symptom/title`은 최초값을 유지한다.
- **승인 참조 결정성**: `approval_ref`는 `(plan_id, action_id)`의 sha256 기반이라 같은 선택에 대해 항상 같은 값이다.
- **원자성**: 복구 선택의 상태 전이·승인 레코드·이벤트 발행은 `unit_of_work_or_null(db)` 한 트랜잭션 안에서 수행된다.

### 오류

| 상황 | 응답 | detail |
|---|---|---|
| agent 토큰 없음/미등록/해시 불일치 | 401 | (identity 도메인 메시지) |
| Alertmanager webhook 토큰 미설정 | 503 (`HTTP_SERVICE_UNAVAILABLE`) | `WEBHOOK_NOT_CONFIGURED` = `"alertmanager webhook is not configured"` |
| Alertmanager webhook 토큰 불일치/누락 | 401 (`HTTP_UNAUTHORIZED`) | `WEBHOOK_TOKEN_INVALID` = `"invalid webhook token"` |
| Alertmanager webhook 대상 클러스터 미등록 | 404 (`HTTP_NOT_FOUND`) | `CLUSTER_NOT_REGISTERED` = `"cluster is not registered"` |
| 세션 없음 | 401 | (identity 도메인 메시지) |
| 클러스터 권한 없음 (`Permission.DEPLOY_RUN`) | (require_cluster_access가 발생시키는 상태코드) | `RECOVERY_SELECTION_ACCESS_DENIED` = `"recovery selection access denied"` |
| 복구 계획 없음 | 404 (`HTTP_NOT_FOUND`) | `RECOVERY_PLAN_NOT_FOUND` = `"recovery plan not found"` |
| 후보 `action_id` 없음 | 404 (`HTTP_NOT_FOUND`) | `RECOVERY_ACTION_NOT_FOUND` = `"recovery action not found"` |
| 계획이 이미 선택 완료 | 409 (`HTTP_CONFLICT`) | `RECOVERY_PLAN_ALREADY_RESOLVED` = `"recovery plan already resolved"` |

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `ALERTMANAGER_WEBHOOK_TOKEN` (`ALERTMANAGER_WEBHOOK_TOKEN_ENV`) | str | `""` (미설정 시 webhook 503 거부) | Alertmanager webhook Bearer 토큰. 매 요청 시 `env()`로 평가 |

이벤트 소스명은 런타임 `events` 객체의 `source` 속성에서 취하며 없으면 `"api-gateway"`를 쓴다.
