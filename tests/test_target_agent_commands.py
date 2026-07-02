from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_PATH = ROOT_DIR / "src" / "services" / "target" / "cluster-agent" / "agent.py"


def load_agent_module():
    spec = importlib.util.spec_from_file_location(
        "test_target_agent_command_module",
        TARGET_AGENT_PATH,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load module: {TARGET_AGENT_PATH}")

    module = importlib.util.module_from_spec(spec)
    previous_agent_module = sys.modules.pop(spec.name, None)
    module_names = (
        "config",
        "queries",
        "queries.payloads",
        "queries.registry",
        "span",
        "span.base",
        "span.otel",
        "commands",
        "commands.context",
        "commands.kubernetes",
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
        sys.modules[spec.name] = module
        spec.loader.exec_module(module)
        return module
    finally:
        sys.path.remove(str(TARGET_AGENT_PATH.parent))
        sys.modules.pop(spec.name, None)
        if previous_agent_module is not None:
            sys.modules[spec.name] = previous_agent_module
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


class FakeKubernetesClient:
    def __init__(self) -> None:
        self.patches: list[dict[str, object]] = []

    async def get_namespaced_resource(self, **_kwargs: object) -> dict[str, object]:
        return {}

    async def patch_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.patches.append(kwargs)
        return {"patched": True}


def register_agent_commands(module: object, agent: object) -> None:
    agent.command_registry = module.AgentCommandRegistry.from_instance(
        agent,
        cluster_id=agent.cluster_id,
        cluster_role=agent.cluster_role,
        kubernetes=agent.kubernetes,
        default_handler=agent.apply_default_command,
    )


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
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.QUERY_REGISTER_ACTION,
                "payload": {
                    "query": {
                        "source": "prometheus",
                        "name": "custom_up",
                        "description": "Custom scrape check.",
                        "query": "up",
                    }
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert any(query.metric_name == "custom_up" for query in metrics_provider.queries)
    selected = agent.query_definition_from_payload(
        {"query": {"source": "prometheus", "name": "custom_up"}}
    )
    assert selected.query == "up"


def test_agent_routes_command_through_registered_handler() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry
    register_agent_commands(module, agent)

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

    assert result["status"] == "completed"
    assert any(query.metric_name == "registered_by_registry" for query in metrics_provider.queries)


def test_agent_routes_unknown_command_to_default_handler() -> None:
    module = load_agent_module()
    module.COMMAND_EXECUTION_DELAY_SECONDS = 0
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(agent.execute_command({"action": "unknown.action", "payload": {}}))

    assert result["status"] == "failed"
    assert result["applied"] is False


def test_agent_imports_query_directory_for_scheduler(tmp_path: Path) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    metrics_provider = module.PrometheusMetricsProvider.from_config(lambda _name, default: default)
    agent.evidence_collector = module.EvidenceCollector([metrics_provider])
    agent.query_registry = agent.evidence_collector.registry
    register_agent_commands(module, agent)
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

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.QUERY_IMPORT_ACTION,
                "payload": {"path": str(tmp_path / "queries")},
            }
        )
    )

    assert result["imported_count"] == 1
    assert any(query.metric_name == "imported_up" for query in metrics_provider.queries)


def test_kubernetes_command_uses_typed_payload_and_client() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "payload": {
                    "namespace": "target",
                    "name": "cluster-agent",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["replicas"] == 3
    assert agent.kubernetes.patches[0]["subresource"] == "scale"
    assert agent.kubernetes.patches[0]["body"] == {"spec": {"replicas": 3}}


def test_kubernetes_command_rejects_non_agent_resource() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = FakeKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "payload": {
                    "namespace": "target",
                    "name": "other-deployment",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "name-scoped" in result["message"]
    assert agent.kubernetes.patches == []
