from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Self, cast

TelemetrySource = Literal["prometheus", "loki", "tempo"]

SOURCE_EVIDENCE_KEYS: dict[TelemetrySource, str] = {
    "prometheus": "metrics",
    "loki": "logs",
    "tempo": "traces",
}

DEFAULT_QUERY_PATH = Path(__file__).with_name("queries")
SUPPORTED_QUERY_FILE_SUFFIXES = {".json"}


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

    def import_path(self, path: str | Path) -> tuple[TelemetryQueryDefinition, ...]:
        return self.register_many(load_query_definitions(path))

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


def load_query_definitions(path: str | Path) -> tuple[TelemetryQueryDefinition, ...]:
    query_path = Path(path)
    if query_path.is_dir():
        definitions: list[TelemetryQueryDefinition] = []
        for query_file in sorted(query_path.rglob("*.json")):
            definitions.extend(load_query_definitions(query_file))
        return tuple(definitions)

    query_file = query_path
    if query_file.suffix not in SUPPORTED_QUERY_FILE_SUFFIXES:
        supported = ", ".join(sorted(SUPPORTED_QUERY_FILE_SUFFIXES))
        raise ValueError(f"unsupported telemetry query file: {query_file}; supported: {supported}")

    payload = json.loads(query_file.read_text(encoding="utf-8"))
    file_source = payload.get("source") if isinstance(payload, dict) else None
    rows = payload.get("queries", payload) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise ValueError("telemetry query file must contain a list or a 'queries' list")

    return tuple(query_definition_from_file_row(row, file_source, query_file) for row in rows)


def query_definition_from_file_row(
    row: object,
    file_source: object,
    query_file: Path,
) -> TelemetryQueryDefinition:
    if not isinstance(row, dict):
        raise ValueError(f"telemetry query file row must be an object: {query_file}")
    payload = dict(row)
    if "source" not in payload and isinstance(file_source, str):
        payload["source"] = file_source
    return TelemetryQueryDefinition.from_mapping(payload)


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


DEFAULT_TELEMETRY_QUERY_DEFINITIONS = load_query_definitions(DEFAULT_QUERY_PATH)
PROMETHEUS_INSTANT_QUERIES: tuple[PrometheusInstantQuery, ...] = tuple(
    cast(PrometheusInstantQuery, definition.to_provider_query())
    for definition in DEFAULT_TELEMETRY_QUERY_DEFINITIONS
    if definition.source == "prometheus"
)
LOKI_LOG_QUERIES: tuple[LokiLogQuery, ...] = tuple(
    cast(LokiLogQuery, definition.to_provider_query())
    for definition in DEFAULT_TELEMETRY_QUERY_DEFINITIONS
    if definition.source == "loki"
)
OPEN_TELEMETRY_SPAN_QUERIES: tuple[OpenTelemetrySpanQuery, ...] = tuple(
    cast(OpenTelemetrySpanQuery, definition.to_provider_query())
    for definition in DEFAULT_TELEMETRY_QUERY_DEFINITIONS
    if definition.source == "tempo"
)
