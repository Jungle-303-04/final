---
source_commit: 3e1beb02
status: synced
---

# ai — AI 대화 도메인 (대화/메시지 read model, 대화 이벤트 계약, LLM 도구·프롬프트)

> 소스: `src/domains/ai/` · 테스트: `tests/test_ai_conversation.py`, `tests/test_ai_platform_tools.py`, `tests/test_ai_chat_hardening.py`, `tests/test_ai_context_facade.py`

## 책임 (Responsibility)

- AI 대화(`ai_conversations`)와 대화 메시지(`ai_conversation_messages`) read model 테이블 및 리포지토리를 소유한다.
- 대화 이벤트 계약(`ai.message.received / responded / failed`)을 정의한다.
- 대화 생성·메시지 추가·조회·삭제 HTTP API를 제공한다 (실제 LLM 응답 생성은 chat-worker 서비스 담당 — 이 도메인은 이벤트를 발행할 뿐 소비하지 않음).
- 제품 셸에는 현재 화면 맥락에 묶인 동기 AI facade를 제공한다. 이 경로는 사용자가 읽을 수 있는 inventory 근거만 문장화하고, 근거가 없으면 정본 문구 `그 데이터가 없습니다.`로 닫는다.
- LLM이 대화 중 호출 가능한 읽기 전용 플랫폼 조회 도구(`@ai.tool`)와, 로케일별 노출 텍스트 카탈로그, 시스템 프롬프트 빌더를 제공한다.
- 하지 않는 것: LLM 호출 자체(엔진은 `packages/ai`), 이벤트 소비(워커 프로세스 담당).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection`, `row_dict`, `unit_of_work_or_null` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | 이벤트 body 베이스·`@event` 레지스트리·`EventSubject`, gateway routes/요청·응답 모델, `Actor`, `DEFAULT_WORKSPACE_ID` |
| import | `packages.runtime` | [../packages/runtime.md](../packages/runtime.md) | FastAPI 의존성 `get_db`, `get_events` |
| import | `packages.ai` | [../packages/ai.md](../packages/ai.md) | `ToolContext`, `ai`(ToolRegistry 데코레이터) |
| import | `domains.identity` | [./identity.md](./identity.md) | `require_session` 세션 인증, `inventory.read` cluster 범위 물질화 |
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

모듈 상수: `DEFAULT_INCIDENT_LIMIT = 5`, `DEFAULT_MESSAGE_LIMIT = 10`, `MAX_ROWS = 20`, `CONTENT_PREVIEW_CHARS = 300`, `RISK_ORDER`, `ROUTE_ORDER`, `RECOMMENDABLE_RISKS={"low","medium"}`, `AUTOMATION_ROUTES={"auto","command"}`, `INVENTORY_PUBLIC_FIELDS = ("inventory_key", "workspace_id", "cluster_id", "resource_type", "api_version", "kind", "namespace", "name", "uid", "status", "health", "labels", "annotations", "summary", "observed_at", "last_seen_at")`. 내부 `_clamp(value, default)`는 `int(value)`를 `[1, MAX_ROWS]`로 클램프, 변환 실패(`TypeError`/`ValueError`) 시 default 반환.

| 도구명 | 함수 | 앵커 |
|---|---|---|
| `list_recent_incidents` | `async def list_recent_incidents(context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_recent_incidents` |
| `get_inventory_resource_detail` | `async def get_inventory_resource_detail(context: ToolContext, cluster_id: str = "", resource_type: str = "", kind: str = "", name: str = "", namespace: str = "") -> dict[str, Any]` | `src/domains/ai/tools.py :: get_inventory_resource_detail` |
| `list_resource_rca_reports` | `async def list_resource_rca_reports(context: ToolContext, limit: int = DEFAULT_INCIDENT_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_resource_rca_reports` |
| `get_incident_rca_context` | `async def get_incident_rca_context(context: ToolContext, correlation_id: str = "") -> dict[str, Any]` | `src/domains/ai/tools.py :: get_incident_rca_context` |
| `get_conversation_summary` | `async def get_conversation_summary(context: ToolContext, conversation_id: str, limit: int = DEFAULT_MESSAGE_LIMIT) -> dict[str, Any]` | `src/domains/ai/tools.py :: get_conversation_summary` |
| `recommend_recovery_action` | `async def recommend_recovery_action(context: ToolContext, correlation_id: str = "", plan_id: str = "", exclude_action_ids: list[str] \| None = None, exclude_action_types: list[str] \| None = None) -> dict[str, Any]` | `src/domains/ai/tools.py :: recommend_recovery_action` |
| `explain_diff_risk` | `async def explain_diff_risk(context: ToolContext, diff_source: str = "", workflow_run_id: str = "", approval_id: str = "") -> dict[str, Any]` | `src/domains/ai/tools.py :: explain_diff_risk` |
| `list_command_actions` | `async def list_command_actions(context: ToolContext) -> dict[str, Any]` | `src/domains/ai/tools.py :: list_command_actions` |

- `list_recent_incidents`: `@ai.tool(name="list_recent_incidents", description="Recent RCA reports (root cause, recommended action) for this workspace.", parameters={"limit": {"type": "integer", "description": "max rows (1-20, default 5)"}})`. `context.db.list_rca_reports(context.workspace_id, limit=_clamp(limit, 5))` 호출, 반환 `{"incidents": [{"root_cause", "action", "correlation_id", "created_at"(str)} ...]}`.
- `get_inventory_resource_detail`: parameters `cluster_id`, `resource_type`, `kind`, `name`, `namespace`(모두 선택, 비면 `ToolContext`의 같은 필드 사용). `cluster_id/resource_type/kind/name`을 모두 해석하지 못하면 `{"found": False, "error": "cluster_id, resource_type, kind and name are required"}`. 있으면 `context.db.get_inventory_resource(...)` 조회 후, 없으면 `{"found": False, "identity": {...}}`; 있으면 `list_related_inventory_resources(...)`, `list_resource_events(...)`를 함께 조회해 `{"found": True, "resource": <INVENTORY_PUBLIC_FIELDS>, "related": {group: [...]}, "events": [...]}` 반환.
- `list_resource_rca_reports`: `context.db.list_rca_reports(context.workspace_id, limit=_clamp(limit, 5))` 결과를 `ToolContext.cluster_id`/`ToolContext.name`으로 가능한 만큼 필터한다. 반환 `{"reports": [{"root_cause", "action", "correlation_id", "created_at"(str), "cluster_id"} ...]}`.
- `get_incident_rca_context`: parameters `correlation_id`(선택, 비면 `ToolContext.correlation_id`/`resource_context["correlation_id"]` 사용). `context.db.list_rca_reports(context.workspace_id, limit=20)`에서 같은 `correlation_id`의 RCA report를 `rca_report_summary()`로 요약하고, `context.db.get_recovery_plan_by_correlation(correlation_id, context.workspace_id)`로 recovery plan을 함께 조회한다. 반환 `{"found", "correlation_id", "reports", "recovery_plan"}`. `recovery_plan`은 `plan_id/status/recommended_action_id/selection_required/target/candidates[]`만 공개한다.
- `recommend_recovery_action`: recovery plan 후보 중 Chat AI가 사용자에게 설명할 추천 조치를 고르는 읽기 전용 도구다. parameters:
  - `plan_id`: recovery plan id. 있으면 `context.db.get_recovery_plan(plan_id, context.workspace_id)`로 직접 조회한다.
  - `correlation_id`: incident correlation id. `plan_id`가 없거나 plan 조회 실패 시 `context.db.get_recovery_plan_by_correlation(correlation_id, context.workspace_id)`로 조회한다. 입력이 비면 `ToolContext.correlation_id`/`resource_context["correlation_id"]`를 사용한다.
  - `exclude_action_ids`: 사용자가 제외하고 싶은 recovery action id 목록.
  - `exclude_action_types`: 사용자가 제외하고 싶은 `draft.action_type` 목록(예: `rollout_restart`).

  이 도구는 요청/이벤트/command를 만들지 않는다. recovery plan의 `payload.candidates[]`만 평가해 추천 JSON을 반환한다. 추천 후보는 `low`/`medium` risk만 대상으로 삼고, `high` 또는 알 수 없는 risk는 `possible_actions.not_recommended[]`에 수동 검토 사유와 함께 넣는다. `payload.recommended_action_id`가 아직 제외되지 않았고 추천 가능한 risk이면 우선 사용하며, 없으면 risk 낮음 → approval 불필요 → route 우선순위(`auto`, `command`, `draft_pr`, `approval_required`) → rank/score 기준으로 고른다.

  자동 실행 후보(`caution.automatic_candidate=true`)는 다음 조건을 모두 만족할 때만 표시한다: `risk_level=="low"`, `approval_required==false`, `route in {"auto","command"}`, command action catalog의 허용 namespace 안, 대상 리소스가 명확함, validation check 또는 rollback/recovery 경로 존재. 자동 후보여도 실제 실행은 하지 않고, `caution.automation.handoff.next_step="create_command_request"`와 `requires_user_confirmation=true`만 반환해 다음 단계 가드레일용 메타데이터로 남긴다.

  기본 응답 구조는 Chat AI 최종 답변 포맷과 맞춘다:

  ```json
  {
    "found": true,
    "plan_id": "plan-...",
    "correlation_id": "corr-...",
    "status": "selection_requested",
    "target": {"cluster_id": "...", "namespace": "..."},
    "summary": "추천 조치는 ...입니다. 자동 실행 후보입니다.",
    "reasoning": {
      "current_context": "recovery plan summary",
      "evidence": ["evidence://..."],
      "why_recommended": ["추천 이유", "자동 후보 안전 근거"],
      "risk_notes": ["영향 범위", "후보 설명"]
    },
    "next_checks": ["실행 전 확인할 항목"],
    "possible_actions": {
      "recommended": {"action_id": "...", "title": "...", "route": "auto", "risk_level": "low", "approval_required": false, "automatic_candidate": true},
      "alternatives": [{"action_id": "..."}],
      "not_recommended": [{"action_id": "...", "reason": "수동 검토 필요"}]
    },
    "caution": {
      "risk_level": "low",
      "approval_required": false,
      "automatic_candidate": true,
      "expected_impact": ["예상 영향"],
      "automation": {
        "eligible": true,
        "why_safe": ["자동 후보로 볼 수 있는 근거"],
        "blocking_reasons": [],
        "handoff": {"next_step": "create_command_request", "requires_user_confirmation": true}
      }
    }
  }
  ```
- `explain_diff_risk`: 현재 화면에서 선택된 diff를 설명하는 읽기 전용 도구다. 홈 화면에서 diff를 검색하는 도구가 아니라, 프론트가 넘긴 `diff_source`와 식별자 힌트를 바탕으로 이미 존재하는 GitOps diff 또는 Safe PR patch 설명 이벤트를 조회한다. 이 도구가 필요한 이유는 “이 diff 위험해?” 같은 질문이 사용자 문장만으로는 GitOps apply diff인지 Safe PR patch 초안인지 구분되지 않기 때문이다. 화면은 전체 YAML/patch를 보내지 않고 작은 조회 힌트만 보낸다.

  parameters:
  - `diff_source`: `"gitops"` 또는 `"safe_pr"`. 비면 `ToolContext.resource_context["diff_source"]`를 사용한다.
  - `workflow_run_id`: workflow/run 화면의 실행 id. 비면 `resource_context["workflow_run_id"]`를 사용한다.
  - `approval_id`: GitOps 승인 화면의 승인 id. 비면 `resource_context["approval_id"]`를 사용한다.

  GitOps 분기:
  1. `approval_id`가 있으면 `context.db.get_workflow_approval(approval_id, workspace_id)`를 먼저 조회한다.
  2. approval `details.diff`가 있으면 그것을 설명한다.
  3. 없고 `workflow_run_id`가 있으면 `context.db.get_workflow_step_details(workflow_run_id, "diff")`를 조회한다.
  4. diff가 없으면 `{"found": false, "source": "gitops", "missing_context": [...]}`를 반환한다.

  GitOps 응답은 `summary`, `reasoning.current_context`, `reasoning.evidence.diff`, `reasoning.risk_notes`, `next_checks`, `possible_actions`, `caution`으로 구성된다. `caution.applies_to_cluster=true`이며, 승인 시 `command.requested`를 거쳐 target agent apply로 이어질 수 있음을 `risk_notes`에 남긴다. 단, 이 도구는 승인·거절·command 생성을 하지 않는다.

  Safe PR 분기:
  1. `workflow_run_id`가 없으면 `missing_context=["workflow_run_id"]`를 반환한다.
  2. `context.db.list_release_safe_pr_diff_events(workspace_id, workflow_run_id, application_id?, limit=20)`를 조회한다.
  3. `safe_pr.patch_prepared`, `diff.explained`, `safe_pr.ready_for_creation` 중 하나도 없으면 설명하지 않고 `missing_context=["safe_pr.patch_prepared", "diff.explained"]`를 반환한다.
  4. 이벤트가 있으면 patch 경로, `patch_sha256`, `diff.explained.risk`, PR 생성 가능 여부를 설명한다.

  Safe PR 응답은 PR 생성 전 patch 초안 기준이다. `caution.applies_to_cluster=false`이며, 아직 target cluster apply가 아니라는 점을 `reasoning.risk_notes`에 남긴다. PR 생성/머지는 `scm-worker`와 Git provider 리뷰 흐름에서 진행해야 한다.

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
| `mark_ai_conversation_status` | `(self, workspace_id: str, conversation_id: str, status: str) -> bool` | `UPDATE ai_conversations SET status=?, updated_at=now() WHERE workspace_id=? AND conversation_id=?`. 갱신 행이 있으면 true |
| `record_ai_response` | `(self, payload: JsonObject) -> bool` | `unit_of_work()` 트랜잭션 안에서 먼저 상태 `STATUS_COMPLETED` 전이. 대상 대화가 없으면 false, 있으면 assistant 메시지 append(`message_id=payload["response_message_id"]`, `role=ROLE_ASSISTANT`) 후 true |
| `record_ai_failure` | `(self, payload: JsonObject) -> bool` | `unit_of_work()` 안에서 상태 `STATUS_FAILED` 전이만 수행하고 갱신 여부를 반환 |
| `list_ai_conversations` | `(self, workspace_id: str, *, user_id: str \| None = None, limit: int = 100) -> list[JsonObject]` | `SELECT conversation_id, title, status, updated_at WHERE workspace_id=?` + `user_id`가 있으면 `AND user_id=?`, `ORDER BY updated_at DESC LIMIT clamp(limit,1,200)` |
| `get_ai_conversation` | `(self, workspace_id: str, conversation_id: str, *, user_id: str \| None = None) -> JsonObject \| None` | 단건 SELECT (workspace_id+conversation_id, `user_id`가 있으면 user 범위 포함), 없으면 None |
| `delete_ai_conversation` | `(self, workspace_id: str, conversation_id: str, *, user_id: str \| None = None) -> bool` | `DELETE ai_conversations WHERE workspace_id=? AND conversation_id=?` + `user_id`가 있으면 `AND user_id=?`, `RETURNING conversation_id`. 삭제 행이 있으면 true, 없으면 false. 메시지는 FK `ON DELETE CASCADE` |
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
| `POST /ai/chat` (`AI_CHAT_PATH`) | `chat_with_context` | `AiChatRequest` | `AiChatResponse` | `require_session` + `inventory.read` 범위 |
| `GET /ai/suggestions?context=<JSON>` (`AI_SUGGESTIONS_PATH`) | `list_context_suggestions` | strict `AiAssistantContext` JSON | `AiSuggestionsResponse` | `require_session` |
| `GET /ai/resources/{kind}` (`AI_RESOURCES_PATH`) | `list_context_resources` | allowlist kind + `cluster_id?`, `namespace?`, `limit<=100` | `list[AiResourceSummary]` | `require_session` + `inventory.read` 범위 |
| `GET /ai/resources/{kind}/{namespace}/{name}` (`AI_RESOURCE_PATH`) | `get_context_resource` | allowlist kind + 필수 `cluster_id`; cluster-scoped namespace는 `_` | `AiResourceSummary` | `require_session` + `inventory.read` 범위 |

요청·응답 모델은 `src/packages/contracts/gateway/requests.py` / `responses.py` 정의를 사용한다 ([contracts](../packages/contracts.md)).

HTTP 라우터의 목록/조회/메시지 추가/삭제 경로는 repository 호출에 `user_id=current.user_id`를 넘긴다. 같은 workspace 안에서도 다른 사용자의 대화는 404 또는 목록 제외로 처리한다.

#### 제품 AI facade 계약 (BQ-052/BQ-053/BQ-066)

`AiAssistantContext`는 `extra="forbid"`이며 다음 정본 shape만 받는다.

```json
{
  "screen": "resources",
  "filters": {
    "clusters": ["game-server"],
    "namespaces": ["game-server/shop"],
    "applications": [],
    "labels": [],
    "resource_types": ["pod"],
    "health": [],
    "query": "checkout"
  },
  "selection": {"type": "resource", "identity": "Pod/shop/checkout-api-0"},
  "time": null,
  "log_stream_id": null
}
```

- `POST /ai/chat`은 위 context와 `message`를 받는다. 응답은 항상 `{answer, evidence:[{type,id,label,link}], action?}`이다. evidence가 비면 기본 `answer`는 `그 데이터가 없습니다.`이다. 단, 메시지가 현재 필터 범위에서 알림 규칙 생성 의도를 명확히 담고 있으면 inventory 근거가 없어도 `create_alert_rule` action을 제안하고, 실제 알림 규칙은 생성하지 않는다.
- 동기 facade는 LLM의 추론 결과를 기다리거나 기존 비동기 conversation 응답을 근거 없이 재포장하지 않는다. 현재 권한 범위 inventory의 `status`와 `health`만 문장화한다.
- `time`이 있으면 현재 projection으로 과거를 가장하지 않고 no-data로 닫는다. 선택 리소스가 없는데 application/label 필터가 있으면 그 축을 inventory 공개 필드로 검증할 수 없으므로 역시 닫는다.
- AI resource kind allowlist는 `pods`, `deployments`, `statefulsets`, `daemonsets`, `workloads`, `services`, `nodes`, `namespaces`, `events`다. 임의 kind/CRD 조회는 422다.
- `AiResourceSummary`는 `id`, `cluster_id`, `resource_type`, `kind`, `namespace`, `name`, `status`, `health`, `observed_at`, `link`만 노출한다. `raw`, labels, annotations, summary, uid/resourceVersion은 AI 경계에서 제외한다.
- evidence/resource `link`는 제품 내부 `/...`만 허용한다. Resources 상세은 정본 `?detail=Kind/ns/name`을 사용하고 cluster-scoped namespace는 `~`로 직렬화한다. `//`, scheme, fragment, 공백·제어문자는 모델 검증에서 거부한다.
- 명시한 `cluster_id`가 `inventory.read` 범위 밖이면 403이다. 목록/채팅의 묵시적 범위는 허용된 concrete cluster ID 집합으로만 조회하며 wildcard로 열지 않는다.
- 선택적 `log_stream_id`는 raw line 대신 전달하는 opaque persisted command ID다. `/ai/chat`은 command의 workspace, 요청 사용자, protocol, cluster, exact target을 다시 검증하고 `inventory.read`와 `evidence.read`를 모두 확인한다. 권한/소유권/완료된 근거가 없으면 canonical no-data로 닫는다.
- 로그 AI 근거는 첫 command의 workspace+correlation으로 최신 persisted batch를 최대 20개 조회하고, 동일 사용자·동일 논리 target인 completed Loki result에서 최신 evidence 최대 20개만 읽어 서버가 다시 redact/truncate한다. correlation 안에 다른 사용자/target/위조 correlation row가 섞이면 전체를 no-data로 닫는다. process-local stream cache나 브라우저가 보낸 raw line은 AI context로 사용하지 않는다. 응답 evidence type은 `log-stream`이고 내부 Resources 링크만 허용한다.

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

1. `db.get_ai_conversation(workspace_id, conversation_id, user_id=current.user_id)` — None이면 404 `"conversation not found"`.
2. `agent = payload.agent or str(conversation["agent"])`, `message_id = new_id("aim")`.
3. `request_context = normalize_context(payload.context or conversation.get("context") or {})`.
4. 단일 트랜잭션(`unit_of_work_or_null`) 안에서: 메시지 append(user) → `mark_ai_conversation_status(..., STATUS_WAITING)` → `AiMessageReceivedBody(..., context=request_context)` 발행.

### 대화 삭제 (`DELETE /ai/conversations/{conversation_id}`)

1. `workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)`.
2. `db.delete_ai_conversation(workspace_id, conversation_id, user_id=current.user_id)` 호출.
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
- `record_ai_response`는 메시지 기록과 상태 전이를 같은 `unit_of_work`로 묶고, 대상 대화가 없으면 false를 반환해 응답 메시지를 쓰지 않는다.
- HTTP 조회·삭제·메시지 추가는 항상 `workspace_id`와 `current.user_id` 필터를 함께 적용한다(워크스페이스 + 사용자 격리).
- 존재하지 않는 대화 접근 → HTTP 404 `"conversation not found"`.
- `messages.text` 미등록 키 → `KeyError` (fail-fast).
- 도구 limit는 항상 1–20으로 클램프.
- 대화 context 는 allowlist field만 저장/이벤트 발행한다. 리소스 상세·이벤트·RCA 내용은 conversation row에 복사하지 않고 도구 실행 시점의 실제 inventory/RCA read model에서 다시 조회한다.

## 설정 (Settings)

이 도메인 자체 환경변수 없음.
