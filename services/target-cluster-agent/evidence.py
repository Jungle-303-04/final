from __future__ import annotations

from collections.abc import Iterable
from typing import cast

import httpx
from providers import (
    LokiLogsProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from providers.base import TRACER, ProviderResult
from telemetry_tracing import mark_span_error

from packages.contracts.event_bus.interfaces import JsonObject

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
        telemetry_providers: Iterable[TelemetryProvider],
    ) -> None:
        self.telemetry_providers = {
            telemetry_provider.evidence_key: telemetry_provider
            for telemetry_provider in telemetry_providers
        }

    # Build the telemetry evidence payload from every configured provider.
    async def collect_evidence(self) -> JsonObject:
        with TRACER.start_as_current_span("evidence.collect") as span:
            evidence: JsonObject = {}
            for evidence_key, provider in self.telemetry_providers.items():
                evidence[evidence_key] = await self.collect_with_provider(provider)
            span.set_attribute("evidence.has_metrics", "metrics" in evidence)
            span.set_attribute("evidence.has_logs", "logs" in evidence)
            span.set_attribute("evidence.has_traces", "traces" in evidence)
            return evidence

    # Run the configured Prometheus provider and package normalized metric results.
    async def collect_prometheus_metrics(self) -> JsonObject:
        """Collect configured Prometheus query results."""
        return cast(
            JsonObject,
            await self.collect_with_provider(self.telemetry_providers["metrics"]),
        )

    # Run the configured Loki provider and package normalized log results.
    async def collect_loki_logs(self) -> list[JsonObject]:
        """Collect configured Loki query results."""
        return cast(
            list[JsonObject],
            await self.collect_with_provider(self.telemetry_providers["logs"]),
        )

    # Run the configured Tempo provider and package normalized trace results.
    async def collect_tempo_traces(self) -> JsonObject:
        """Collect configured Tempo trace search results."""
        return cast(
            JsonObject,
            await self.collect_with_provider(self.telemetry_providers["traces"]),
        )

    # Execute the common collect -> query -> normalize -> package flow through a provider.
    async def collect_with_provider(self, provider: TelemetryProvider) -> ProviderResult:
        with TRACER.start_as_current_span(provider.span_name) as span:
            span.set_attribute(provider.query_count_attribute, len(provider.queries))
            try:
                async with httpx.AsyncClient(timeout=provider.timeout_seconds) as client:
                    results = provider.empty_results()

                    for telemetry_query in provider.queries:
                        payload = await provider.query(client, telemetry_query)
                        provider.append_result(results, telemetry_query, payload)

                span.set_attribute(provider.result_count_attribute, len(results))
                span.set_attribute(f"{provider.source}.fallback_used", False)
                return provider.build_response(results)

            except Exception as exc:
                mark_span_error(span, exc)
                span.set_attribute(f"{provider.source}.fallback_used", True)
                print(f"{provider.failure_message}: {exc}", flush=True)
                return provider.build_response(provider.empty_results())
