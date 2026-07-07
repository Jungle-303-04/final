---
source_commit: 664925a6
status: synced
---

# ai — AI 대화 도메인 (대화/메시지 read model, 대화 이벤트 계약, LLM 도구·프롬프트)

> 소스: `src/domains/ai/` · 테스트: `tests/test_ai_conversation.py`, `tests/test_ai_platform_tools.py`, `tests/test_ai_chat_hardening.py`

## 책임 (Responsibility)

- AI 대화(`ai_conversations`)와 대화 메시지(`ai_conversation_messages`) read model 테이블 및 리포지토리를 소유한다.
- 대화 이벤트 계약(`ai.message.received / responded / failed`)을 정의한다.
- 대화 생성·메시지 추가·조회·삭제 HTTP API를 제공한다 (실제 LLM 응답 생성은 chat-worker 서비스 담당 — 이 도메인은 이벤트를 발행할 뿐 소비하지 않음).
- LLM이 대화 중 호출 가능한 읽기 전용 플랫폼 조회 도구(`@ai.tool`)와, 로케일별 노출 텍스트 카탈로그, 시스템 프롬프트 빌더를 제공한다.
- 하지 않는 것: LLM 호출 자체(엔진은 `packages/ai`), 이벤트 소비(워커 프로세스 담당).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection`, `row_dict`, `unit_of_work_or_null` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | 이벤트 body 베이스·`@event` 레지스트리·`EventSubject`, gateway routes/요청·응답 모델, `Actor`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | FastAPI 의존성 `get_db`, `get_events` |
| import | `packages.ai` | [../packages/ai.md](../packages/ai.md) | `ToolContext`, `ai`(ToolRegistry 데코레이터) |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session` 세션 인증 |
| import | `domains.command` | [./command.md](./command.md) | `registered_command_actions` (list_command_actions 도구) |
| 발행 | `ai.message.received` | 아래 [이벤트](#이벤트-events) | 라우터에서 LLM 응답 요청 |
| 정의 | `ai.message.responded`, `ai.message.failed` | 아래 [이벤트](#이벤트-events) | chat-worker가 발행하는 응답/실패 계약 |

## 공개 인터페이스 (Public API)

### 메시지 카탈로그 — `src/domains/ai/messages.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `DEFAULT_LOCALE` | `"en"` | `src/domains/ai/messages.py :: DEFAULT_LOCALE` |
| `SUPPORTED_LOCALES` | `("en", "ko")` | `src/domains/ai/messages.py :: SUPPORTED_LOCALES` |
| `text` | `def text(key: str, locale: str \| None = None, **kwargs: object) -> str` | `src/domains/ai/messages.py :: text` |
| `registered_message_keys` | `def registered_message_keys() -> tuple[str, ...]` | `src/domains/ai/messages.py :: registered_message_keys` |

내부 카탈로그 `_CATALOG` 키 4종(각각 en/ko 번역 보유, `str.format` 템플릿):

| 키 | en 값 | ko 값 |
|---|---|---|
| `chat.system_prompt` | `"You are an operations assistant for a Kubernetes event-driven platform.\nAnswer with concise operational reasoning and concrete next checks."` | `"당신은 Kubernetes 이벤트 기반 플랫폼의 운영 어시스턴트입니다.\n간결한 운영 관점 추론과 구체적인 다음 점검 항목으로 답하세요."` |
| `chat.empty_response` | `"No response generated."` | `"생성된 응답이 없습니다."` |
| `chat.failure_reason` | `"agent response failed: {error}"` | `"에이전트 응답 실패: {error}"` |
| `chat.timeout_reason` | `"agent response timed out after {seconds}s"` | `"에이전트 응답이 {seconds}초 안에 완료되지 않았습니다"` |

- `text()`: 미등록 키 → `KeyError("unknown message key: <key>")` (fail-fast). 미등록 로케일 → `DEFAULT_LOCALE` 폴백. kwargs 있으면 `template.format(**kwargs)`.
- `registered_message_keys()`: 정렬된 전체 키 튜플.

### 프롬프트 빌더 — `src/domains/ai/agent.py`

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `build_system_prompt` | `def build_system_prompt(evt: Any, locale: str \| None = None) -> str` | `src/domains/ai/agent.py :: build_system_prompt` |

`evt`(AiMessageReceivedBody)에서 시스템 프롬프트 생성. `evt.context or {}`를 `json.dumps(..., ensure_ascii=False, sort_keys=True)`로 직렬화한 뒤 다음 형식으로 조립:

```
{text('chat.system_prompt', locale)}\n\nAgent: {evt.agent}\nConversation: {evt.conversation_id}\nWorkspace: {evt.workspace_id}\nContext: {request_context}
```

### LLM 도구 — `src/domains/ai/tools.py`

모듈 상수: `DEFAULT_INCIDENT_LIMIT = 5`, `DEFAULT_MESSAGE_LIMIT = 10`, `MAX_ROWS = 20`, `CONTENT_PREVIEW_CHARS = 300`, `INVENTORY_PUBLIC_FIELDS = ("inventory_key", "workspace_id", "cluster_id", "resource_type", "api_version", "kind", "namespace", "name", "uid", "status", "health", "labels", "annotations", "summary", "observed_at", "last_seen_at")`. 내부 `_clamp(value, default)`는 `int(value)`를 `[1, MAX_ROWS]`로 클램프, 변환 실패(`TypeError`/`ValueError`) 시 default 반환.

| 도구명 | 함수 | 앵커 |
|---|---|---|
| `list_recent_incidents` | `async def list_recent_incidents(context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_recent_incidents` |
| `get_inventory_resource_detail` | `async def get_inventory_resource_detail(context: ToolContext, cluster_id: str = "", resource_type: str = "", kind: str = "", name: str = "", namespace: str = "") -> dict[str, Any]` | `src/domains/ai/tools.py :: get_inventory_resource_detail` |
| `list_resource_rca_reports` | `async def list_resource_rca_reports(context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_resource_rca_reports` |
| `get_conversation_summary` | `async def get_conversation_summary(context: ToolContext, conversation_id: str, limit: int = DEFAULT_MESSAGE_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: get_conversation_summary` |
| `list_command_actions` | `async def list_command_actions(context: ToolContext) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_command_actions` |

- `list_recent_incidents`: `@ai.tool(name="list_recent_incidents", description="Recent RCA reports (root cause, recommended action) for this workspace.", parameters={"limit": {"type": "integer", "description": "max rows (1-20, default 5)"}})`. `context.db.list_rca_reports(context.workspace_id, limit=_clamp(limit, 5))` 호출, 반환 `{"incidents": [{"root_cause", "action", "correlation_id", "created_at"(str)} ...]}`.
- `get_inventory_resource_detail`: parameters `cluster_id`, `resource_type`, `kind`, `name`, `namespace`(모두 선택, 비면 `ToolContext`의 같은 필드 사용). `cluster_id/resource_type/kind/name`을 모두 해석하지 못하면 `{"found": False, "error": "cluster_id, resource_type, kind and name are required"}`. 있으면 `context.db.get_inventory_resource(...)` 조회 후, 없으면 `{"found": False, "identity": {...}}`; 있으면 `list_related_inventory_resources(...)`, `list_resource_events(...)`를 함께 조회해 `{"found": True, "resource": <INVENTORY_PUBLIC_FIELDS>, "related": {group: [...]}, "events": [...]}` 반환.
- `list_resource_rca_reports`: `context.db.list_rca_reports(context.workspace_id, limit=_clamp(limit, 5))` 결과를 `ToolContext.cluster_id`/`ToolContext.name`으로 가능한 만큼 필터한다. 반환 `{"reports": [{"root_cause", "action", "correlation_id", "created_at"(str), "cluster_id"} ...]}`.
- `get_conversation_summary`: parameters에 `conversation_id`(string, required=True)·`limit`(integer). `context.db.list_ai_messages(context.workspace_id, str(conversation_id), newest=_clamp(limit, 10))` 호출, 반환 `{"conversation_id", "messages": [{"role", "content"(300자 절단), "created_at"(str)} ...]}`.
- `list_command_actions`: parameters 없음. [command 카탈로그](./command.md)의 `registered_command_actions()` 순회, 반환 `{"actions": [{"action", "recovery_aliases"(list), "allowed_namespaces"(list), "requires_approval"(bool)} ...]}`.
- 모든 도구는 읽기 전용, JSON 직렬화 가능한 dict 반환. DB 접근은 `ToolContext.db`(AsyncDb)로만.

### 리포지토리 — `src/domains/ai/repository.py`

상태/역할 상수: `STATUS_ACTIVE = "active"`, `STATUS_WAITING = "waiting"`, `STATUS_COMPLETED = "completed"`, `STATUS_FAILED = "failed"`, `ROLE_USER = "user"`, `ROLE_ASSISTANT = "assistant"` (앵커: `src/domains/ai/repository.py :: STATUS_ACTIVE` 등).

`class AiConversationRepository(DatabaseConnection)` — `src/domains/ai/repository.py :: AiConversationRepository`
클래스 속성: `conversation_table = AiConversation.__table__`, `message_table = AiConversationMessage.__table__`.

| 메서드 | 시그니처 | 쿼리 의미 |
|---|---|---|
| `create_ai_conversation` | `(self, payload: JsonObject) -> JsonObject` | `INSERT ... ON CONFLICT (conversation_id) DO NOTHING RETURNING *`. values: conversation_id/workspace_id/user_id/title/agent 필수, `status=payload.get("status", STATUS_ACTIVE)`, `context=payload.get("context") or {}`, `updated_at=func.now()`. 충돌(기존 행)이면 payload 그대로 반환 |
| `append_ai_message` | `(self, payload: JsonObject) -> JsonObject` | `INSERT ... ON CONFLICT (message_id) DO NOTHING RETURNING *` (멱등). `correlation_id=payload.get("correlation_id")`, `metadata=payload.get("metadata") or {}` |
| `mark_ai_conversation_status` | `(self, workspace_id: str, conversation_id: str, status: str) -> None` | `UPDATE ai_conversations SET status=?, updated_at=now() WHERE workspace_id=? AND conversation_id=?` |
| `record_ai_response` | `(self, payload: JsonObject) -> None` | `unit_of_work()` 트랜잭션 안에서 assistant 메시지 append(`message_id=payload["response_message_id"]`, `role=ROLE_ASSISTANT`) + 상태 `STATUS_COMPLETED` 전이 |
| `record_ai_failure` | `(self, payload: JsonObject) -> None` | `unit_of_work()` 안에서 상태 `STATUS_FAILED` 전이만 수행 |
| `list_ai_conversations` | `(self, workspace_id: str, *, limit: int = 100) -> list[JsonObject]` | `SELECT conversation_id, title, status, updated_at WHERE workspace_id=? ORDER BY updated_at DESC LIMIT clamp(limit,1,200)` |
| `get_ai_conversation` | `(self, workspace_id: str, conversation_id: str) -> JsonObject \| None` | 단건 SELECT (workspace_id+conversation_id), 없으면 None |
| `delete_ai_conversation` | `(self, workspace_id: str, conversation_id: str) -> bool` | `DELETE ai_conversations WHERE workspace_id=? AND conversation_id=? RETURNING conversation_id`. 삭제 행이 있으면 true, 없으면 false. 메시지는 FK `ON DELETE CASCADE` |
| `list_ai_messages` | `(self, workspace_id: str, conversation_id: str, *, newest: int \| None = None) -> list[JsonObject]` | 기본: `ORDER BY created_at, message_id` 전체. `newest=N`: `ORDER BY created_at DESC, message_id DESC LIMIT N` 후 `reversed()` → 최근 N개를 시간 오름차순으로 반환 |

### 라우터 — `src/domains/ai/router.py`

| 심볼 | 시그니처/값 | 앵커 |
|---|---|---|
| `router` | `APIRouter()` | `src/domains/ai/router.py :: router` |
| `DEFAULT_AGENT` | `"operations-chat"` | `src/domains/ai/router.py :: DEFAULT_AGENT` |
| `NOT_FOUND` | `"conversation not found"` | `src/domains/ai/router.py :: NOT_FOUND` |
| `CONTEXT_STRING_FIELDS` | `("cluster_id", "resource_type", "kind", "namespace", "name", "uid", "locale")` | `src/domains/ai/router.py :: CONTEXT_STRING_FIELDS` |
| `MAX_CONTEXT_VALUE_LENGTH` | `253` | `src/domains/ai/router.py :: MAX_CONTEXT_VALUE_LENGTH` |
| `new_id` | `def new_id(prefix: str) -> str` — `f"{prefix}-{uuid.uuid4()}"` | `src/domains/ai/router.py :: new_id` |
| `title_for` | `def title_for(payload: AiConversationCreateRequest) -> str` — `payload.title` 있으면 그대로, 없으면 message 공백 정규화(`" ".join(split())`) 후 80자 절단, 빈 문자열이면 `"AI conversation"` | `src/domains/ai/router.py :: title_for` |
| `normalize_context` | `def normalize_context(raw: dict[str, Any] \| None) -> dict[str, str]` | `src/domains/ai/router.py :: normalize_context` |

`normalize_context()`는 `CONTEXT_STRING_FIELDS`만 허용하고, 각 값은 `str(value).strip()` 후 비어 있지 않을 때만 `MAX_CONTEXT_VALUE_LENGTH`로 잘라 저장한다. `None`/빈 dict는 `{}`.

#### 엔드포인트

| 메서드+경로 | 핸들러 | 요청 모델 | 응답 모델 | 권한 |
|---|---|---|---|---|
| `POST /ai/conversations` (`gateway_routes.AI_CONVERSATIONS_PATH`) | `create_conversation` — `src/domains/ai/router.py :: create_conversation` | `AiConversationCreateRequest` | `AiConversationAcceptedResponse` | `require_session` |
| `POST /ai/conversations/{conversation_id}/messages` (`AI_CONVERSATION_MESSAGES_PATH`) | `append_message` — `src/domains/ai/router.py :: append_message` | `AiMessageCreateRequest` | `AiConversationAcceptedResponse` | `require_session` |
| `GET /ai/conversations` (`AI_CONVERSATIONS_PATH`) | `list_conversations` — `src/domains/ai/router.py :: list_conversations` | — | `AiConversationListResponse` | `require_session` |
| `GET /ai/conversations/{conversation_id}` (`AI_CONVERSATION_PATH`) | `get_conversation` — `src/domains/ai/router.py :: get_conversation` | — | `AiConversationResponse` | `require_session` |
| `DELETE /ai/conversations/{conversation_id}` (`AI_CONVERSATION_PATH`) | `delete_conversation` — `src/domains/ai/router.py :: delete_conversation` | — | `204 Response` | `require_session` |

요청·응답 모델은 `src/packages/contracts/gateway/requests.py` / `responses.py` 정의를 사용한다 ([contracts](../packages/contracts.md)).

## 데이터 모델 (Data Model)

### `ai_conversations` — `src/domains/ai/models.py :: AiConversation`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| conversation_id | Text | PK | `aic-<uuid4>` 형식 |
| workspace_id | Text | NOT NULL | 워크스페이스 격리 키 |
| user_id | Text | NOT NULL | 대화 생성 사용자 |
| title | Text | NOT NULL | 첫 메시지 기반 제목(최대 80자) |
| agent | Text | NOT NULL | 응답 에이전트 이름(기본 `operations-chat`) |
| status | Text | NOT NULL | `active` / `waiting` / `completed` / `failed` |
| context | JSONB | NOT NULL | 요청 컨텍스트(기본 `{}`) |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 생성 시각 |
| updated_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 갱신 시각 |

### `ai_conversation_messages` — `src/domains/ai/models.py :: AiConversationMessage`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| message_id | Text | PK | `aim-<uuid4>` 형식 |
| conversation_id | Text | FK → `ai_conversations.conversation_id` ON DELETE CASCADE, NOT NULL | 소속 대화 |
| workspace_id | Text | NOT NULL | 워크스페이스 격리 키 |
| role | Text | NOT NULL | `user` / `assistant` |
| content | Text | NOT NULL | 메시지 본문 |
| agent | Text | NOT NULL | 에이전트 이름 |
| correlation_id | Text | nullable | 응답 메시지의 이벤트 상관관계 ID |
| message_metadata | JSONB | NOT NULL, DB 컬럼명 `metadata` | 예: `{"source": "http"}` |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 생성 시각 |

## 이벤트 (Events)

모두 `src/domains/ai/events.py`에서 `@event(EventSubject.*)` + `@dataclass(frozen=True)`, `EventBody` 상속으로 정의. 라우팅 키(subject) = `EventSubject` 값.

### 발행 (Publishes)

**`ai.message.received`** (`EventSubject.AI_MESSAGE_RECEIVED`) — `src/domains/ai/events.py :: AiMessageReceivedBody` — 라우터가 `events.accept_body(...)`로 발행.

| 필드 | 타입 | 기본값 |
|---|---|---|
| conversation_id | str | (필수) |
| message_id | str | (필수) |
| content | str | (필수) |
| agent | str | (필수) |
| user_id | str | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| context | JsonObject \| None | None |

`context`는 라우터가 `normalize_context()`로 보정한 값이다. 현재 유지되는 필드는 `cluster_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `locale`뿐이다.

### 정의만 (chat-worker가 발행하는 계약)

**`ai.message.responded`** (`EventSubject.AI_MESSAGE_RESPONDED`) — `src/domains/ai/events.py :: AiMessageRespondedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| conversation_id | str | (필수) |
| request_message_id | str | (필수) |
| response_message_id | str | (필수) |
| content | str | (필수) |
| agent | str | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| metadata | JsonObject \| None | None |

**`ai.message.failed`** (`EventSubject.AI_MESSAGE_FAILED`) — `src/domains/ai/events.py :: AiMessageFailedBody`

| 필드 | 타입 | 기본값 |
|---|---|---|
| conversation_id | str | (필수) |
| request_message_id | str | (필수) |
| reason | str | (필수) |
| agent | str | (필수) |
| workspace_id | str | `DEFAULT_WORKSPACE_ID` |
| metadata | JsonObject \| None | None |

## 동작 (Behavior)

### 대화 생성 (`POST /ai/conversations`)

1. `workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`, `agent = payload.agent or DEFAULT_AGENT`.
2. `request_context = normalize_context(payload.context)`.
3. `conversation_id = new_id("aic")`, `message_id = new_id("aim")`, `title = title_for(payload)`.
4. `unit_of_work_or_null(db)` 단일 트랜잭션 안에서: (a) `db.create_ai_conversation(status=STATUS_WAITING, context=request_context)`, (b) `db.append_ai_message(role=ROLE_USER, metadata={"source": "http"})`, (c) `events.accept_body(AiMessageReceivedBody(..., context=request_context), actor=Actor(current.user_id, tuple(current.roles)))` — 부분 실패 시 고아 대화/이벤트 없는 메시지 방지.
5. `AiConversationAcceptedResponse(accepted=True, conversation_id, message_id, event_id=accepted.event.event_id, correlation_id=accepted.event.correlation_id)` 반환.

### 메시지 추가 (`POST /ai/conversations/{conversation_id}/messages`)

1. `db.get_ai_conversation(workspace_id, conversation_id)` — None이면 404 `"conversation not found"`.
2. `agent = payload.agent or str(conversation["agent"])`, `message_id = new_id("aim")`.
3. `request_context = normalize_context(payload.context or conversation.get("context") or {})`.
4. 단일 트랜잭션(`unit_of_work_or_null`) 안에서: 메시지 append(user) → `mark_ai_conversation_status(..., STATUS_WAITING)` → `AiMessageReceivedBody(..., context=request_context)` 발행.

### 대화 삭제 (`DELETE /ai/conversations/{conversation_id}`)

1. `workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`.
2. `db.delete_ai_conversation(workspace_id, conversation_id)` 호출.
3. false면 404 `"conversation not found"`, true면 본문 없는 204 `Response`.
4. 메시지는 `ai_conversation_messages.conversation_id`의 `ON DELETE CASCADE`로 함께 삭제된다.

### 상태 머신 (conversation.status)

```
(생성) → waiting → completed   (record_ai_response: chat-worker가 responded 반영)
              └──→ failed      (record_ai_failure: failed 반영)
(append_message 시 어떤 상태든) → waiting
```

## 불변식·오류 (Invariants & Errors)

- 대화·메시지 insert는 모두 `ON CONFLICT DO NOTHING`으로 멱등 — 같은 ID 재삽입은 무해.
- 대화 생성/메시지 추가에서 read model 기록과 이벤트 스테이징은 반드시 같은 트랜잭션.
- `record_ai_response`는 메시지 기록과 상태 전이를 같은 `unit_of_work`로 묶는다.
- 조회·삭제는 항상 `workspace_id` 필터 포함(워크스페이스 격리).
- 존재하지 않는 대화 접근 → HTTP 404 `"conversation not found"`.
- `messages.text` 미등록 키 → `KeyError` (fail-fast).
- 도구 limit는 항상 1–20으로 클램프.
- 대화 context 는 allowlist field만 저장/이벤트 발행한다. 리소스 상세·이벤트·RCA 내용은 conversation row에 복사하지 않고 도구 실행 시점의 실제 inventory/RCA read model에서 다시 조회한다.

## 설정 (Settings)

이 도메인 자체 환경변수 없음.
