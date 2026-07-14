"""Shared defense-in-depth sanitization for log lines crossing trust boundaries."""

from __future__ import annotations

import re

REDACTED_VALUE = "[REDACTED]"
REDACTED_JWT = "[REDACTED_JWT]"
REDACTED_PRIVATE_KEY = "[REDACTED_PRIVATE_KEY]"
MAX_LOG_LINE_LENGTH = 4096
TRUNCATED_LOG_LINE_SUFFIX = " [TRUNCATED]"

SENSITIVE_KEY_PATTERN = "|".join(
    re.escape(key)
    for key in (
        "password",
        "passwd",
        "pwd",
        "token",
        "access_token",
        "access-token",
        "refresh_token",
        "refresh-token",
        "id_token",
        "id-token",
        "secret",
        "api_key",
        "api-key",
        "apikey",
        "client_secret",
        "client-secret",
        "credential",
        "credentials",
        "private_key",
        "private-key",
        "ssh_key",
        "ssh-key",
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


def redact_log_line(line: str) -> str:
    """Hide sensitive values while keeping useful operational context."""
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
    """Keep a log line inside the browser/evidence contract bound."""
    if len(line) <= MAX_LOG_LINE_LENGTH:
        return line, False
    keep_length = max(0, MAX_LOG_LINE_LENGTH - len(TRUNCATED_LOG_LINE_SUFFIX))
    return f"{line[:keep_length]}{TRUNCATED_LOG_LINE_SUFFIX}", True
