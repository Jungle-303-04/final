from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import httpx

from packages.security.log_lines import redact_log_line
from services.mcp.internal_control.config import McpSettings

MAX_ERROR_DETAIL_LENGTH = 500


@dataclass(frozen=True)
class ManagementApiError(RuntimeError):
    status_code: int
    detail: str

    def __str__(self) -> str:
        return f"management API returned {self.status_code}: {self.detail}"


class ManagementApiClient:
    def __init__(
        self,
        settings: McpSettings,
        *,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        self.settings = settings
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=settings.timeout_seconds)

    async def get_json(self, path: str, params: dict[str, Any] | None = None) -> Any:
        response = await self._client.get(
            self._url(path),
            headers=self.settings.auth_headers(),
            params=_query_params(params or {}),
        )
        content = response.content
        if len(content) > self.settings.max_response_bytes:
            raise ManagementApiError(
                response.status_code,
                f"management API response exceeded {self.settings.max_response_bytes} bytes",
            )
        if not response.is_success:
            raise ManagementApiError(response.status_code, _error_detail(response, content))
        try:
            return json.loads(content.decode(response.encoding or "utf-8"))
        except ValueError as exc:
            raise ManagementApiError(response.status_code, "response was not valid JSON") from exc

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _url(self, path: str) -> str:
        return f"{self.settings.api_base_url.rstrip('/')}/{path.lstrip('/')}"


def _query_params(params: dict[str, Any]) -> dict[str, str]:
    query: dict[str, str] = {}
    for key, value in params.items():
        if value is None:
            continue
        if isinstance(value, bool):
            query[key] = "true" if value else "false"
        else:
            query[key] = str(value)
    return query


def _error_detail(response: httpx.Response, content: bytes) -> str:
    try:
        payload = json.loads(content.decode(response.encoding or "utf-8"))
    except ValueError:
        return _safe_error_detail(response.text or response.reason_phrase)
    detail = payload.get("detail") if isinstance(payload, dict) else None
    if isinstance(detail, str) and detail:
        return _safe_error_detail(detail)
    if detail is not None:
        return _safe_error_detail(json.dumps(detail, ensure_ascii=False, sort_keys=True))
    return _safe_error_detail(response.reason_phrase)


def _safe_error_detail(detail: str) -> str:
    compact = " ".join(detail.split())
    redacted = redact_log_line(compact)
    if len(redacted) <= MAX_ERROR_DETAIL_LENGTH:
        return redacted
    return f"{redacted[:MAX_ERROR_DETAIL_LENGTH]}..."
