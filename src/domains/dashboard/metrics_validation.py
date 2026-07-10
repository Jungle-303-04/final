"""PromQL 검증 — 저장 전에 Prometheus API로 짧은 dry-run을 수행."""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx

from packages.config.settings import env

PROMETHEUS_VALIDATE_BASE_URL_ENV = "PROMETHEUS_VALIDATE_BASE_URL"
PROMETHEUS_VALIDATE_TIMEOUT_SECONDS_ENV = "PROMETHEUS_VALIDATE_TIMEOUT_SECONDS"
DEFAULT_PROMETHEUS_VALIDATE_TIMEOUT_SECONDS = "5"
PROMQL_INVALID_DETAIL = "PromQL 쿼리가 유효하지 않습니다."


@dataclass(frozen=True)
class MetricsValidationResult:
    valid: bool
    code: str | None = None
    detail: str = ""
    result_type: str | None = None


async def validate_promql_query(
    query: str,
    *,
    base_url: str | None = None,
    range_seconds: int | None = 300,
    step_seconds: int | None = 30,
    transport: httpx.AsyncBaseTransport | None = None,
) -> MetricsValidationResult:
    # base_url은 호출 호환성만 유지한다. outbound 목적지는 서버 설정만 권위값으로 쓴다.
    endpoint = env(PROMETHEUS_VALIDATE_BASE_URL_ENV, "").strip().rstrip("/")
    if not endpoint:
        return MetricsValidationResult(
            valid=False,
            code="prometheus_base_url_required",
            detail="Prometheus 검증 URL이 설정되지 않았습니다.",
        )
    end = time.time()
    window = range_seconds or 300
    start = end - window
    step = step_seconds or max(1, window // 30)
    timeout = float(
        env(PROMETHEUS_VALIDATE_TIMEOUT_SECONDS_ENV, DEFAULT_PROMETHEUS_VALIDATE_TIMEOUT_SECONDS)
    )
    try:
        async with httpx.AsyncClient(timeout=timeout, transport=transport) as client:
            response = await client.get(
                f"{endpoint}/api/v1/query_range",
                params={
                    "query": query,
                    "start": f"{start:.3f}",
                    "end": f"{end:.3f}",
                    "step": str(step),
                },
            )
    except httpx.TimeoutException:
        return MetricsValidationResult(
            valid=False,
            code="prometheus_timeout",
            detail="Prometheus 검증 요청 시간이 초과되었습니다.",
        )
    except httpx.HTTPError:
        return MetricsValidationResult(
            valid=False,
            code="prometheus_unreachable",
            detail="Prometheus 검증 엔드포인트에 연결할 수 없습니다.",
        )
    try:
        payload = response.json()
    except ValueError:
        return MetricsValidationResult(
            valid=False,
            code="prometheus_invalid_response",
            detail="Prometheus 응답이 JSON이 아닙니다.",
        )
    if not isinstance(payload, dict):
        return MetricsValidationResult(
            valid=False,
            code="prometheus_invalid_response",
            detail="Prometheus 응답 형식이 올바르지 않습니다.",
        )
    if response.status_code >= 400 or payload.get("status") != "success":
        return MetricsValidationResult(
            valid=False,
            code="promql_invalid",
            detail=PROMQL_INVALID_DETAIL,
        )
    data = payload.get("data")
    result_type = str(data.get("resultType") or "") if isinstance(data, dict) else None
    return MetricsValidationResult(
        valid=True, detail="PromQL 검증에 성공했습니다.", result_type=result_type
    )
