"""Typed integration contracts shared by the gateway, target agent, and browser."""

from __future__ import annotations

import json
import re
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator

from packages.contracts.modeling import StrictModel
from packages.contracts.parity import CommandReceipt

MAX_INTEGRATION_HEADERS = 32
MAX_INTEGRATION_HEADER_VALUE = 4096
MAX_INTEGRATION_SECRET_BYTES = 32 * 1024
HEADER_NAME = re.compile(r"^[!#$%&'*+.^_`|~0-9A-Za-z-]+$")
FORBIDDEN_INTEGRATION_HEADERS = frozenset(
    {
        "connection",
        "content-length",
        "host",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "te",
        "trailer",
        "transfer-encoding",
        "upgrade",
    }
)


class PrometheusIntegrationUpdateRequest(StrictModel):
    cluster_id: str = Field(min_length=1, max_length=253)
    prometheus_url: str = Field(min_length=1, max_length=2048)
    # Omitted preserves the write-only stored headers; an explicit empty object clears them.
    headers: dict[str, str] | None = Field(default=None, max_length=MAX_INTEGRATION_HEADERS)

    @field_validator("prometheus_url")
    @classmethod
    def normalize_prometheus_url(cls, value: str) -> str:
        raw = value.strip()
        parsed = urlsplit(raw)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise ValueError("prometheus_url must be an absolute http or https URL")
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("prometheus_url cannot contain credentials")
        if parsed.query or parsed.fragment:
            raise ValueError("prometheus_url cannot contain a query or fragment")
        path = parsed.path.rstrip("/")
        return urlunsplit((parsed.scheme, parsed.netloc, path, "", ""))

    @field_validator("headers")
    @classmethod
    def normalize_headers(cls, headers: dict[str, str] | None) -> dict[str, str] | None:
        if headers is None:
            return None
        normalized: dict[str, str] = {}
        normalized_names: set[str] = set()
        for raw_name, raw_value in headers.items():
            name = raw_name.strip()
            value = raw_value.strip()
            if not name or not HEADER_NAME.fullmatch(name):
                raise ValueError("integration header name is invalid")
            if name.casefold() in FORBIDDEN_INTEGRATION_HEADERS:
                raise ValueError("integration header is transport-owned")
            if not value or len(value) > MAX_INTEGRATION_HEADER_VALUE:
                raise ValueError("integration header value is invalid")
            if "\r" in value or "\n" in value:
                raise ValueError("integration header value cannot contain line breaks")
            folded_name = name.casefold()
            if folded_name in normalized_names:
                raise ValueError("integration header names must be unique")
            normalized_names.add(folded_name)
            normalized[name] = value
        return dict(sorted(normalized.items()))

    @model_validator(mode="after")
    def bound_secret_payload(self) -> PrometheusIntegrationUpdateRequest:
        encoded = json.dumps(
            {"headers": self.headers or {}},
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        ).encode()
        if len(encoded) > MAX_INTEGRATION_SECRET_BYTES:
            raise ValueError("integration headers exceed the encrypted payload limit")
        return self


PrometheusIntegrationState = Literal["unconfigured", "pending", "connected", "failed"]


class PrometheusIntegrationStatus(StrictModel):
    cluster_id: str = Field(min_length=1)
    revision: str | None = None
    operation_id: str | None = None
    address: str | None = None
    header_keys: list[str] = Field(default_factory=list)
    state: PrometheusIntegrationState
    error_code: str | None = None
    receipt: CommandReceipt | None = None


class AgentPrometheusIntegrationConfig(StrictModel):
    cluster_id: str = Field(min_length=1)
    revision: str = Field(min_length=1)
    operation_id: str = Field(min_length=1)
    address: str = Field(min_length=1)
    headers: dict[str, str] = Field(default_factory=dict, repr=False)


class AgentPrometheusIntegrationStatus(StrictModel):
    revision: str = Field(min_length=1)
    operation_id: str = Field(min_length=1)
    state: Literal["connected", "failed"]
    error_code: str | None = Field(default=None, max_length=120)

    @model_validator(mode="after")
    def require_failure_reason(self) -> AgentPrometheusIntegrationStatus:
        if self.state == "failed" and not self.error_code:
            raise ValueError("failed integration status requires error_code")
        if self.state == "connected" and self.error_code is not None:
            raise ValueError("connected integration status cannot include error_code")
        return self
