from __future__ import annotations

from collections.abc import Iterable

import httpx
from providers import (
    KubernetesSnapshotProvider,
    LokiLogsProvider,
    MetadataProvider,
    PrometheusMetricsProvider,
    TelemetryProvider,
    TempoTracesProvider,
)
from providers.base import ProviderResult
from queries import (
    TelemetryQueryDefinition,
    TelemetryQueryRegistry,
    TelemetrySource,
)
from span import get_tracer
from telemetry_registry import telemetry

from packages.config.logs import CONTEXT_KEY, get_logger
from packages.contracts.event_bus.interfaces import JsonObject

TRACER = get_tracer("target-cluster-agent.evidence")
LOGGER = get_logger(__name__)
STRICT_FAILURE_POLICY = "strict"

__all__ = [
    "EvidenceCollector",
    "KubernetesSnapshotProvider",
    "LokiLogsProvider",
    "MetadataProvider",
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
        self.registry = registry or TelemetryQueryRegistry()
        self.refresh_provider_queries()

    def register_query(self, definition: TelemetryQueryDefinition) -> TelemetryQueryDefinition:
        registered = self.registry.register(definition)
        self.refresh_provider_queries()
        return registered

    def replace_queries(
        self,
        source: TelemetrySource,
        definitions: tuple[TelemetryQueryDefinition, ...],
    ) -> tuple[TelemetryQueryDefinition, ...]:
        registered = self.registry.replace_source(source, definitions)
        self.refresh_provider_queries()
        return registered

    def replace_provider(self, provider: TelemetryProvider) -> TelemetryProvider:
        """Atomically replace one runtime provider while preserving registry-owned queries."""
        definitions = self.registry.for_source(provider.source)
        queries = tuple(definition.to_provider_query() for definition in definitions)
        provider.queries = queries
        self.providers[provider.evidence_key] = provider
        return provider

    def remove_provider(self, evidence_key: str) -> TelemetryProvider | None:
        """Remove a runtime-only provider without discarding its registered query policy."""
        return self.providers.pop(evidence_key, None)

    def refresh_provider_queries(self) -> None:
        for provider in self.providers.values():
            definitions = self.registry.for_source(provider.source)
            provider.queries = tuple(definition.to_provider_query() for definition in definitions)

    # 구성된 전체 provider 로 telemetry evidence payload 생성.
    async def collect_evidence(self) -> JsonObject:
        return await self.collect()

    # 지정 provider(미지정 시 전체)로 evidence payload 생성.
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

    async def collect_query_policy(
        self,
        evidence_key: str,
        definitions: tuple[TelemetryQueryDefinition, ...],
        *,
        failure_policy: str = "allow_partial",
    ) -> JsonObject:
        provider = self.providers[evidence_key]
        queries = tuple(definition.to_provider_query() for definition in definitions)
        return {
            evidence_key: await self._collect_with_queries(
                provider,
                queries,
                propagate_errors=failure_policy == STRICT_FAILURE_POLICY,
            )
        }

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
        return self.providers[telemetry.spec(source).evidence_key]

    # 공통 collect -> query -> normalize -> package 흐름을 provider 로 실행.
    async def _collect_with_provider(self, provider: TelemetryProvider) -> ProviderResult:
        return await self._collect_with_queries(provider, provider.queries)

    async def _collect_with_queries(
        self,
        provider: TelemetryProvider,
        queries: tuple[object, ...],
        *,
        propagate_errors: bool = False,
    ) -> ProviderResult:
        with TRACER.start_as_current_span(provider.span_name) as span:
            span.count(provider.query_count_attribute, queries)
            partial_failure = False
            try:
                async with httpx.AsyncClient(timeout=provider.timeout_seconds) as client:
                    results = provider.empty_results()

                    for telemetry_query in queries:
                        try:
                            payload = await provider.query(client, telemetry_query)
                            provider.append_result(results, telemetry_query, payload)
                        except Exception as exc:
                            if propagate_errors:
                                raise
                            partial_failure = True
                            span.error(exc)
                            LOGGER.warning(
                                provider.failure_message,
                                extra={
                                    CONTEXT_KEY: {
                                        "source": provider.source,
                                        "query_name": telemetry_query_name(telemetry_query),
                                    }
                                },
                                exc_info=exc,
                            )

                span.count(provider.result_count_attribute, results)
                span.flag(f"{provider.source}.fallback_used", partial_failure)
                return provider.build_response(results)

            except Exception as exc:
                span.error(exc)
                span.flag(f"{provider.source}.fallback_used", not propagate_errors)
                LOGGER.warning(
                    provider.failure_message,
                    extra={CONTEXT_KEY: {"source": provider.source}},
                    exc_info=exc,
                )
                if propagate_errors:
                    raise
                return provider.build_response(provider.empty_results())


def telemetry_query_name(telemetry_query: object) -> str:
    """Return the stable name of one provider query for logs."""
    for attribute in ("query_name", "metric_name"):
        value = getattr(telemetry_query, attribute, None)
        if isinstance(value, str) and value:
            return value
    return type(telemetry_query).__name__
