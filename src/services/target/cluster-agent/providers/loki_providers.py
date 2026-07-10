from __future__ import annotations

import re
import time

import httpx
from queries import LokiLogQuery
from telemetry_registry import telemetry

from config import (
    DEFAULT_LOKI_BASE_URL,
    LOKI_BASE_URL_ENV,
    LOKI_QUERY_LIMIT,
    LOKI_TIMEOUT_SECONDS,
)
from packages.contracts.event_bus.interfaces import JsonObject
from providers.base import TRACER, ConfigReader

REDACTED_VALUE = "[REDACTED]"
REDACTED_JWT = "[REDACTED_JWT]"
REDACTED_PRIVATE_KEY = "[REDACTED_PRIVATE_KEY]"
MAX_TRACE_IDS = 20
MAX_LOG_LINE_LENGTH = 4096
TRUNCATED_LOG_LINE_SUFFIX = " [TRUNCATED]"

LOG_PATTERN_NAMES = (
    "probe_failed",
    "health_endpoint_error",
    "dependency_timeout",
    "dependency_error",
    "image_pull_error",
    "oom_or_memory",
    "config_error",
)
SEVERITY_NAMES = ("critical", "error", "warn", "info", "debug", "trace", "unknown")
SEVERITY_ALIASES = {
    "fatal": "critical",
    "crit": "critical",
    "critical": "critical",
    "err": "error",
    "error": "error",
    "warning": "warn",
    "warn": "warn",
    "info": "info",
    "debug": "debug",
    "trace": "trace",
}

LOG_PATTERN_MATCHERS = {
    "probe_failed": (
        re.compile(
            r"\b(?:readiness|liveness|startup)\s+probe\s+(?:failed|failure)\b",
            re.I,
        ),
        re.compile(r"\bprobe\s+(?:failed|failure)\b", re.I),
        re.compile(r"\bunhealthy\b", re.I),
    ),
    "health_endpoint_error": (
        re.compile(
            r"\bhealth(?:check|\s+check|\s+endpoint)?\b.*"
            r"\b(?:failed|failure|error|unhealthy)\b",
            re.I,
        ),
        re.compile(
            r"\b/(?:health|ready|live|startup)\b.*"
            r"\b(?:5\d\d|failed|failure|error|timeout)\b",
            re.I,
        ),
    ),
    "dependency_timeout": (
        re.compile(
            r"\b(?:timeout|timed out|deadline exceeded|context deadline exceeded|etimedout)\b",
            re.I,
        ),
        re.compile(r"\bconnection\s+timed\s+out\b", re.I),
    ),
    "dependency_error": (
        re.compile(
            r"\b(?:connection refused|connection reset|no such host|dns lookup failed)\b",
            re.I,
        ),
        re.compile(
            r"\b(?:upstream|downstream|dependency)\b.*"
            r"\b(?:failed|failure|error|unavailable)\b",
            re.I,
        ),
    ),
    "image_pull_error": (
        re.compile(r"\b(?:ImagePullBackOff|ErrImagePull)\b", re.I),
        re.compile(
            r"\b(?:failed to pull image|pull access denied|manifest unknown|"
            r"repository does not exist)\b",
            re.I,
        ),
        re.compile(r"\bunauthorized\b.*\b(?:image|registry|pull)\b", re.I),
    ),
    "oom_or_memory": (
        re.compile(r"\b(?:OOMKilled|out of memory|heap out of memory)\b", re.I),
        re.compile(r"\bmemory\b.*\b(?:limit|exceeded|pressure)\b", re.I),
    ),
    "config_error": (
        re.compile(
            r"\b(?:configmap|secret|env|environment|volume|mount)\b.*"
            r"\b(?:not found|missing|failed|failure|error|invalid|denied)\b",
            re.I,
        ),
        re.compile(r"\b(?:key|file)\b.*\bnot found\b", re.I),
    ),
}

SENSITIVE_KEY_PATTERN = "|".join(
    re.escape(key)
    for key in (
        "password",
        "passwd",
        "pwd",
        "token",
        "access_token",
        "refresh_token",
        "id_token",
        "secret",
        "api_key",
        "apikey",
        "client_secret",
        "credential",
        "credentials",
        "private_key",
        "ssh_key",
    )
)
SENSITIVE_KEY_VALUE_RE = re.compile(
    rf"(?i)(\b(?:{SENSITIVE_KEY_PATTERN})\b[\"']?\s*[:=]\s*)"
    rf"(?:\"[^\"]*\"|'[^']*'|[^\s,;{{}}]+)"
)
AUTHORIZATION_RE = re.compile(r"(?i)\b(authorization\s*[:=]\s*(?:bearer|basic)?\s*)[^\s,;]+")
BEARER_TOKEN_RE = re.compile(r"(?i)\b(bearer\s+)[A-Za-z0-9._~+/-]+=*")
COOKIE_RE = re.compile(r"(?i)\b((?:cookie|set-cookie)\s*[:=]\s*)[^\r\n]+")
JWT_RE = re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
AWS_ACCESS_KEY_RE = re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
URL_USERINFO_RE = re.compile(r"\b([a-z][a-z0-9+.-]*://)[^/\s:@]+(?::[^/\s@]*)?@")
PRIVATE_KEY_MARKER_RE = re.compile(
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----|-----END [A-Z ]*PRIVATE KEY-----",
    re.I,
)
STRUCTURED_SEVERITY_RE = re.compile(
    r"(?i)(?:^|[\s,{])(?:level|severity|lvl|loglevel)[\"']?\s*[:=]\s*[\"']?"
    r"(critical|fatal|crit|error|err|warn|warning|info|debug|trace)\b"
)
TOKEN_SEVERITY_RE = re.compile(
    r"(?i)(?:^|[\s\[\(])"
    r"(critical|fatal|crit|error|err|warn|warning|info|debug|trace)"
    r"(?:$|[\s\]\):,\-])"
)
TRACE_ID_PATTERNS = (
    re.compile(
        r"(?i)\btraceparent[\"']?\s*[:=]\s*[\"']?"
        r"00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}\b"
    ),
    re.compile(r"(?i)\btrace[_-]?id[\"']?\s*[:=]\s*[\"']?([a-f0-9]{32})\b"),
    re.compile(r"(?i)\bx-b3-traceid[\"']?\s*[:=]\s*[\"']?([a-f0-9]{32})\b"),
)


def redact_log_line(line: str) -> str:
    """Hide sensitive values while keeping useful log context."""
    if PRIVATE_KEY_MARKER_RE.search(line):
        return REDACTED_PRIVATE_KEY

    redacted = URL_USERINFO_RE.sub(r"\1[REDACTED]@", line)
    redacted = AUTHORIZATION_RE.sub(rf"\1{REDACTED_VALUE}", redacted)
    redacted = BEARER_TOKEN_RE.sub(rf"\1{REDACTED_VALUE}", redacted)
    redacted = COOKIE_RE.sub(rf"\1{REDACTED_VALUE}", redacted)
    redacted = JWT_RE.sub(REDACTED_JWT, redacted)
    redacted = AWS_ACCESS_KEY_RE.sub(REDACTED_VALUE, redacted)
    redacted = EMAIL_RE.sub(REDACTED_VALUE, redacted)
    return SENSITIVE_KEY_VALUE_RE.sub(rf"\1{REDACTED_VALUE}", redacted)


def truncate_log_line(line: str) -> tuple[str, bool]:
    """Keep a log line small enough for evidence payloads."""
    if len(line) <= MAX_LOG_LINE_LENGTH:
        return line, False
    keep_length = max(0, MAX_LOG_LINE_LENGTH - len(TRUNCATED_LOG_LINE_SUFFIX))
    return f"{line[:keep_length]}{TRUNCATED_LOG_LINE_SUFFIX}", True


def empty_pattern_counts() -> dict[str, int]:
    """Create stable pattern count keys for one Loki result."""
    return {name: 0 for name in LOG_PATTERN_NAMES}


def empty_severity_counts() -> dict[str, int]:
    """Create stable severity count keys for one Loki result."""
    return {name: 0 for name in SEVERITY_NAMES}


def extract_severity(line: str) -> str:
    """Find a normalized severity value in one log line."""
    match = STRUCTURED_SEVERITY_RE.search(line) or TOKEN_SEVERITY_RE.search(line)
    if match is None:
        return "unknown"
    return SEVERITY_ALIASES.get(match.group(1).lower(), "unknown")


def collect_trace_ids(line: str, trace_ids: list[str], seen: set[str]) -> None:
    """Add safe trace IDs from one log line."""
    for pattern in TRACE_ID_PATTERNS:
        for match in pattern.finditer(line):
            trace_id = match.group(1).lower()
            if trace_id not in seen and len(trace_ids) < MAX_TRACE_IDS:
                seen.add(trace_id)
                trace_ids.append(trace_id)


def update_log_summaries(
    line: str,
    pattern_counts: dict[str, int],
    severity_counts: dict[str, int],
    trace_ids: list[str],
    seen_trace_ids: set[str],
) -> None:
    """Update structured log summaries from one redacted line."""
    for name, matchers in LOG_PATTERN_MATCHERS.items():
        if any(matcher.search(line) for matcher in matchers):
            pattern_counts[name] += 1

    severity_counts[extract_severity(line)] += 1
    collect_trace_ids(line, trace_ids, seen_trace_ids)


@telemetry.source(
    source="loki",
    evidence_key="logs",
    query_type=LokiLogQuery,
    empty_payload=list,  # log payload's shape is list
    range_query_type=LokiLogQuery,
)
class LokiLogsProvider:
    """Collect log data from Loki.
    It builds the logs evidence bucket.
    """

    span_name = "loki.collect"
    query_count_attribute = "loki.query_count"
    result_count_attribute = "loki.result_count"
    timeout_seconds = LOKI_TIMEOUT_SECONDS
    failure_message = "loki log collection failed"
    queries: tuple[LokiLogQuery, ...] = ()

    def __init__(self, base_url: str) -> None:
        """Store the Loki base URL without a trailing slash."""
        self.base_url = base_url.rstrip("/")

    @classmethod
    def from_config(cls, read_config: ConfigReader) -> LokiLogsProvider:
        """Create the provider from agent config values."""
        return cls(read_config(LOKI_BASE_URL_ENV, DEFAULT_LOKI_BASE_URL))

    async def query(
        self,
        client: httpx.AsyncClient,
        telemetry_query: LokiLogQuery,
    ) -> JsonObject:
        """Run one Loki query and return the raw API result."""
        with TRACER.start_as_current_span("loki.query_range") as span:
            span.attr("loki.query", telemetry_query.logql)
            params: dict[str, str | int] = {
                "query": telemetry_query.logql,
                "limit": LOKI_QUERY_LIMIT,
            }
            if telemetry_query.range_seconds is not None:
                end_ns = time.time_ns()
                params.update(
                    {
                        "start": end_ns - telemetry_query.range_seconds * 1_000_000_000,
                        "end": end_ns,
                        "direction": "backward",
                    }
                )
            response = await client.get(
                f"{self.base_url}/loki/api/v1/query_range",
                params=params,
            )
            span.http_status(response.status_code)
            response.raise_for_status()
            return response.json()

    def empty_results(self) -> list[JsonObject]:
        """Create an empty logs evidence bucket."""
        return []

    def append_result(
        self,
        results: list[JsonObject],
        telemetry_query: LokiLogQuery,
        payload: JsonObject,
    ) -> None:
        """Normalize one Loki result and add it to the bucket."""
        result = {
            "source": self.source,
            "query_name": telemetry_query.query_name,
            "query": telemetry_query.logql,
            **self.normalize_payload(payload),
        }
        if telemetry_query.range_seconds is not None:
            result["range_seconds"] = telemetry_query.range_seconds
        results.append(result)

    def build_response(self, results: list[JsonObject]) -> list[JsonObject]:
        """Return the finished logs evidence bucket."""
        return results

    def normalize_payload(self, payload: JsonObject) -> JsonObject:
        """Turn a Loki response into stream and line summaries."""
        data = payload.get("data", {})
        result_type = data.get("resultType")
        result = data.get("result", [])
        streams = []
        pattern_counts = empty_pattern_counts()
        severity_counts = empty_severity_counts()
        trace_ids: list[str] = []
        seen_trace_ids: set[str] = set()
        redacted_line_count = 0
        truncated_line_count = 0

        for item in result:
            values = []
            for raw_entry in item.get("values", []):
                raw_line = raw_entry[1] if len(raw_entry) >= 2 else None
                line = raw_line
                line_truncated = False
                original_line_length = None
                if isinstance(raw_line, str):
                    line = redact_log_line(raw_line)
                    if line != raw_line:
                        redacted_line_count += 1
                    update_log_summaries(
                        line,
                        pattern_counts,
                        severity_counts,
                        trace_ids,
                        seen_trace_ids,
                    )
                    original_line_length = len(line)
                    line, line_truncated = truncate_log_line(line)
                    if line_truncated:
                        truncated_line_count += 1

                value = {
                    "timestamp": raw_entry[0] if len(raw_entry) >= 1 else None,
                    "line": line,
                }
                if line_truncated:
                    value["line_truncated"] = True
                    value["original_line_length"] = original_line_length
                values.append(value)

            streams.append(
                {
                    "stream": item.get("stream", {}),
                    "values": values,
                }
            )

        return {
            "result_type": result_type,
            "streams": streams,
            "line_count": sum(len(stream["values"]) for stream in streams),
            "pattern_counts": pattern_counts,
            "severity_counts": severity_counts,
            "trace_ids": trace_ids,
            "redaction_summary": {
                "applied": True,
                "redacted_line_count": redacted_line_count,
                "truncated_line_count": truncated_line_count,
            },
        }
