"""텔레메트리 소스 레지스트리(@telemetry.source) 검증.

소스 계약(kubernetes/loki/metadata/prometheus/tempo)이 provider 데코레이터 선언에서 자동 등록되고,
queries/collector/agent 가 registry 기반으로 레지스트리를 읽는지 확인.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

ROOT_DIR = Path(__file__).resolve().parents[1]
AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


@pytest.fixture(scope="module")
def telemetry_module():
    sys.path.insert(0, str(AGENT_DIR))
    try:
        import providers  # noqa: F401  # @telemetry.source 등록 유발
        import telemetry_registry

        yield telemetry_registry
    finally:
        sys.path.remove(str(AGENT_DIR))


def test_builtin_sources_registered_by_decorator(telemetry_module) -> None:
    telemetry = telemetry_module.telemetry

    assert telemetry.source_names() == (
        "kubernetes",
        "loki",
        "metadata",
        "prometheus",
        "tempo",
    )
    assert telemetry.evidence_keys() == {
        "kubernetes": "kubernetes",
        "loki": "logs",
        "metadata": "metadata",
        "prometheus": "metrics",
        "tempo": "traces",
    }


def test_spec_carries_query_type_and_empty_payload(telemetry_module) -> None:
    telemetry = telemetry_module.telemetry

    assert telemetry.spec("loki").empty_payload() == []
    assert telemetry.spec("prometheus").empty_payload() == {}
    assert telemetry.query_type_for("prometheus").__name__ == "PrometheusInstantQuery"
    assert telemetry.range_query_type_for("prometheus").__name__ == "PrometheusRangeQuery"
    assert telemetry.range_query_type_for("loki").__name__ == "LokiLogQuery"


def test_reverse_lookup_by_provider_key(telemetry_module) -> None:
    telemetry = telemetry_module.telemetry

    assert telemetry.source_for_provider("metrics") == "prometheus"
    assert telemetry.source_for_provider("unknown") is None


def test_unknown_source_fails_with_supported_list(telemetry_module) -> None:
    with pytest.raises(
        ValueError,
        match="supported: kubernetes, loki, metadata, prometheus, tempo",
    ):
        telemetry_module.telemetry.spec("elasticsearch")


def test_conflicting_source_registration_fails_fast(telemetry_module) -> None:
    registry = telemetry_module.TelemetryRegistry()

    @registry.source(source="x", evidence_key="xs", query_type=dict)
    class FirstProvider: ...

    with pytest.raises(ValueError, match="duplicate telemetry source: x"):

        @registry.source(source="x", evidence_key="other", query_type=dict)
        class SecondProvider: ...


def test_identical_redeclaration_is_idempotent(telemetry_module) -> None:
    """모듈 재로딩(테스트 로더 등)에서 동일 계약 재선언은 허용됨."""
    registry = telemetry_module.TelemetryRegistry()

    @registry.source(source="x", evidence_key="xs", query_type=dict)
    class FirstProvider: ...

    @registry.source(source="x", evidence_key="xs", query_type=dict)
    class ReloadedProvider: ...

    assert registry.spec("x").evidence_key == "xs"


def test_decorator_injects_source_attributes(telemetry_module) -> None:
    registry = telemetry_module.TelemetryRegistry()

    @registry.source(source="y", evidence_key="ys", query_type=dict)
    class Provider: ...

    assert Provider.source == "y"
    assert Provider.evidence_key == "ys"
    assert Provider.__source_spec__.query_type is dict


def test_query_definition_uses_registry(telemetry_module) -> None:
    """from_mapping/to_provider_query 가 if-elif 없이 레지스트리로 동작."""
    sys.path.insert(0, str(AGENT_DIR))
    try:
        module = importlib.import_module("queries.registry")

        definition = module.TelemetryQueryDefinition.from_mapping(
            {"source": "loki", "name": "err", "query": '{app="x"} |= "error"'}
        )
        assert type(definition.to_provider_query()).__name__ == "LokiLogQuery"

        loki_range_definition = module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "loki",
                "name": "recent_err",
                "query": '{app="x"} |= "error"',
                "range_seconds": 120,
            }
        )
        loki_range_query = loki_range_definition.to_provider_query()
        assert type(loki_range_query).__name__ == "LokiLogQuery"
        assert loki_range_query.range_seconds == 120

        range_definition = module.TelemetryQueryDefinition.from_mapping(
            {
                "source": "prometheus",
                "name": "restart_rate",
                "query": "rate(kube_pod_container_status_restarts_total[5m])",
                "range_seconds": 900,
                "step_seconds": 30,
            }
        )
        range_query = range_definition.to_provider_query()
        assert type(range_query).__name__ == "PrometheusRangeQuery"
        assert range_query.range_seconds == 900
        assert range_query.step_seconds == 30

        with pytest.raises(ValueError, match="unsupported telemetry query source"):
            module.TelemetryQueryDefinition.from_mapping(
                {"source": "nope", "name": "n", "query": "q"}
            )
    finally:
        sys.path.remove(str(AGENT_DIR))
