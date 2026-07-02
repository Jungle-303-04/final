from __future__ import annotations

from typing import Any, Self

from pydantic import Field, model_validator

from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.gateway.requests import StrictModel


class TelemetryQueryCommandPayload(StrictModel):
    query: dict[str, Any]
    register_query: bool = Field(default=False, alias="register")

    def definition_payload(self) -> JsonObject:
        return self.query

    def should_register(self) -> bool:
        return self.register_query


class TelemetryQueryImportPayload(StrictModel):
    path: str | None = None
    query_path: str | None = None
    query_file: str | None = None

    @model_validator(mode="after")
    def validate_path(self) -> Self:
        self.resolved_path()
        return self

    def resolved_path(self) -> str:
        path = self.path or self.query_path or self.query_file
        if path is None or not path.strip():
            raise ValueError("telemetry query import requires a query path")
        return path.strip()
