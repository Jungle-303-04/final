from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Self

from telemetry_registry import ensure_sources_loaded, telemetry

# 소스 목록은 @telemetry.source 로 등록된 provider 가 단일 출처.
TelemetrySource = str


@dataclass(frozen=True)
class TelemetryQueryDefinition:
    source: TelemetrySource
    name: str
    description: str
    query: str
    range_seconds: int | None = None
    step_seconds: int | None = None

    @classmethod
    def from_mapping(cls, payload: dict[str, Any]) -> Self:
        ensure_sources_loaded()
        source = _required_text(payload, "source")
        telemetry.spec(source)  # 미등록 소스면 supported 목록과 함께 즉시 예외

        return cls(
            source=source,
            name=_required_text(payload, "name"),
            description=str(payload.get("description", "")),
            query=_required_text(payload, "query"),
            range_seconds=_optional_positive_int(payload, "range_seconds"),
            step_seconds=_optional_positive_int(payload, "step_seconds"),
        )

    def to_provider_query(self) -> Any:
        """등록된 소스 계약(query_type)으로 provider 쿼리 값 객체 생성."""
        ensure_sources_loaded()
        if self.range_seconds is not None:
            range_query_type = telemetry.range_query_type_for(self.source)
            if range_query_type is None:
                raise ValueError(f"telemetry source does not support range query: {self.source}")
            return range_query_type(
                self.name,
                self.description,
                self.query,
                self.range_seconds,
                self.step_seconds,
            )
        query_type = telemetry.query_type_for(self.source)
        return query_type(self.name, self.description, self.query)


class TelemetryQueryRegistry:
    def __init__(
        self,
        definitions: tuple[TelemetryQueryDefinition, ...] = (),
    ) -> None:
        self.definitions: dict[tuple[TelemetrySource, str], TelemetryQueryDefinition] = {}
        self.register_many(definitions)

    def register(self, definition: TelemetryQueryDefinition) -> TelemetryQueryDefinition:
        self.definitions[(definition.source, definition.name)] = definition
        return definition

    def register_many(
        self,
        definitions: tuple[TelemetryQueryDefinition, ...],
    ) -> tuple[TelemetryQueryDefinition, ...]:
        for definition in definitions:
            self.register(definition)
        return definitions

    def replace_source(
        self,
        source: TelemetrySource,
        definitions: tuple[TelemetryQueryDefinition, ...],
    ) -> tuple[TelemetryQueryDefinition, ...]:
        self.definitions = {
            key: definition for key, definition in self.definitions.items() if key[0] != source
        }
        return self.register_many(definitions)

    def get(self, source: TelemetrySource, name: str) -> TelemetryQueryDefinition:
        try:
            return self.definitions[(source, name)]
        except KeyError as exc:
            raise ValueError(f"unknown telemetry query: {source}/{name}") from exc

    def for_source(self, source: TelemetrySource) -> tuple[TelemetryQueryDefinition, ...]:
        return tuple(
            definition
            for (definition_source, _name), definition in self.definitions.items()
            if definition_source == source
        )


def _required_text(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"telemetry query field must be a non-empty string: {key}")
    return value.strip()


def _optional_positive_int(payload: dict[str, Any], key: str) -> int | None:
    value = payload.get(key)
    if value is None:
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"telemetry query field must be a positive integer: {key}") from exc
    if parsed <= 0:
        raise ValueError(f"telemetry query field must be a positive integer: {key}")
    return parsed


@dataclass(frozen=True)
class PrometheusInstantQuery:
    metric_name: str
    description: str
    promql: str


@dataclass(frozen=True)
class PrometheusRangeQuery:
    metric_name: str
    description: str
    promql: str
    range_seconds: int
    step_seconds: int | None = None


@dataclass(frozen=True)
class LokiLogQuery:
    query_name: str
    description: str
    logql: str


@dataclass(frozen=True)
class OpenTelemetrySpanQuery:
    query_name: str
    description: str
    traceql: str


@dataclass(frozen=True)
class KubernetesSnapshotQuery:
    query_name: str
    description: str
    namespace: str
