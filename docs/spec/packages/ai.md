---
source_commit: 1616d295
status: synced
---

# packages/ai — AI 공유 커널(LLM 게이트웨이·에이전트 베이스·대화 엔진·도구 레지스트리·RCA 룰 검증)

> 소스: `src/packages/ai/` · 테스트: `tests/test_ai_agent.py`, `tests/test_ai_engine.py`, `tests/test_ai_tool_registry.py`, `tests/test_llm_gateway_retry.py`, `tests/test_rca_rule_catalog.py`

## 책임 (Responsibility)

- AI 에이전트들이 재사용하는 **인프라**: LLM port(`LlmClient`)와 provider 어댑터(OpenAI/Anthropic/Gemini/OpenAI 호환), 에이전트 베이스 ABC(`AiAgent`), 도구 호출 루프 대화 엔진(`ConversationEngine`), `@ai.tool` 도구 레지스트리.
- RCA 룰 YAML의 저장 전 검증 schema(`rule_catalog.py`)를 domain API와 AI service 로더가 같이 쓰는 순수 계약으로 제공한다.
- 도메인 로직은 `domains/<capability>` 에, 에이전트 프로세스는 [services/ai/*](../services/ai-chat-worker.md) 에 둠. 이 패키지는 NATS/HTTP/DB 를 모른다(저장소 접근은 `ToolContext.db` 로만 흘러듦; 이벤트 배선은 서비스 레이어 책임).

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.config.settings` | [config](config.md) | `env` |
| 외부 | `httpx` | — | provider HTTP 호출 |
| 외부 | `pydantic`, `yaml` | — | RCA 룰 YAML schema 검증 |
| 피참조 | `domains/*/tools.py`, `services/ai/*` | [domains/ai](../domains/ai.md), [services/ai](../services/ai-chat-worker.md) | 도구 등록·엔진 사용 |

## 공개 인터페이스 (Public API)

### `llm.py` — LLM Gateway port + provider adapter

에이전트는 `LlmClient` port 하나만 호출 — gateway 가 env 설정으로 adapter 를 선택하므로 에이전트 코드 수정 없이 provider 교체 가능.

env 키 상수(앵커 `src/packages/ai/llm.py :: <이름>`): `LLM_PROVIDER_ENV="LLM_PROVIDER"`, `LLM_BASE_URL_ENV="LLM_BASE_URL"`, `LLM_API_KEY_ENV="LLM_API_KEY"`, `LLM_MODEL_ENV="LLM_MODEL"`, `LLM_TIMEOUT_SECONDS_ENV="LLM_TIMEOUT_SECONDS"`, `LLM_MAX_RETRIES_ENV="LLM_MAX_RETRIES"`, `LLM_MAX_TOKENS_ENV="LLM_MAX_TOKENS"`, `OPENAI_API_KEY_ENV`, `OPENAI_BASE_URL_ENV`, `OPENAI_MODEL_ENV`, `OPENAI_COMPATIBLE_API_KEY_ENV`, `OPENAI_COMPATIBLE_BASE_URL_ENV`, `OPENAI_COMPATIBLE_MODEL_ENV`, `ANTHROPIC_API_KEY_ENV`, `ANTHROPIC_BASE_URL_ENV`, `ANTHROPIC_MODEL_ENV`, `ANTHROPIC_VERSION_ENV`, `GEMINI_API_KEY_ENV`, `GOOGLE_API_KEY_ENV`, `GEMINI_BASE_URL_ENV`, `GEMINI_MODEL_ENV` (각 이름 = 값).

기본값 상수:

| 상수 | 값 |
|---|---|
| `DEFAULT_LLM_PROVIDER` | `"unconfigured"` |
| `DEFAULT_LLM_TIMEOUT_SECONDS` | `"30"` |
| `DEFAULT_LLM_MAX_RETRIES` | `"2"` |
| `DEFAULT_LLM_MAX_TOKENS` | `"1024"` |
| `DEFAULT_TEMPERATURE` | `0.2` |
| `DEFAULT_OPENAI_BASE_URL` | `"https://api.openai.com/v1"` |
| `DEFAULT_OPENAI_MODEL` | `"gpt-4o-mini"` |
| `DEFAULT_ANTHROPIC_BASE_URL` | `"https://api.anthropic.com"` |
| `DEFAULT_ANTHROPIC_MODEL` | `"claude-3-5-haiku-latest"` |
| `DEFAULT_ANTHROPIC_VERSION` | `"2023-06-01"` |
| `DEFAULT_GEMINI_BASE_URL` | `"https://generativelanguage.googleapis.com/v1beta"` |
| `DEFAULT_GEMINI_MODEL` | `"gemini-2.5-flash"` |
| `RETRYABLE_HTTP_STATUS` | `{408, 429, 500, 502, 503, 504}` |
| `MAX_RETRY_AFTER_SECONDS` | `30.0` |
| `JSON_PARSE_ATTEMPTS` | `2` |
| `PROVIDER_OPENAI` / `PROVIDER_OPENAI_COMPATIBLE` / `PROVIDER_ANTHROPIC` / `PROVIDER_GEMINI` / `PROVIDER_UNCONFIGURED` | `"openai"` / `"openai-compatible"` / `"anthropic"` / `"gemini"` / `"unconfigured"` |

provider 별칭(내부 `_PROVIDER_ALIASES`): `""`/`unconfigured`→unconfigured, `http`/`openai_compatible`/`openai-compatible`/`compatible`→openai-compatible, `claude`/`anthropic`→anthropic, `google`/`gemini`→gemini, `openai`→openai.

- `src/packages/ai/llm.py :: LlmClient` — `Protocol` (에이전트가 쓰는 추상 port):
```python
async def complete(self, prompt: str, **options: Any) -> str
async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any
```
- `src/packages/ai/llm.py :: LlmProviderAdapter` — `Protocol`: `async def complete(self, request: LlmRequest) -> str`.
- `src/packages/ai/llm.py :: LlmRequest` — `@dataclass(frozen=True, slots=True)`

| 필드 | 타입 | 기본값 |
|---|---|---|
| `prompt` | `str` | (필수) |
| `model` | `str` | (필수) |
| `temperature` | `float` | `DEFAULT_TEMPERATURE` |
| `max_tokens` | `int \| None` | `None` |
| `response_format` | `dict[str, Any] \| None` | `None` |
| `extra` | `Mapping[str, Any]` | `{}` |

- `src/packages/ai/llm.py :: LlmProviderSettings` — `@dataclass(frozen=True, slots=True)`: `provider: str`, `base_url: str`, `api_key: str`, `api_key_env: str | None`, `model: str`, `timeout_seconds: float`, `max_retries: int`, `default_max_tokens: int`, `anthropic_version: str = DEFAULT_ANTHROPIC_VERSION`.
- `src/packages/ai/llm.py :: LlmGateway` — 모든 에이전트 LLM 호출의 단일 진입점(`LlmClient` 구현).

```python
class LlmGateway:
    def __init__(self, *, default_provider: str,
                 settings_loader: Callable[[str], LlmProviderSettings] = load_provider_settings,
                 adapters: Mapping[str, LlmProviderAdapter] | None = None) -> None
    async def complete(self, prompt: str, **options: Any) -> str
        # options 에서 provider/model/temperature/max_tokens/response_format 을 꺼내고
        # 나머지는 LlmRequest.extra 로. adapter.complete 를 _call_with_retry 로 실행
    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any
        # 프롬프트에 "Return only JSON that matches this JSON Schema:\n{schema}" 부가 +
        # response_format={"type": "json_object"}. 코드펜스 제거 후 json.loads —
        # 파싱 실패는 JSON_PARSE_ATTEMPTS(2)회까지 재요청, 최종 실패 시 ValueError("LLM did not return valid JSON")
    def metadata(self, *, provider: str | None = None) -> dict[str, Any]
        # {provider, model, base_url, timeout_seconds, max_retries}
```
재시도(내부 `_call_with_retry`): `httpx.HTTPStatusError` 는 `RETRYABLE_HTTP_STATUS` 이고 attempt < max_retries 일 때만 재시도(Retry-After 헤더가 유효하면 그 값을 30s 상한으로 따르고, 없으면 지수 백오프 `min(2**(attempt-1), 8)`). `httpx.TimeoutException`/`TransportError` 도 한도 내 재시도. settings/adapters 는 provider 별 캐시.

- provider 어댑터(모두 `@dataclass(slots=True)`, `settings: LlmProviderSettings`, `transport: httpx.AsyncBaseTransport | None = None`):
  - `src/packages/ai/llm.py :: OpenAiChatCompletionsAdapter` — `POST {base_url}/chat/completions`, `authorization: Bearer`, payload: model/messages/temperature (+max_tokens/response_format/extra). 응답은 `_extract_openai_text`(choices[0].message.content — str 또는 text/content 파트 list).
  - `src/packages/ai/llm.py :: AnthropicMessagesAdapter` — `POST {base_url}/v1/messages`, 헤더 `x-api-key`/`anthropic-version`. `max_tokens` 는 항상 존재(`request.max_tokens or settings.default_max_tokens`). 응답은 `_extract_anthropic_text`(content str 또는 type=="text" 파트).
  - `src/packages/ai/llm.py :: GeminiGenerateContentAdapter` — `POST {base_url}/models/{model}:generateContent`, 헤더 `x-goog-api-key`. `generationConfig` 에 temperature(+maxOutputTokens); `response_format.type=="json_object"` 이면 `responseMimeType="application/json"`. 응답은 `_extract_gemini_text`(candidates[0].content.parts[].text).
  - `src/packages/ai/llm.py :: UnconfiguredLlmAdapter` — `complete` 호출 시 `ValueError("LLM_PROVIDER is required")`.

- 빌더·헬퍼:
```python
def build_llm_client() -> LlmClient
    # LlmGateway(default_provider=env(LLM_PROVIDER, "unconfigured")).
    # provider 이름 오설정은 부팅에서 즉시 실패, 미설정/API 키 부재는 요청 시점 ValueError
    # → 워커의 실패 이벤트(ai.message.failed 등) 경로로 수렴
def build_provider_adapter(settings: LlmProviderSettings) -> LlmProviderAdapter
    # unconfigured→Unconfigured, openai|openai-compatible→OpenAiChatCompletions,
    # anthropic→AnthropicMessages, gemini→GeminiGenerateContent, 그 외 ValueError
def load_provider_settings(provider: str) -> LlmProviderSettings
    # provider 별 env 우선순위:
    #  openai: base=(OPENAI_BASE_URL→LLM_BASE_URL), key=(OPENAI_API_KEY→LLM_API_KEY), model=(OPENAI_MODEL→LLM_MODEL)
    #  openai-compatible: base=(OPENAI_COMPATIBLE_BASE_URL→LLM_BASE_URL→OPENAI_BASE_URL),
    #    key=(OPENAI_COMPATIBLE_API_KEY→LLM_API_KEY→OPENAI_API_KEY), model=(OPENAI_COMPATIBLE_MODEL→LLM_MODEL→OPENAI_MODEL)
    #  anthropic: base=ANTHROPIC_BASE_URL, key=ANTHROPIC_API_KEY(만), model=(ANTHROPIC_MODEL→LLM_MODEL), version=ANTHROPIC_VERSION
    #  gemini: base=GEMINI_BASE_URL, key=(GEMINI_API_KEY→GOOGLE_API_KEY), model=(GEMINI_MODEL→LLM_MODEL)
    # API 키 전부 부재 시 ValueError("<env names> is required for LLM provider <p>")
    # base_url 은 rstrip("/"). unconfigured 는 빈 값 settings
def normalize_provider(provider: str) -> str
    # strip/lower/공백→"-"; 별칭 테이블 밖이면 ValueError("unsupported LLM provider: ...")
def describe_llm_client(client: LlmClient) -> dict[str, Any]
    # client.metadata() 있으면 그 결과, 없으면 {"provider": 클래스명, "model": "unknown"}
```

### `rule_catalog.py` — RCA 룰 YAML 검증 schema

도메인 라우터(`/rca/rules/validate`)와 `services/ai/agent/causes/loader.py`가 같이 쓰는 순수 schema다. 여기서는 `CauseProfile` 같은 service 객체를 만들지 않고, `CatalogRuleSpec`/`CatalogCandidateSpec` 데이터로만 반환한다.

| 심볼 | 계약 |
|---|---|
| `MATCHER_KEYS` | `("fact", "log_pattern", "event_pattern")` |
| `CatalogValidationIssue` | `@dataclass(frozen=True)`: `code`, `detail`, `line: int \| None = None` |
| `CatalogCandidateSpec` | `candidate_id`, `title`, `description`, `expected_evidence: tuple[str, ...]`, `checks: tuple[str, ...]`, `signals: tuple[dict[str, Any], ...]` |
| `CatalogRuleSpec` | `rule_id`, `symptoms`, `required_sources`, `candidates` |
| `CatalogValidationResult` | `valid: bool`, `rules: tuple[CatalogRuleSpec, ...] = ()`, `errors: tuple[CatalogValidationIssue, ...] = ()` |
| `CatalogSignalMatcherModel` | Pydantic model. `fact`/`log_pattern`/`event_pattern` 중 정확히 하나만 허용한다. |
| `CatalogSignalGroupModel` | `id`, `any_of: list[CatalogSignalMatcherModel]` |
| `CatalogCandidateModel` | `candidate_id`, `title`, `description`, `expected_evidence`, `checks`, `signals=[]` |
| `CatalogRuleModel` | `id`, `symptoms`, `required_sources`, `candidates` |
| `CatalogFileModel` | root schema: `rules: list[CatalogRuleModel]` |
| `validate_catalog_yaml(raw_text: str) -> CatalogValidationResult` | YAML parse/schema/파일 내부 rule id 중복을 검증한다. 오류 code는 `yaml_parse_error`, `schema_error`, `duplicate_rule_id` 중 하나다. |

### `agent.py` — 에이전트 베이스(ABC)

- `src/packages/ai/agent.py :: AiAgent`

```python
class AiAgent(ABC):
    def __init__(self, llm: LlmClient) -> None
    @abstractmethod
    def build_prompt(self, evt: Any, **context: Any) -> str   # 이벤트(+history/locale 등) → 프롬프트
    @abstractmethod
    def parse_result(self, raw: str) -> Any                    # LLM 출력 → 결과 이벤트 바디
    async def run(self, evt: Any, **context: Any) -> Any
        # parse_result(await llm.complete(build_prompt(evt, **context)))
```
새 에이전트는 두 훅만 구현한다. ABC라 필수 훅을 구현하지 않으면 인스턴스화 단계에서 막힌다(런타임 깊은 곳 실패 방지).

### `engine.py` — 대화 엔진(도구 호출 루프)

`__all__ = ["DEFAULT_MAX_TOOL_CALLS", "ConversationEngine", "EngineResult"]`.

LLM 응답 프로토콜(엄격 JSON): `{"type": "final", "content": "..."}` 또는 `{"type": "tool_call", "tool": "이름", "arguments": {...}}`.

- `src/packages/ai/engine.py :: DEFAULT_MAX_TOOL_CALLS` — `= 4`.
- `src/packages/ai/engine.py :: REPLY_TYPE_FINAL` / `REPLY_TYPE_TOOL_CALL` — `"final"` / `"tool_call"`.
- `src/packages/ai/engine.py :: EngineResult` — `@dataclass(frozen=True)`: `content: str`, `tool_trace: list[dict[str, Any]] = []`, `raw_length: int = 0`.
- `src/packages/ai/engine.py :: ConversationEngine`

```python
class ConversationEngine:
    def __init__(self, llm: LlmClient, registry: ToolRegistry, *,
                 max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS) -> None
    def tools_prompt_section(self) -> str
        # 프로토콜 안내문 + "## Available tools" — 레지스트리 spec 별
        # "- name: description" + 파라미터 "(required)"/type/description 나열.
        # 도구 0개면 "(no tools registered — always reply with a final answer)"
    async def respond(self, *, system_prompt: str, history: list[dict[str, Any]],
                      user_message: str, context: ToolContext,
                      llm_timeout_seconds: float | None = None) -> EngineResult
```
`respond` 동작:
1. transcript = history 각 행을 `"[{role}] {content}"` 로 + `"[user] {user_message}"`.
2. 최대 `max_tool_calls` 회: `_complete`(프롬프트 = system_prompt + tools 섹션 + `## Transcript`; timeout 지정 시 `asyncio.wait_for`) → `_parse_reply`. tool_call 이 아니면 즉시 `EngineResult(content, tool_trace, raw_length)` 반환.
3. tool_call 이면 `registry.execute` — 성공 `{tool, arguments, ok: True, result}`, 예외 `{tool, arguments, ok: False, error}` 를 trace 에 쌓고 transcript 에 `[tool:<name>] {json}` 추가 후 루프.
4. 예산 소진: `[system] Tool call budget exhausted...` 공지 후 1회 더 호출 — final 이면 그 content, 또 tool_call 이면 원문 텍스트를 답변으로 폴백.

파싱(내부 `_parse_reply`): JSON 파싱 실패 또는 미지 type 이면 전체 텍스트를 final 로 취급(우아한 폴백).

### `tools.py` — 도구 레지스트리(의존 없는 leaf)

`@ai.tool` 이 "LLM 이 호출 가능한 플랫폼 능력"의 단일 출처. 대화 엔진은 레지스트리만 읽음 — 새 도구 추가 = 도구 파일 1개(엔진 수정 없음). `__all__ = ["ToolContext", "ToolHandler", "ToolRegistry", "ToolSpec", "ai", "registered_ai_tools"]`.

- `src/packages/ai/tools.py :: ToolHandler` — `Callable[..., Awaitable[Any]]`. 시그니처 규약: `(context: ToolContext, **검증된 kwargs) -> JSON 직렬화 가능 값`.
- `src/packages/ai/tools.py :: ToolContext` — `@dataclass(frozen=True)`: `db: Any`, `workspace_id: str`, `user_id: str`, `cluster_id: str | None = None`, `resource_type: str | None = None`, `kind: str | None = None`, `namespace: str | None = None`, `name: str | None = None`, `uid: str | None = None`, `incident_id: str | None = None`, `correlation_id: str | None = None`, `symptom: str | None = None`, `root_cause: str | None = None`, `resource_context: dict[str, Any] | None = None`, `locale: str | None = None`. 도구는 이 외의 전역에 의존하지 않음.
- `src/packages/ai/tools.py :: ToolSpec` — `@dataclass(frozen=True)`

| 필드 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `name` | `str` | (필수) | 도구 이름 |
| `description` | `str` | (필수) | 설명 |
| `parameters` | `dict[str, Any]` | (필수) | JSON Schema properties 스타일 `{"인자명": {"type", "description", "required"}}` |
| `handler` | `ToolHandler` | (필수) | async 핸들러 |
| `locales` | `tuple[str, ...]` | `()` | 빈 튜플 = 모든 로케일 허용 |

```python
def required_parameters(self) -> tuple[str, ...]       # schema.get("required") is True 인 이름들
def validate_arguments(self, arguments: dict[str, Any]) -> dict[str, Any]
    # 미지 인자 → ValueError("unknown arguments for tool ..."), 필수 누락 → ValueError("missing required arguments ...")
```

- `src/packages/ai/tools.py :: ToolRegistry`

```python
class ToolRegistry:
    def tool(self, *, name: str, description: str, parameters: dict[str, Any] | None = None,
             locales: tuple[str, ...] = ()) -> Callable[[ToolHandler], ToolHandler]
        # 데코레이터. 같은 이름의 기존 spec 과 계약이 다르면 ValueError("duplicate ai tool: ...")
        # 동일 계약 재선언(모듈 재로딩)은 멱등. fn.__tool_spec__ = spec 부착
    def spec(self, name: str) -> ToolSpec        # 미등록 시 ValueError("unknown ai tool: ...; registered: ...")
    def get(self, name: str) -> ToolSpec | None
    def tools(self) -> tuple[ToolSpec, ...]      # 이름 정렬 순
    def tool_names(self) -> tuple[str, ...]
    async def execute(self, name: str, context: ToolContext, arguments: dict[str, Any]) -> Any
        # spec 조회 → validate_arguments → handler(context, **kwargs)
    def describe(self) -> str                    # make 표시용 표
```
계약 동일성 판정(내부 `_same_contract`): description·parameters·locales·`handler.__qualname__` 비교(모듈 경로는 비교하지 않음 — 서비스 로컬 모듈이 다른 이름으로 재로딩될 수 있음).

- `src/packages/ai/tools.py :: ai` — 모듈 전역 `ToolRegistry()` 싱글턴.
- `src/packages/ai/tools.py :: registered_ai_tools`
```python
def registered_ai_tools() -> tuple[ToolSpec, ...]   # 조회 관례(registered_*) — ai.tools()
```

`src/packages/ai/__init__.py` 는 docstring 만.

## 동작 (Behavior)

1. 서비스 부팅: `build_llm_client()` 로 gateway 획득, `domains.registry.load_domain_tools()`([storage](storage.md#도메인-자동발견registry-연동) 의 registry) 로 `@ai.tool` 자동 등록.
2. 대화 1턴: 서비스가 `ConversationEngine.respond(system_prompt, history, user_message, ToolContext(db=AsyncDb(...), workspace_id, cluster_id?, resource_type?, kind?, namespace?, name?, uid?, locale?))` 호출 → 도구 루프(상한 4) → `EngineResult`.
3. 단발 에이전트: `AiAgent` 하위 클래스의 `run(evt)` = 프롬프트 생성 → `llm.complete` → 결과 파싱.
4. RCA 룰 저장 전 검증: `domains.rca.router.validate_rca_rule_catalog`는 `validate_catalog_yaml` 결과의 첫 rule symptom과 전체 후보 수를 응답한다. AI service 로더는 같은 schema 결과를 `CauseProfile`로 변환해 `CAUSE_PROFILES`에 병합한다.

## 불변식·오류 (Invariants & Errors)

1. provider 이름 오설정(`normalize_provider` 실패)은 부팅 시 `ValueError` fail-fast; provider 미설정·API 키 부재는 **요청 시점** `ValueError` — 워커 실패 이벤트 경로로 수렴.
2. `complete_json` 은 최대 2회 시도 후 `ValueError("LLM did not return valid JSON")`.
3. 재시도 대상은 408/429/5xx(일부)와 전송 오류뿐; Retry-After 는 30s 상한.
4. 도구 이름 중복(계약 상이)은 등록 시 `ValueError`; 동일 계약 재선언은 멱등.
5. `execute` 의 미등록 도구·인자 오류는 예외 — 엔진은 이를 잡아 `ok: False` trace 로 LLM 에 회신(대화는 계속).
6. 엔진 응답이 프로토콜 JSON 이 아니면 전체 텍스트를 최종 답변으로 취급(예외 아님).
7. 이 패키지는 NATS/HTTP 서버/DB 커넥션을 직접 만들지 않는다.
8. RCA 룰 matcher는 `fact`/`log_pattern`/`event_pattern` 중 하나만 가질 수 있고, 한 YAML 안의 rule id 중복은 `duplicate_rule_id`로 실패한다.

## 설정 (Settings)

| 환경변수 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `LLM_PROVIDER` | str | `unconfigured` | provider 선택(별칭 허용: http/claude/google 등) |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | str | — | provider 공통 폴백 |
| `LLM_TIMEOUT_SECONDS` | float | `30` | HTTP 타임아웃 |
| `LLM_MAX_RETRIES` | int | `2` | 재시도 상한 |
| `LLM_MAX_TOKENS` | int | `1024` | Anthropic 기본 max_tokens |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | str | —/`https://api.openai.com/v1`/`gpt-4o-mini` | openai |
| `OPENAI_COMPATIBLE_API_KEY` / `OPENAI_COMPATIBLE_BASE_URL` / `OPENAI_COMPATIBLE_MODEL` | str | — | openai 호환 |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` / `ANTHROPIC_VERSION` | str | —/`https://api.anthropic.com`/`claude-3-5-haiku-latest`/`2023-06-01` | anthropic |
| `GEMINI_API_KEY` / `GOOGLE_API_KEY` / `GEMINI_BASE_URL` / `GEMINI_MODEL` | str | —/—/`https://generativelanguage.googleapis.com/v1beta`/`gemini-2.5-flash` | gemini |
