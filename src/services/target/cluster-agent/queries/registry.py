from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Self, cast

TelemetrySource = Literal["prometheus", "loki", "tempo"]

SOURCE_EVIDENCE_KEYS: dict[TelemetrySource, str] = {
    "prometheus": "metrics",
    "loki": "logs",
    "tempo": "traces",
}


@dataclass(frozen=True)
class TelemetryQueryDefinition:
    source: TelemetrySource
    name: str
    description: str
    query: str

    @classmethod
    def from_mapping(cls, payload: dict[str, Any]) -> Self:
        source = _required_text(payload, "source")
        if source not in SOURCE_EVIDENCE_KEYS:
            supported = ", ".join(SOURCE_EVIDENCE_KEYS)
            raise ValueError(
                f"unsupported telemetry query source: {source}; supported: {supported}"
            )

        return cls(
            source=cast(TelemetrySource, source),
            name=_required_text(payload, "name"),
            description=str(payload.get("description", "")),
            query=_required_text(payload, "query"),
        )

    def to_provider_query(
        self,
    ) -> PrometheusInstantQuery | LokiLogQuery | OpenTelemetrySpanQuery:
        if self.source == "prometheus":
            return PrometheusInstantQuery(self.name, self.description, self.query)
        if self.source == "loki":
            return LokiLogQuery(self.name, self.description, self.query)
        return OpenTelemetrySpanQuery(self.name, self.description, self.query)


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


@dataclass(frozen=True)
class PrometheusInstantQuery:
    metric_name: str
    description: str
    promql: str


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
