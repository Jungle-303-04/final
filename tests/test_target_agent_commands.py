from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_PATH = ROOT_DIR / "services" / "target-cluster-agent" / "agent.py"


def load_agent_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_agent_command_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    module_names = (
        "settings",
        "queries",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "commands",
        "commands.registry",
        "control",
        "control.policy",
        "control.reconciler",
        "control.store",
        "providers",
        "providers.base",
        "providers.loki_providers",
        "providers.prometheus_providers",
        "providers.tempo_providers",
        "evidence",
        "evidence.collector",
        "evidence.scheduler",
        "evidence.store",
        "evidence.uploader",
        "workload",
        "workload.controller",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_PATH.parent))
    try:
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_agent_unwraps_queued_command_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)

    payload = agent.command_payload(
        {
            "payload": {
                "command_id": "cmd-1",
                "action": module.QUERY_RUN_ACTION,
                "payload": {
                    "query": {
                        "source": "prometheus",
                        "name": "one_off_up",
                        "query": "up",
                    }
                },
            }
        }
    )

    assert payload["query"]["source"] == "prometheus"


def test_agent_registers_query_for_scheduled_provider_collection() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry

    result = asyncio.run(
        agent.register_query_command(
            {
                "query": {
                    "source": "prometheus",
                    "name": "custom_up",
                    "description": "Custom scrape check.",
                    "query": "up",
                }
            }
        )
    )

    assert result["status"] == module.COMMAND_COMPLETED_STATUS
    assert any(query.metric_name == "custom_up" for query in metrics_provider.queries)
    selected = agent.query_definition_from_payload(
        {"query": {"source": "prometheus", "name": "custom_up"}}
    )
    assert selected.query == "up"


def test_agent_routes_command_through_registered_handler() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry
    agent.command_registry = module.AgentCommandRegistry.from_instance(
        agent,
        default_handler=agent.apply_default_command,
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.QUERY_REGISTER_ACTION,
                "payload": {
                    "query": {
                        "source": "prometheus",
                        "name": "registered_by_registry",
                        "query": "up",
                    }
                },
            }
        )
    )

    assert result["status"] == module.COMMAND_COMPLETED_STATUS
    assert any(query.metric_name == "registered_by_registry" for query in metrics_provider.queries)


def test_agent_routes_unknown_command_to_default_handler() -> None:
    module = load_agent_module()
    module.COMMAND_EXECUTION_DELAY_SECONDS = 0
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.command_registry = module.AgentCommandRegistry.from_instance(
        agent,
        default_handler=agent.apply_default_command,
    )

    result = asyncio.run(agent.execute_command({"action": "unknown.action", "payload": {}}))

    assert result["status"] == module.COMMAND_COMPLETED_STATUS
    assert result["applied"] is True


def test_agent_imports_query_directory_for_scheduler(tmp_path: Path) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry
    query_dir = tmp_path / "queries" / "prometheus"
    query_dir.mkdir(parents=True)
    (query_dir / "custom.json").write_text(
        """
        {
          "source": "prometheus",
          "queries": [
            {
              "name": "imported_up",
              "description": "Imported scrape check.",
              "query": "up"
            }
          ]
        }
        """,
        encoding="utf-8",
    )

    result = asyncio.run(agent.import_query_path_command({"path": str(tmp_path / "queries")}))

    assert result["imported_count"] == 1
    assert any(query.metric_name == "imported_up" for query in metrics_provider.queries)
