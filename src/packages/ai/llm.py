"""LLM Gateway port 와 provider adapter.

에이전트는 `LlmClient` port 하나만 호출 — gateway 가 env 설정으로 provider adapter 를
선택하므로 에이전트 코드 수정 없이 OpenAI/Anthropic/Gemini/OpenAI 호환 교체 가능
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import Awaitable, Callable, Mapping
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from packages.config.settings import env

LLM_PROVIDER_ENV = "LLM_PROVIDER"
LLM_BASE_URL_ENV = "LLM_BASE_URL"
LLM_API_KEY_ENV = "LLM_API_KEY"
LLM_MODEL_ENV = "LLM_MODEL"
LLM_TIMEOUT_SECONDS_ENV = "LLM_TIMEOUT_SECONDS"
LLM_MAX_RETRIES_ENV = "LLM_MAX_RETRIES"
LLM_MAX_TOKENS_ENV = "LLM_MAX_TOKENS"

OPENAI_API_KEY_ENV = "OPENAI_API_KEY"
OPENAI_BASE_URL_ENV = "OPENAI_BASE_URL"
OPENAI_MODEL_ENV = "OPENAI_MODEL"
OPENAI_COMPATIBLE_API_KEY_ENV = "OPENAI_COMPATIBLE_API_KEY"
OPENAI_COMPATIBLE_BASE_URL_ENV = "OPENAI_COMPATIBLE_BASE_URL"
OPENAI_COMPATIBLE_MODEL_ENV = "OPENAI_COMPATIBLE_MODEL"
ANTHROPIC_API_KEY_ENV = "ANTHROPIC_API_KEY"
ANTHROPIC_BASE_URL_ENV = "ANTHROPIC_BASE_URL"
ANTHROPIC_MODEL_ENV = "ANTHROPIC_MODEL"
ANTHROPIC_VERSION_ENV = "ANTHROPIC_VERSION"
GEMINI_API_KEY_ENV = "GEMINI_API_KEY"
GOOGLE_API_KEY_ENV = "GOOGLE_API_KEY"
GEMINI_BASE_URL_ENV = "GEMINI_BASE_URL"
GEMINI_MODEL_ENV = "GEMINI_MODEL"

DEFAULT_LLM_PROVIDER = "unconfigured"
DEFAULT_LLM_TIMEOUT_SECONDS = "30"
DEFAULT_LLM_MAX_RETRIES = "2"
DEFAULT_LLM_MAX_TOKENS = "1024"
DEFAULT_TEMPERATURE = 0.2

DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1"
DEFAULT_OPENAI_MODEL = "gpt-4o-mini"
DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-haiku-latest"
DEFAULT_ANTHROPIC_VERSION = "2023-06-01"
DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"

RETRYABLE_HTTP_STATUS = {408, 429, 500, 502, 503, 504}
MAX_RETRY_AFTER_SECONDS = 30.0
JSON_PARSE_ATTEMPTS = 2

PROVIDER_OPENAI = "openai"
PROVIDER_OPENAI_COMPATIBLE = "openai-compatible"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_GEMINI = "gemini"
PROVIDER_UNCONFIGURED = "unconfigured"

_PROVIDER_ALIASES = {
    "": PROVIDER_UNCONFIGURED,
    "unconfigured": PROVIDER_UNCONFIGURED,
    "http": PROVIDER_OPENAI_COMPATIBLE,
    "openai_compatible": PROVIDER_OPENAI_COMPATIBLE,
    "openai-compatible": PROVIDER_OPENAI_COMPATIBLE,
    "compatible": PROVIDER_OPENAI_COMPATIBLE,
    "claude": PROVIDER_ANTHROPIC,
    "anthropic": PROVIDER_ANTHROPIC,
    "google": PROVIDER_GEMINI,
    "gemini": PROVIDER_GEMINI,
    "openai": PROVIDER_OPENAI,
}

OPENAI_NATIVE_TOOL_EXTRA_PROTECTED_KEYS = frozenset(
    {
        "max_tokens",
        "messages",
        "model",
        "response_format",
        "temperature",
        "tool_choice",
        "tools",
    }
)
ANTHROPIC_NATIVE_TOOL_EXTRA_PROTECTED_KEYS = frozenset(
    {
        "max_tokens",
        "messages",
        "model",
        "system",
        "temperature",
        "tools",
    }
)
GEMINI_NATIVE_TOOL_EXTRA_PROTECTED_KEYS = frozenset(
    {
        "contents",
        "generationConfig",
        "systemInstruction",
        "tools",
    }
)


class LlmClient(Protocol):
    """에이전트가 사용하는 추상 LLM port"""

    async def complete(self, prompt: str, **options: Any) -> str: ...

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any: ...


class LlmProviderAdapter(Protocol):
    """LLM Gateway 뒤의 provider 별 adapter"""

    async def complete(self, request: LlmRequest) -> str: ...


@dataclass(frozen=True, slots=True)
class LlmRequest:
    prompt: str
    model: str
    temperature: float = DEFAULT_TEMPERATURE
    max_tokens: int | None = None
    response_format: dict[str, Any] | None = None
    extra: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LlmToolCall:
    id: str
    name: str
    arguments: Any = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LlmToolDefinition:
    name: str
    description: str
    input_schema: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LlmMessage:
    role: str
    content: str = ""
    tool_call_id: str | None = None
    tool_name: str | None = None
    tool_calls: tuple[LlmToolCall, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class LlmTurnRequest:
    system_prompt: str
    messages: tuple[LlmMessage, ...]
    tools: tuple[LlmToolDefinition, ...]
    model: str
    temperature: float = DEFAULT_TEMPERATURE
    max_tokens: int | None = None
    tool_choice: Any = "auto"
    response_format: dict[str, Any] | None = None
    extra: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LlmTurnResponse:
    content: str
    tool_calls: tuple[LlmToolCall, ...] = field(default_factory=tuple)


@dataclass(frozen=True, slots=True)
class LlmProviderSettings:
    provider: str
    base_url: str
    api_key: str
    api_key_env: str | None
    model: str
    timeout_seconds: float
    max_retries: int
    default_max_tokens: int
    anthropic_version: str = DEFAULT_ANTHROPIC_VERSION


class LlmGateway:
    """모든 에이전트 LLM 호출의 단일 진입점"""

    def __init__(
        self,
        *,
        default_provider: str,
        settings_loader: Callable[[str], LlmProviderSettings] = lambda provider: (
            load_provider_settings(provider)
        ),
        adapters: Mapping[str, LlmProviderAdapter] | None = None,
    ) -> None:
        self.default_provider = normalize_provider(default_provider)
        self._settings_loader = settings_loader
        self._adapters: dict[str, LlmProviderAdapter] = dict(adapters or {})
        self._settings: dict[str, LlmProviderSettings] = {}

    async def complete(self, prompt: str, **options: Any) -> str:
        request_options = dict(options)
        provider = normalize_provider(str(request_options.pop("provider", self.default_provider)))
        settings = self._provider_settings(provider)
        request = LlmRequest(
            prompt=prompt,
            model=str(request_options.pop("model", settings.model)),
            temperature=float(request_options.pop("temperature", DEFAULT_TEMPERATURE)),
            max_tokens=_optional_int(request_options.pop("max_tokens", None)),
            response_format=request_options.pop("response_format", None),
            extra=request_options,
        )
        adapter = self._provider_adapter(provider)
        return await self._call_with_retry(
            lambda: adapter.complete(request),
            max_retries=settings.max_retries,
        )

    async def complete_turn(self, **options: Any) -> LlmTurnResponse:
        request_options = dict(options)
        provider = normalize_provider(str(request_options.pop("provider", self.default_provider)))
        settings = self._provider_settings(provider)
        request = LlmTurnRequest(
            system_prompt=str(request_options.pop("system_prompt", "")),
            messages=tuple(request_options.pop("messages", ())),
            tools=tuple(request_options.pop("tools", ())),
            model=str(request_options.pop("model", settings.model)),
            temperature=float(request_options.pop("temperature", DEFAULT_TEMPERATURE)),
            max_tokens=_optional_int(request_options.pop("max_tokens", None)),
            tool_choice=request_options.pop("tool_choice", "auto"),
            response_format=request_options.pop("response_format", None),
            extra=request_options,
        )
        adapter = self._provider_adapter(provider)
        if not _adapter_supports_tool_calls(adapter):
            content = await self._call_with_retry(
                lambda: adapter.complete(_turn_request_to_text_request(request)),
                max_retries=settings.max_retries,
            )
            return LlmTurnResponse(content=str(content))
        complete_turn = getattr(adapter, "complete_turn", None)
        if not callable(complete_turn):
            content = await self._call_with_retry(
                lambda: adapter.complete(_turn_request_to_text_request(request)),
                max_retries=settings.max_retries,
            )
            return LlmTurnResponse(content=str(content))
        return await self._call_with_retry(
            lambda: complete_turn(request),
            max_retries=settings.max_retries,
        )

    async def complete_json(self, prompt: str, schema: dict[str, Any], **options: Any) -> Any:
        json_prompt = (
            f"{prompt}\n\n"
            "Return only JSON that matches this JSON Schema:\n"
            f"{json.dumps(schema, ensure_ascii=False, sort_keys=True)}"
        )
        # LLM이 코드펜스로 감싸거나 잘린 JSON을 내는 경우가 있어 파싱 실패는 1회 재요청
        last_error: json.JSONDecodeError | None = None
        for _ in range(JSON_PARSE_ATTEMPTS):
            raw = await self.complete(
                json_prompt,
                response_format={"type": "json_object"},
                **options,
            )
            try:
                return json.loads(_strip_json_fences(raw))
            except json.JSONDecodeError as exc:
                last_error = exc
        raise ValueError("LLM did not return valid JSON") from last_error

    def supports_tool_calls(self) -> bool:
        try:
            adapter = self._provider_adapter(self.default_provider)
        except ValueError:
            return False
        return _adapter_supports_tool_calls(adapter)

    def metadata(self, *, provider: str | None = None) -> dict[str, Any]:
        selected_provider = normalize_provider(provider or self.default_provider)
        settings = self._provider_settings(selected_provider)
        return {
            "provider": settings.provider,
            "model": settings.model,
            "base_url": settings.base_url,
            "timeout_seconds": settings.timeout_seconds,
            "max_retries": settings.max_retries,
        }

    def _provider_settings(self, provider: str) -> LlmProviderSettings:
        if provider not in self._settings:
            self._settings[provider] = self._settings_loader(provider)
        return self._settings[provider]

    def _provider_adapter(self, provider: str) -> LlmProviderAdapter:
        if provider not in self._adapters:
            settings = self._provider_settings(provider)
            self._adapters[provider] = build_provider_adapter(settings)
        return self._adapters[provider]

    async def _call_with_retry(
        self,
        action: Callable[[], Awaitable[Any]],
        *,
        max_retries: int,
    ) -> Any:
        attempt = 0
        while True:
            server_delay: float | None = None
            try:
                return await action()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code not in RETRYABLE_HTTP_STATUS or attempt >= max_retries:
                    raise
                server_delay = _retry_after_seconds(exc.response)
            except (httpx.TimeoutException, httpx.TransportError):
                if attempt >= max_retries:
                    raise
            attempt += 1
            # 429/503의 Retry-After가 있으면 서버 지시를 따르고, 없으면 지수 백오프.
            backoff = min(2 ** (attempt - 1), 8)
            await asyncio.sleep(server_delay if server_delay is not None else backoff)


@dataclass(slots=True)
class OpenAiChatCompletionsAdapter:
    settings: LlmProviderSettings
    transport: httpx.AsyncBaseTransport | None = None

    def supports_tool_calls(self) -> bool:
        return self.settings.provider == PROVIDER_OPENAI

    async def complete(self, request: LlmRequest) -> str:
        payload: dict[str, Any] = {
            "model": request.model,
            "messages": [{"role": "user", "content": request.prompt}],
            "temperature": request.temperature,
        }
        if request.max_tokens is not None:
            payload["max_tokens"] = request.max_tokens
        if request.response_format is not None:
            payload["response_format"] = request.response_format
        payload.update(request.extra)

        data = await self._post_json(
            f"{self.settings.base_url}/chat/completions",
            headers={
                "authorization": f"Bearer {self.settings.api_key}",
                "content-type": "application/json",
            },
            payload=payload,
        )
        return _extract_openai_text(data)

    async def complete_turn(self, request: LlmTurnRequest) -> LlmTurnResponse:
        payload: dict[str, Any] = {
            "model": request.model,
            "messages": _openai_messages(request),
            "temperature": request.temperature,
        }
        if request.max_tokens is not None:
            payload["max_tokens"] = request.max_tokens
        if request.response_format is not None:
            payload["response_format"] = request.response_format
        if request.tools:
            payload["tools"] = [_openai_tool(tool) for tool in request.tools]
            payload["tool_choice"] = request.tool_choice or "auto"
        _merge_native_tool_extra(
            payload,
            request.extra,
            protected_keys=OPENAI_NATIVE_TOOL_EXTRA_PROTECTED_KEYS,
        )

        data = await self._post_json(
            f"{self.settings.base_url}/chat/completions",
            headers={
                "authorization": f"Bearer {self.settings.api_key}",
                "content-type": "application/json",
            },
            payload=payload,
        )
        return _extract_openai_turn(data)

    async def _post_json(
        self,
        url: str,
        *,
        headers: dict[str, str],
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        async with httpx.AsyncClient(
            timeout=self.settings.timeout_seconds,
            transport=self.transport,
        ) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            return response.json()


@dataclass(slots=True)
class AnthropicMessagesAdapter:
    settings: LlmProviderSettings
    transport: httpx.AsyncBaseTransport | None = None

    def supports_tool_calls(self) -> bool:
        return True

    async def complete(self, request: LlmRequest) -> str:
        payload: dict[str, Any] = {
            "model": request.model,
            "messages": [{"role": "user", "content": request.prompt}],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens or self.settings.default_max_tokens,
        }
        payload.update(request.extra)

        async with httpx.AsyncClient(
            timeout=self.settings.timeout_seconds,
            transport=self.transport,
        ) as client:
            response = await client.post(
                f"{self.settings.base_url}/v1/messages",
                headers={
                    "x-api-key": self.settings.api_key,
                    "anthropic-version": self.settings.anthropic_version,
                    "content-type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return _extract_anthropic_text(response.json())

    async def complete_turn(self, request: LlmTurnRequest) -> LlmTurnResponse:
        payload: dict[str, Any] = {
            "model": request.model,
            "messages": _anthropic_messages(request),
            "temperature": request.temperature,
            "max_tokens": request.max_tokens or self.settings.default_max_tokens,
        }
        if request.system_prompt:
            payload["system"] = request.system_prompt
        if request.tools:
            payload["tools"] = [_anthropic_tool(tool) for tool in request.tools]
        _merge_native_tool_extra(
            payload,
            request.extra,
            protected_keys=ANTHROPIC_NATIVE_TOOL_EXTRA_PROTECTED_KEYS,
        )

        async with httpx.AsyncClient(
            timeout=self.settings.timeout_seconds,
            transport=self.transport,
        ) as client:
            response = await client.post(
                f"{self.settings.base_url}/v1/messages",
                headers={
                    "x-api-key": self.settings.api_key,
                    "anthropic-version": self.settings.anthropic_version,
                    "content-type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return _extract_anthropic_turn(response.json())


@dataclass(slots=True)
class GeminiGenerateContentAdapter:
    settings: LlmProviderSettings
    transport: httpx.AsyncBaseTransport | None = None

    def supports_tool_calls(self) -> bool:
        return True

    async def complete(self, request: LlmRequest) -> str:
        generation_config: dict[str, Any] = {"temperature": request.temperature}
        if request.max_tokens is not None:
            generation_config["maxOutputTokens"] = request.max_tokens
        if (request.response_format or {}).get("type") == "json_object":
            generation_config["responseMimeType"] = "application/json"
        payload: dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": request.prompt}]}],
            "generationConfig": generation_config,
        }
        payload.update(request.extra)

        async with httpx.AsyncClient(
            timeout=self.settings.timeout_seconds,
            transport=self.transport,
        ) as client:
            response = await client.post(
                f"{self.settings.base_url}/models/{request.model}:generateContent",
                headers={
                    "x-goog-api-key": self.settings.api_key,
                    "content-type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return _extract_gemini_text(response.json())

    async def complete_turn(self, request: LlmTurnRequest) -> LlmTurnResponse:
        generation_config: dict[str, Any] = {"temperature": request.temperature}
        if request.max_tokens is not None:
            generation_config["maxOutputTokens"] = request.max_tokens
        if (request.response_format or {}).get("type") == "json_object":
            generation_config["responseMimeType"] = "application/json"
        payload: dict[str, Any] = {
            "contents": _gemini_contents(request),
            "generationConfig": generation_config,
        }
        if request.system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": request.system_prompt}]}
        if request.tools:
            payload["tools"] = [
                {
                    "functionDeclarations": [
                        _gemini_function_declaration(tool) for tool in request.tools
                    ]
                }
            ]
        _merge_native_tool_extra(
            payload,
            request.extra,
            protected_keys=GEMINI_NATIVE_TOOL_EXTRA_PROTECTED_KEYS,
        )

        async with httpx.AsyncClient(
            timeout=self.settings.timeout_seconds,
            transport=self.transport,
        ) as client:
            response = await client.post(
                f"{self.settings.base_url}/models/{request.model}:generateContent",
                headers={
                    "x-goog-api-key": self.settings.api_key,
                    "content-type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            return _extract_gemini_turn(response.json())


@dataclass(slots=True)
class UnconfiguredLlmAdapter:
    settings: LlmProviderSettings

    def supports_tool_calls(self) -> bool:
        return False

    async def complete(self, request: LlmRequest) -> str:
        raise ValueError(f"{LLM_PROVIDER_ENV} is required")

    async def complete_turn(self, request: LlmTurnRequest) -> LlmTurnResponse:
        raise ValueError(f"{LLM_PROVIDER_ENV} is required")


def build_llm_client() -> LlmClient:
    # provider 이름 오설정은 여기(부팅)에서 즉시 실패, 미설정/API 키 부재는 요청 시점에
    # ValueError 로 실패해 워커의 실패 이벤트(ai.message.failed 등) 경로로 수렴함.
    return LlmGateway(default_provider=env(LLM_PROVIDER_ENV, DEFAULT_LLM_PROVIDER))


def build_provider_adapter(settings: LlmProviderSettings) -> LlmProviderAdapter:
    if settings.provider == PROVIDER_UNCONFIGURED:
        return UnconfiguredLlmAdapter(settings)
    if settings.provider in {PROVIDER_OPENAI, PROVIDER_OPENAI_COMPATIBLE}:
        return OpenAiChatCompletionsAdapter(settings)
    if settings.provider == PROVIDER_ANTHROPIC:
        return AnthropicMessagesAdapter(settings)
    if settings.provider == PROVIDER_GEMINI:
        return GeminiGenerateContentAdapter(settings)
    raise ValueError(f"unsupported LLM provider: {settings.provider}")


def load_provider_settings(provider: str) -> LlmProviderSettings:
    normalized = normalize_provider(provider)
    timeout_seconds = float(env(LLM_TIMEOUT_SECONDS_ENV, DEFAULT_LLM_TIMEOUT_SECONDS))
    max_retries = int(env(LLM_MAX_RETRIES_ENV, DEFAULT_LLM_MAX_RETRIES))
    default_max_tokens = int(env(LLM_MAX_TOKENS_ENV, DEFAULT_LLM_MAX_TOKENS))

    if normalized == PROVIDER_UNCONFIGURED:
        return LlmProviderSettings(
            provider=normalized,
            base_url="",
            api_key="",
            api_key_env=None,
            model="",
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            default_max_tokens=default_max_tokens,
        )
    if normalized == PROVIDER_OPENAI:
        return _http_settings(
            provider=normalized,
            base_url=_env_first((OPENAI_BASE_URL_ENV, LLM_BASE_URL_ENV), DEFAULT_OPENAI_BASE_URL),
            api_key_names=(OPENAI_API_KEY_ENV, LLM_API_KEY_ENV),
            model=_env_first((OPENAI_MODEL_ENV, LLM_MODEL_ENV), DEFAULT_OPENAI_MODEL),
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            default_max_tokens=default_max_tokens,
        )
    if normalized == PROVIDER_OPENAI_COMPATIBLE:
        return _http_settings(
            provider=normalized,
            base_url=_env_first(
                (OPENAI_COMPATIBLE_BASE_URL_ENV, LLM_BASE_URL_ENV, OPENAI_BASE_URL_ENV),
                DEFAULT_OPENAI_BASE_URL,
            ),
            api_key_names=(
                OPENAI_COMPATIBLE_API_KEY_ENV,
                LLM_API_KEY_ENV,
                OPENAI_API_KEY_ENV,
            ),
            model=_env_first(
                (OPENAI_COMPATIBLE_MODEL_ENV, LLM_MODEL_ENV, OPENAI_MODEL_ENV),
                DEFAULT_OPENAI_MODEL,
            ),
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            default_max_tokens=default_max_tokens,
        )
    if normalized == PROVIDER_ANTHROPIC:
        return _http_settings(
            provider=normalized,
            base_url=env(ANTHROPIC_BASE_URL_ENV, DEFAULT_ANTHROPIC_BASE_URL),
            api_key_names=(ANTHROPIC_API_KEY_ENV,),
            model=_env_first((ANTHROPIC_MODEL_ENV, LLM_MODEL_ENV), DEFAULT_ANTHROPIC_MODEL),
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            default_max_tokens=default_max_tokens,
            anthropic_version=env(ANTHROPIC_VERSION_ENV, DEFAULT_ANTHROPIC_VERSION),
        )
    if normalized == PROVIDER_GEMINI:
        return _http_settings(
            provider=normalized,
            base_url=env(GEMINI_BASE_URL_ENV, DEFAULT_GEMINI_BASE_URL),
            api_key_names=(GEMINI_API_KEY_ENV, GOOGLE_API_KEY_ENV),
            model=_env_first((GEMINI_MODEL_ENV, LLM_MODEL_ENV), DEFAULT_GEMINI_MODEL),
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
            default_max_tokens=default_max_tokens,
        )
    raise ValueError(f"unsupported LLM provider: {provider}")


def normalize_provider(provider: str) -> str:
    key = provider.strip().lower().replace(" ", "-")
    if key not in _PROVIDER_ALIASES:
        raise ValueError(f"unsupported LLM provider: {provider}")
    return _PROVIDER_ALIASES[key]


def describe_llm_client(client: LlmClient) -> dict[str, Any]:
    metadata = getattr(client, "metadata", None)
    if callable(metadata):
        return metadata()
    return {"provider": client.__class__.__name__, "model": "unknown"}


def _http_settings(
    *,
    provider: str,
    base_url: str,
    api_key_names: tuple[str, ...],
    model: str,
    timeout_seconds: float,
    max_retries: int,
    default_max_tokens: int,
    anthropic_version: str = DEFAULT_ANTHROPIC_VERSION,
) -> LlmProviderSettings:
    api_key, api_key_env = _first_env_value(api_key_names)
    if not api_key:
        expected = " or ".join(api_key_names)
        raise ValueError(f"{expected} is required for LLM provider {provider}")
    return LlmProviderSettings(
        provider=provider,
        base_url=base_url.rstrip("/"),
        api_key=api_key,
        api_key_env=api_key_env,
        model=model,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
        default_max_tokens=default_max_tokens,
        anthropic_version=anthropic_version,
    )


def _env_first(names: tuple[str, ...], default: str) -> str:
    for name in names:
        value = env(name, "")
        if value:
            return value
    return default


def _first_env_value(names: tuple[str, ...]) -> tuple[str, str | None]:
    for name in names:
        value = env(name, "")
        if value:
            return value, name
    return "", None


def _retry_after_seconds(response: httpx.Response) -> float | None:
    raw = response.headers.get("retry-after", "")
    try:
        seconds = float(raw)
    except ValueError:
        return None
    if seconds <= 0:
        return None
    return min(seconds, MAX_RETRY_AFTER_SECONDS)


def _strip_json_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```") and text.endswith("```"):
        first_newline = text.find("\n")
        if first_newline != -1:
            text = text[first_newline + 1 : -3]
    return text.strip()


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def _merge_native_tool_extra(
    payload: dict[str, Any],
    extra: Mapping[str, Any],
    *,
    protected_keys: frozenset[str],
) -> None:
    if not isinstance(extra, Mapping):
        raise ValueError("LLM request extra must be a mapping")
    invalid_keys = sorted(str(key) for key in extra if not isinstance(key, str))
    if invalid_keys:
        raise ValueError("LLM request extra keys must be strings")
    blocked_keys = sorted(set(extra) & protected_keys)
    if blocked_keys:
        blocked = ", ".join(blocked_keys)
        raise ValueError(f"LLM request extra cannot override protected native tool fields: {blocked}")
    payload.update(extra)


def _adapter_supports_tool_calls(adapter: Any) -> bool:
    marker = getattr(adapter, "supports_tool_calls", None)
    if not callable(marker):
        return False
    try:
        return bool(marker())
    except Exception:
        return False


def _turn_request_to_text_request(request: LlmTurnRequest) -> LlmRequest:
    rows = []
    if request.system_prompt:
        rows.append(f"[system] {request.system_prompt}")
    for message in request.messages:
        rows.append(f"[{message.role}] {message.content}")
    return LlmRequest(
        prompt="\n".join(rows),
        model=request.model,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        response_format=request.response_format,
        extra=request.extra,
    )


def _openai_messages(request: LlmTurnRequest) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    if request.system_prompt:
        messages.append({"role": "system", "content": request.system_prompt})
    for message in request.messages:
        if message.role == "tool":
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": message.tool_call_id or "",
                    "content": message.content,
                }
            )
            continue
        payload: dict[str, Any] = {
            "role": _openai_role(message.role),
            "content": message.content,
        }
        if message.tool_calls:
            payload["tool_calls"] = [
                {
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": json.dumps(call.arguments, ensure_ascii=False),
                    },
                }
                for call in message.tool_calls
            ]
        messages.append(payload)
    return messages


def _openai_role(role: str) -> str:
    return role if role in {"assistant", "system", "user"} else "user"


def _openai_tool(tool: LlmToolDefinition) -> dict[str, Any]:
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description,
            "parameters": deepcopy(dict(tool.input_schema)),
        },
    }


def _anthropic_messages(request: LlmTurnRequest) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = []
    for message in request.messages:
        if message.role == "tool":
            messages.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": message.tool_call_id or "",
                            "content": message.content,
                        }
                    ],
                }
            )
            continue
        role = "assistant" if message.role == "assistant" else "user"
        content: list[dict[str, Any]] = []
        if message.content:
            content.append({"type": "text", "text": message.content})
        for call in message.tool_calls:
            tool_input = call.arguments if isinstance(call.arguments, dict) else {}
            content.append(
                {
                    "type": "tool_use",
                    "id": call.id,
                    "name": call.name,
                    "input": tool_input,
                }
            )
        messages.append({"role": role, "content": content or [{"type": "text", "text": ""}]})
    return messages


def _anthropic_tool(tool: LlmToolDefinition) -> dict[str, Any]:
    return {
        "name": tool.name,
        "description": tool.description,
        "input_schema": deepcopy(dict(tool.input_schema)),
    }


def _gemini_contents(request: LlmTurnRequest) -> list[dict[str, Any]]:
    contents: list[dict[str, Any]] = []
    for message in request.messages:
        if message.role == "tool":
            contents.append(
                {
                    "role": "user",
                    "parts": [
                        {
                            "functionResponse": {
                                "name": message.tool_name or "",
                                "response": _gemini_function_response(message.content),
                            }
                        }
                    ],
                }
            )
            continue
        role = "model" if message.role == "assistant" else "user"
        parts: list[dict[str, Any]] = []
        if message.content:
            parts.append({"text": message.content})
        for call in message.tool_calls:
            args = call.arguments if isinstance(call.arguments, dict) else {}
            parts.append({"functionCall": {"name": call.name, "args": args}})
        contents.append({"role": role, "parts": parts or [{"text": ""}]})
    return contents


def _gemini_function_response(content: str) -> dict[str, Any]:
    parsed = _parse_json_arguments(content)
    if isinstance(parsed, dict):
        return parsed
    return {"content": content}


def _gemini_function_declaration(tool: LlmToolDefinition) -> dict[str, Any]:
    return {
        "name": tool.name,
        "description": tool.description,
        "parameters": _gemini_schema(dict(tool.input_schema)),
    }


def _gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    converted: dict[str, Any] = {}
    for key, value in schema.items():
        if key == "type" and isinstance(value, str):
            converted[key] = value.upper()
        elif key == "properties" and isinstance(value, dict):
            converted[key] = {
                str(name): _gemini_schema(child)
                for name, child in value.items()
                if isinstance(child, dict)
            }
        elif isinstance(value, dict):
            converted[key] = _gemini_schema(value)
        elif isinstance(value, list):
            converted[key] = [
                _gemini_schema(item) if isinstance(item, dict) else item for item in value
            ]
        else:
            converted[key] = value
    return converted


def _extract_openai_text(data: dict[str, Any]) -> str:
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LLM response did not include choices")
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            str(item.get("text") or item.get("content"))
            for item in content
            if isinstance(item, dict) and (item.get("text") or item.get("content"))
        ]
        if parts:
            return "\n".join(parts)
    raise ValueError("LLM response message content is missing")


def _extract_openai_turn(data: dict[str, Any]) -> LlmTurnResponse:
    choices = data.get("choices") or []
    if not choices:
        raise ValueError("LLM response did not include choices")
    message = choices[0].get("message") or {}
    content = _content_text(message.get("content"))
    tool_calls: list[LlmToolCall] = []
    for index, item in enumerate(message.get("tool_calls") or []):
        if not isinstance(item, dict):
            continue
        function = item.get("function") or {}
        if not isinstance(function, dict):
            continue
        name = function.get("name")
        if not isinstance(name, str) or not name:
            continue
        tool_calls.append(
            LlmToolCall(
                id=str(item.get("id") or f"call_{index}"),
                name=name,
                arguments=_parse_json_arguments(function.get("arguments")),
            )
        )
    return LlmTurnResponse(content=content, tool_calls=tuple(tool_calls))


def _extract_anthropic_text(data: dict[str, Any]) -> str:
    content = data.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            str(item.get("text"))
            for item in content
            if isinstance(item, dict) and item.get("type") == "text" and item.get("text")
        ]
        if parts:
            return "\n".join(parts)
    raise ValueError("Anthropic response text content is missing")


def _extract_anthropic_turn(data: dict[str, Any]) -> LlmTurnResponse:
    content = data.get("content")
    if isinstance(content, str):
        return LlmTurnResponse(content=content)
    if not isinstance(content, list):
        raise ValueError("Anthropic response content is missing")
    text_parts: list[str] = []
    tool_calls: list[LlmToolCall] = []
    for index, item in enumerate(content):
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type == "text" and item.get("text"):
            text_parts.append(str(item["text"]))
        elif item_type == "tool_use" and item.get("name"):
            tool_calls.append(
                LlmToolCall(
                    id=str(item.get("id") or f"toolu_{index}"),
                    name=str(item["name"]),
                    arguments=_tool_arguments_or_empty(item.get("input")),
                )
            )
    return LlmTurnResponse(content="\n".join(text_parts), tool_calls=tuple(tool_calls))


def _extract_gemini_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini response did not include candidates")
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_parts = [
        str(part.get("text")) for part in parts if isinstance(part, dict) and part.get("text")
    ]
    if text_parts:
        return "\n".join(text_parts)
    raise ValueError("Gemini response text content is missing")


def _extract_gemini_turn(data: dict[str, Any]) -> LlmTurnResponse:
    candidates = data.get("candidates") or []
    if not candidates:
        raise ValueError("Gemini response did not include candidates")
    content = candidates[0].get("content") or {}
    parts = content.get("parts") or []
    text_parts: list[str] = []
    tool_calls: list[LlmToolCall] = []
    for index, part in enumerate(parts):
        if not isinstance(part, dict):
            continue
        if part.get("text"):
            text_parts.append(str(part["text"]))
        function_call = part.get("functionCall")
        if isinstance(function_call, dict) and function_call.get("name"):
            arguments = function_call.get("args")
            tool_calls.append(
                LlmToolCall(
                    id=str(function_call.get("id") or f"function_call_{index}"),
                    name=str(function_call["name"]),
                    arguments=_tool_arguments_or_empty(arguments),
                )
            )
    return LlmTurnResponse(content="\n".join(text_parts), tool_calls=tuple(tool_calls))


def _content_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [
            str(item.get("text") or item.get("content"))
            for item in content
            if isinstance(item, dict) and (item.get("text") or item.get("content"))
        ]
        return "\n".join(parts)
    return ""


def _parse_json_arguments(raw: Any) -> Any:
    if raw is None or raw == "":
        return {}
    if isinstance(raw, dict):
        return raw
    if not isinstance(raw, str):
        return raw
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return raw


def _tool_arguments_or_empty(raw: Any) -> Any:
    if raw is None:
        return {}
    return raw
