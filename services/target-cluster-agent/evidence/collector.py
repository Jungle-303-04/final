from __future__ import annotations

from collections.abc import Iterable

import httpx
from providers import (
    LokiLogsProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from providers.base import ProviderResult
from span import get_tracer
from telemetry_queries import (
    DEFAULT_TELEMETRY_QUERY_DEFINITIONS,
    SOURCE_EVIDENCE_KEYS,
    TelemetryQueryDefinition,
    TelemetryQueryRegistry,
    TelemetrySource,
)

from packages.contracts.event_bus.interfaces import JsonObject

TRACER = get_tracer("target-cluster-agent.evidence")

__all__ = [
    "EvidenceCollector",
    "LokiLogsProvider",
    "PrometheusMetricsProvider",
    "TelemetryProvider",
    "TempoTracesProvider",
]


class EvidenceCollector:
    def __init__(
        self,
        providers: Iterable[TelemetryProvider],
        registry: TelemetryQueryRegistry | None = None,
    ) -> None:
        self.providers = {provider.evidence_key: provider for provider in providers}
        self.registry = registry or TelemetryQueryRegistry(DEFAULT_TELEMETRY_QUERY_DEFINITIONS)
        self.refresh_provider_queries()

    def register_query(self, definition: TelemetryQueryDefinition) -> TelemetryQueryDefinition:
        registered = self.registry.register(definition)
        self.refresh_provider_queries()
        return registered

    def import_queries(self, path: str) -> tuple[TelemetryQueryDefinition, ...]:
        definitions = self.registry.import_path(path)
        self.refresh_provider_queries()
        return definitions

    def refresh_provider_queries(self) -> None:
        for provider in self.providers.values():
            definitions = self.registry.for_source(provider.source)
            provider.queries = tuple(definition.to_provider_query() for definition in definitions)

    # Build the telemetry evidence payload from every configured provider.
    async def collect_evidence(self) -> JsonObject:
        return await self.collect()

    # Build an evidence payload for selected providers, or every registered provider.
    async def collect(self, *evidence_keys: str) -> JsonObject:
        selected_keys = self._select_provider_keys(evidence_keys)
        with TRACER.start_payload_span(
            "evidence.collect",
            namespace="evidence",
            expected_fields=selected_keys,
        ) as evidence:
            for evidence_key in selected_keys:
                evidence[evidence_key] = await self._collect_provider(evidence_key)
            return evidence

    def _select_provider_keys(self, requested_keys: tuple[str, ...]) -> tuple[str, ...]:
        selected_keys = requested_keys or tuple(self.providers)
        unknown_keys = tuple(key for key in selected_keys if key not in self.providers)
        if unknown_keys:
            unknown = ", ".join(unknown_keys)
            available = ", ".join(self.providers) or "<none>"
            raise ValueError(f"unknown evidence provider key(s): {unknown}; available: {available}")
        return selected_keys

    async def _collect_provider(self, evidence_key: str) -> ProviderResult:
        return await self._collect_with_provider(self.providers[evidence_key])

    async def run_query(self, definition: TelemetryQueryDefinition) -> ProviderResult:
        provider = self._provider_for_source(definition.source)
        return await self._collect_with_queries(provider, (definition.to_provider_query(),))

    def _provider_for_source(self, source: TelemetrySource) -> TelemetryProvider:
        return self.providers[SOURCE_EVIDENCE_KEYS[source]]

    # Execute the common collect -> query -> normalize -> package flow through a provider.
    async def _collect_with_provider(self, provider: TelemetryProvider) -> ProviderResult:
        return await self._collect_with_queries(provider, provider.queries)

    async def _collect_with_queries(
        self,
        provider: TelemetryProvider,
        queries: tuple[object, ...],
    ) -> ProviderResult:
        with TRACER.start_as_current_span(provider.span_name) as span:
            span.count(provider.query_count_attribute, queries)
            try:
                async with httpx.AsyncClient(timeout=provider.timeout_seconds) as client:
                    results = provider.empty_results()

                    for telemetry_query in queries:
                        payload = await provider.query(client, telemetry_query)
                        provider.append_result(results, telemetry_query, payload)

                span.count(provider.result_count_attribute, results)
                span.flag(f"{provider.source}.fallback_used", False)
                return provider.build_response(results)

            except Exception as exc:
                span.error(exc)
                span.flag(f"{provider.source}.fallback_used", True)
                print(f"{provider.failure_message}: {exc}", flush=True)
                return provider.build_response(provider.empty_results())
