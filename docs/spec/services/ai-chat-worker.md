---
source_commit: 1616d295
status: synced
---

# chat-worker — AI 대화 요청 → LLM 도구 호출 루프 응답

> 소스: `src/services/ai/chat-worker/app.py`, `src/services/ai/chat-worker/tools.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `ai.message.received` 를 받아 `ConversationEngine`(LLM + 도구 레지스트리)으로 응답을 생성,
  성공 시 `ai.message.responded`, 실패/타임아웃 시 `ai.message.failed` 를 발행한다.
- 대화 히스토리 조회·응답/실패 기록을 AI conversation 스토어에 남긴다.
- 서비스 로컬 도구(`list_recovery_playbooks`)를 `@ai.tool` 로 등록한다 —
  domains 는 services 를 import 할 수 없으므로(계층 규칙) 플레이북 조회 도구는 여기 위치.
- 서비스 이름은 `ai-chat-worker` (폴더명은 chat-worker).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.ai.agent` | [../../domains/ai.md](../domains/ai.md) | `build_system_prompt` |
| import | `domains.ai.events` | [../../domains/ai.md](../domains/ai.md) | `AiMessageReceivedBody/RespondedBody/FailedBody` |
| import | `domains.ai.messages` | [../../domains/ai.md](../domains/ai.md) | `text` (로케일 텍스트 카탈로그) |
| import | `domains.registry` | [../../domains/registry.md](../domains/registry.md) | `load_domain_tools()` — `domains/*/tools.py` 자동 발견 |
| import | `packages.ai.engine` | [../../packages/ai.md](../packages/ai.md) | `ConversationEngine` |
| import | `packages.ai.llm` | [../../packages/ai.md](../packages/ai.md) | `build_llm_client`, `describe_llm_client` |
| import | `packages.ai.tools` | [../../packages/ai.md](../packages/ai.md) | `ToolContext`, `ai` (ToolRegistry) |
| import | `packages.contracts.stores` | [../../packages/contracts.md](../packages/contracts.md) | `AiConversationStore` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App`, `EventContext` |
| import (tools.py) | `services.ai.agent.playbooks` | [agent.md](ai-agent.md#playbooks--룰-등록-네임스페이스) | `registered_cause_profiles`, `registered_recovery_rules` |
| 외부 | LLM provider HTTP API (OpenAI/Anthropic/Gemini/OpenAI 호환) | — | `LlmGateway` 경유 |

## 공개 인터페이스 (Public API)

### app.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/chat-worker/app.py :: app` | `App("ai-chat-worker")` |
| `llm_client` | `src/services/ai/chat-worker/app.py :: llm_client` | `build_llm_client()` — `LLM_PROVIDER` 기반 `LlmGateway` |
| `engine` | `src/services/ai/chat-worker/app.py :: engine` | `ConversationEngine(llm_client, ai)` (max_tool_calls 기본 4) |
| `AGENT_DEADLINE_SECONDS` | `src/services/ai/chat-worker/app.py :: AGENT_DEADLINE_SECONDS` | `20` — 런타임 핸들러 타임아웃(30s)보다 짧은 자체 데드라인 |
| `HISTORY_LIMIT` | `src/services/ai/chat-worker/app.py :: HISTORY_LIMIT` | `10` — transcript 주입 최근 메시지 수 |
| `response_message_id(request_message_id)` | `src/services/ai/chat-worker/app.py :: response_message_id` | `f"{request_message_id}-assistant"` |
| `request_locale(evt)` | `src/services/ai/chat-worker/app.py :: request_locale` | `evt.context["locale"]` → str 또는 None |
| `request_cluster_id(evt)` | `src/services/ai/chat-worker/app.py :: request_cluster_id` | `evt.context["cluster_id"]` → str 또는 None |
| `request_resource_context(evt)` | `src/services/ai/chat-worker/app.py :: request_resource_context` | `evt.context`에서 `application_id`, `diff_source`, `workflow_run_id`, `approval_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `incident_id`, `correlation_id`, `symptom`, `root_cause` 문자열만 trim 후 추출 |
| `on_ai_message_received(evt, ctx)` | `src/services/ai/chat-worker/app.py :: on_ai_message_received` | 유일한 핸들러 |

모듈 부팅 부수효과: `import tools`(로컬 도구 등록) + `load_domain_tools()`(도메인 도구 등록).

### tools.py

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `list_recovery_playbooks(context)` | `src/services/ai/chat-worker/tools.py :: list_recovery_playbooks` | `@ai.tool(name="list_recovery_playbooks", description="Registered RCA playbooks: symptom→cause profiles and cause→recovery actions.")` — 파라미터 없음 |

반환 형태:
```json
{
  "causes": [{"symptoms": [...], "required_sources": [...], "candidates": ["<candidate_id>", ...]}],
  "recoveries": [{"rule": "<클래스명>", "root_causes": [...] 또는 ["*"](폴백),
                   "actions": [{"action_type", "title", "risk_level", "approval_required"}]}]
}
```

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `AiMessageReceivedBody` | `ai.message.received` | `conversation_id, message_id, content, agent, user_id, workspace_id="default", context: JsonObject?` (context 에 `locale`, `cluster_id`, `application_id`, `diff_source`, `workflow_run_id`, `approval_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `incident_id`, `correlation_id`, `symptom`, `root_cause` 선택 포함) |

### 발행 (Publishes)

| 조건 | 이벤트 | 라우팅 키 | 구성 |
|---|---|---|---|
| 성공 | `AiMessageRespondedBody` | `ai.message.responded` | `response_message_id="{message_id}-assistant"`, `content=result.content.strip() or text("chat.empty_response", locale)`, `metadata={"llm": describe_llm_client(...)(provider/model/base_url/timeout/max_retries), "raw_length", "tool_trace", "request_event_id": ctx.event_id, "correlation_id": ctx.correlation_id}` |
| 예외/타임아웃 | `AiMessageFailedBody` | `ai.message.failed` | `reason = text("chat.timeout_reason", locale, seconds=20)`(TimeoutError) 또는 `text("chat.failure_reason", locale, error=exc)`, `metadata={"request_event_id", "correlation_id"}` |

## 동작 (Behavior)

1. `locale = request_locale(evt)`, `resource_context = request_resource_context(evt)`.
2. `history = await ctx.db.list_ai_messages(evt.workspace_id, evt.conversation_id, newest=10)`.
3. `asyncio.wait_for(engine.respond(...), timeout=20)` 호출. `engine.respond` 인자:
   - `system_prompt = build_system_prompt(evt, locale)` —
     `text("chat.system_prompt", locale)` ("You are an operations assistant for a Kubernetes
     event-driven platform...", ko 번역 있음) + `Agent:`/`Conversation:`/`Workspace:`/
     `Context: {json.dumps(evt.context, sort_keys=True)}` 줄들.
   - `history`, `user_message=evt.content`,
     `context=ToolContext(db=ctx.db, workspace_id, user_id, cluster_id, resource_type, kind, namespace, name, uid, incident_id, correlation_id, symptom, root_cause, resource_context, locale)`.
     `application_id`, `diff_source`, `workflow_run_id`, `approval_id`는 `ToolContext` 직접 필드가 아니라 `resource_context` 안에 남는다. `explain_diff_risk` 같은 도구는 `_context_value()`로 직접 인자 → `resource_context` 순서로 읽는다.
4. **LLM 호출 상세** (`ConversationEngine` / `LlmGateway`):
   - 프롬프트 = `system_prompt` + 도구 프로토콜 안내(엄격 JSON:
     `{"type": "final", "content": ...}` / `{"type": "tool_call", "tool": ..., "arguments": {...}}`)
     + 레지스트리에서 생성한 `## Available tools` 목록 + `## Transcript`(히스토리 `[role] content` 줄
     + `[user] ...` + 도구 결과 `[tool:<name>] {...}` 줄).
   - 단일 user 메시지로 provider API 호출(chat template 미사용).
     `temperature=0.2`(DEFAULT_TEMPERATURE), `max_tokens` 는 미지정(Anthropic 만
     `LLM_MAX_TOKENS` 기본 1024 사용), 모델/엔드포인트는 provider env 로 결정.
   - `tool_call` 응답이면 `ai` 레지스트리로 실행(인자 검증 실패·미등록·핸들러 예외는
     오류 결과로 transcript 에 회신), 최대 4회(`DEFAULT_MAX_TOOL_CALLS`) 후
     최종 답변 강제 재요청. JSON 파싱 실패는 전체 텍스트를 최종 답변으로 폴백.
   - HTTP 재시도: 408/429/5xx·타임아웃은 `LLM_MAX_RETRIES`(기본 2)회, Retry-After 존중,
     지수 백오프(최대 8s).
5. 성공 시 `AiMessageRespondedBody` 구성 →
   `await ctx.db.record_ai_response({**response.to_body(), "correlation_id": ctx.correlation_id})`
   → yield.
6. 모든 예외(LLM 미설정 ValueError 포함)는 catch:
   `AiMessageFailedBody` 구성 → `await ctx.db.record_ai_failure(failure.to_body())` → yield.

## 불변식·오류 (Invariants & Errors)

- 자체 데드라인(20s) < 런타임 핸들러 타임아웃(30s) — 실패 기록/이벤트가 항상 실행될 예산 확보,
  대화가 waiting 상태로 영구히 남지 않는다.
- 요청 1건당 발행 이벤트는 정확히 1건(responded XOR failed).
- `LLM_PROVIDER` 미설정 시 부팅은 성공하고, 요청 시점 `ValueError` 로 실패 이벤트 경로에 수렴.
- 도구 실행 오류는 대화 실패가 아니라 tool_trace 의 `ok=False` 항목으로 기록된다.

## 설정 (Settings)

LLM 설정(`packages/ai/llm.py`, 상세는 [../../packages/ai.md](../packages/ai.md)):

| 키 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `LLM_PROVIDER` | str | `unconfigured` | `openai` / `openai-compatible`(별칭 http, compatible 등) / `anthropic`(별칭 claude) / `gemini`(별칭 google) |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | str | — | provider 공통 폴백 키 |
| `LLM_TIMEOUT_SECONDS` | float | `30` | provider HTTP 타임아웃 |
| `LLM_MAX_RETRIES` | int | `2` | 재시도 상한(408/429/5xx/전송 오류) |
| `LLM_MAX_TOKENS` | int | `1024` | Anthropic 기본 max_tokens |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | str | base `https://api.openai.com/v1`, model `gpt-4o-mini` | openai provider |
| `OPENAI_COMPATIBLE_API_KEY` / `OPENAI_COMPATIBLE_BASE_URL` / `OPENAI_COMPATIBLE_MODEL` | str | openai 기본값 폴백 | openai-compatible provider |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` / `ANTHROPIC_VERSION` | str | base `https://api.anthropic.com`, model `claude-3-5-haiku-latest`, version `2023-06-01` | anthropic provider |
| `GEMINI_API_KEY`(또는 `GOOGLE_API_KEY`) / `GEMINI_BASE_URL` / `GEMINI_MODEL` | str | base `https://generativelanguage.googleapis.com/v1beta`, model `gemini-2.5-flash` | gemini provider |

워커 상수(코드 고정, env 아님): `AGENT_DEADLINE_SECONDS=20`, `HISTORY_LIMIT=10`,
엔진 `max_tool_calls=4`, `temperature=0.2`.

공통 워커 런타임 설정은 [evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=ai-chat-worker`).
