from __future__ import annotations

import asyncio
import importlib.util
import logging
import sys
from pathlib import Path

import pytest

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
        "commands.outbox",
        "commands.registry",
        "control",
        "control.policy",
        "control.reconciler",
        "control.store",
        "providers",
        "providers.base",
        "providers.kubernetes_providers",
        "providers.loki_providers",
        "providers.prometheus_providers",
        "providers.tempo_providers",
        "kubernetes_api",
        "evidence",
        "evidence.collector",
        "evidence.jobs",
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


class StubKubernetesClient:
    def __init__(self) -> None:
        self.patches: list[dict[str, object]] = []

    async def get_namespaced_resource(self, **_kwargs: object) -> dict[str, object]:
        return {}

    async def patch_namespaced_resource(self, **kwargs: object) -> dict[str, object]:
        self.patches.append(kwargs)
        return {"patched": True}


class StubCommandResultClient:
    def __init__(self, *, fail_once: bool = False) -> None:
        self.fail_once = fail_once
        self.completed: list[dict[str, object]] = []

    async def complete_command(
        self,
        command_id: str,
        workspace_id: str,
        lease_id: str,
        agent_id: str,
        result: dict[str, object],
    ) -> None:
        if self.fail_once:
            self.fail_once = False
            raise RuntimeError("gateway unavailable")
        self.completed.append(
            {
                "command_id": command_id,
                "workspace_id": workspace_id,
                "lease_id": lease_id,
                "agent_id": agent_id,
                "result": result,
            }
        )


def register_agent_commands(module: object, agent: object) -> None:
    agent.command_registry = module.AgentCommandRegistry.from_instance(
        agent,
        cluster_id=agent.cluster_id,
        cluster_role=agent.cluster_role,
        kubernetes=agent.kubernetes,
        default_handler=agent.apply_default_command,
    )


def approval_evidence(
    *,
    expires_at: str = "2099-01-01T00:00:00Z",
) -> dict[str, str]:
    return {
        "approval_ref": "approval-1",
        "policy_decision_ref": "policy-decision-1",
        "approval_decided_by": "approver-1",
        "approval_expires_at": expires_at,
    }


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


def test_apply_manifest_keeps_plan_diff_payload() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    applied: dict[str, object] = {}

    async def stub_apply(manifest: dict[str, object], namespace: str) -> tuple[bool, str, dict]:
        applied["manifest"] = manifest
        applied["namespace"] = namespace
        return True, "manifest applied", {}

    agent.apply_kubernetes_manifest = stub_apply
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.AgentConfig.APPLY_MANIFEST_ACTION,
                **approval_evidence(),
                "payload": {
                    "diff": {
                        "resource": "configmap/demo-target-config",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "v1",
                            "kind": "ConfigMap",
                            "metadata": {
                                "name": "demo-target-config",
                                "namespace": "sandbox",
                            },
                            "data": {"DEMO_MODE": "normal"},
                        },
                    },
                    "payload": {},
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert applied["namespace"] == "sandbox"
    assert applied["manifest"]["kind"] == "ConfigMap"


def test_command_result_outbox_retries_until_gateway_accepts(tmp_path: Path) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.agent_id = "agent-1"
    agent.command_outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    agent.command_outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1"},
    )
    client = StubCommandResultClient(fail_once=True)

    assert asyncio.run(agent.flush_command_results_once(client)) is False
    assert agent.command_outbox.pending_count() == 1
    assert asyncio.run(agent.flush_command_results_once(client)) is True

    assert agent.command_outbox.pending_count() == 0
    assert client.completed[0]["command_id"] == "cmd-1"


def test_command_result_outbox_logs_result_summary(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    caplog.set_level(logging.INFO)

    outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={
            "status": "completed",
            "cluster_id": "cluster-1",
            "applied": True,
            "retryable": False,
            "resources": [{"resource": "deployment/checkout-api"}],
        },
    )

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "agent_command_result_enqueued"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["workspace_id"] == "default"
    assert contexts[-1]["lease_id"] == "lease-1"
    assert contexts[-1]["agent_id"] == "agent-1"
    assert contexts[-1]["status"] == "completed"
    assert contexts[-1]["cluster_id"] == "cluster-1"
    assert contexts[-1]["applied"] is True
    assert contexts[-1]["retryable"] is False
    assert contexts[-1]["resource_count"] == 1


def test_command_result_flush_logs_success(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.agent_id = "agent-1"
    agent.command_outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    agent.command_outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1", "applied": True},
    )
    client = StubCommandResultClient()
    caplog.set_level(logging.INFO)

    assert asyncio.run(agent.flush_command_results_once(client)) is True

    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "command_result_flushed"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["workspace_id"] == "default"
    assert contexts[-1]["lease_id"] == "lease-1"
    assert contexts[-1]["agent_id"] == "agent-1"
    assert contexts[-1]["cluster_id"] == "cluster-1"
    assert contexts[-1]["status"] == "completed"
    assert contexts[-1]["applied"] is True


def test_command_result_outbox_abandons_poison_result(tmp_path: Path, caplog) -> None:
    module = load_agent_module()
    outbox = module.CommandResultOutbox(str(tmp_path / "command-outbox.db"))
    outbox.enqueue_result(
        command_id="cmd-1",
        workspace_id="default",
        lease_id="lease-1",
        agent_id="agent-1",
        result={"status": "completed", "cluster_id": "cluster-1"},
    )
    caplog.set_level(logging.WARNING)

    assert outbox.record_failure("cmd-1", "lease expired", max_attempts=1) is True

    assert outbox.pending_count() == 0
    assert outbox.abandoned_count() == 1
    assert outbox.next_result() is None
    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() == "agent_command_result_outbox_abandoned"
        and isinstance(getattr(record, "context", None), dict)
    ]
    assert contexts
    assert contexts[-1]["command_id"] == "cmd-1"
    assert contexts[-1]["attempt_count"] == 1
    assert contexts[-1]["max_attempts"] == 1


def test_agent_routes_unknown_command_to_default_handler() -> None:
    module = load_agent_module()
    module.COMMAND_EXECUTION_DELAY_SECONDS = 0
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(agent.execute_command({"action": "unknown.action", "payload": {}}))

    assert result["status"] == "failed"
    assert result["applied"] is False


def test_kubernetes_command_uses_typed_payload_and_client() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["replicas"] == 3
    assert agent.kubernetes.patches[0]["subresource"] == "scale"
    assert agent.kubernetes.patches[0]["body"] == {"spec": {"replicas": 3}}


def test_kubernetes_scale_requires_approval_evidence() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "requires approval_ref" in result["message"]
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_expired_approval_evidence() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(expires_at="2000-01-01T00:00:00Z"),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "write command approval_expires_at is expired"
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_exempts_approval_in_sandbox_environment() -> None:
    # sandbox 허용 rule — plan 메타데이터 environment=sandbox 면 승인 증적 없이 실행.
    # namespace/resource 가드는 그대로 적용된다.
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "environment": "sandbox",
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert len(agent.kubernetes.patches) == 1


def test_kubernetes_scale_does_not_auto_approve_cross_namespace_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,staging")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                "environment": "sandbox",
                "payload": {
                    "namespace": "staging",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert "requires approval_ref" in result["message"]
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_namespace_outside_control_policy() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "kube-system",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "namespace is not allowed by control policy"
    assert agent.kubernetes.patches == []


def test_kubernetes_scale_rejects_management_namespace_even_if_allowlisted(
    monkeypatch,
) -> None:
    monkeypatch.setenv("CONTROL_ALLOWED_NAMESPACES", "sandbox,management")
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "cluster-1"
    agent.cluster_role = "target"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "management",
                    "name": "api-gateway",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "namespace is not allowed by control policy"
    assert agent.kubernetes.patches == []


def test_management_agent_ignores_write_command_before_kubernetes_call() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.agent_id = "agent-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": module.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
                **approval_evidence(),
                "payload": {
                    "namespace": "sandbox",
                    "name": "checkout-api",
                    "replicas": 3,
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["message"] == "management_readonly"
    assert agent.kubernetes.patches == []


def test_management_agent_policy_rejects_self_patch_if_top_guard_is_bypassed() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.cluster_role = "management"
    agent.kubernetes = StubKubernetesClient()
    register_agent_commands(module, agent)
    registered = agent.command_registry.handlers[module.KUBERNETES_DEPLOYMENT_PATCH_ACTION]
    payload = module.KubernetesPatchPayload(
        namespace="management",
        name="cluster-agent",
        patch={"spec": {"replicas": 0}},
    )

    with pytest.raises(
        PermissionError, match="management agent cannot control management workloads"
    ):
        agent.command_registry.kubernetes_policy.ensure_allowed(registered.spec.kubernetes, payload)

    assert agent.kubernetes.patches == []


def test_management_agent_default_policy_enables_only_kubernetes_provider() -> None:
    module = load_agent_module()
    agent = object.__new__(module.TargetClusterAgent)
    agent.cluster_id = "management-1"
    agent.cluster_role = "management"
    agent.bootstrap_mode = "management"
    agent.interval = 15
    agent.evidence_failure_policy = "allow_partial"
    agent.evidence_provider_worker_counts = {}
    agent.evidence_provider_max_worker_counts = {}
    agent.evidence_collector = type(
        "Collector",
        (),
        {"providers": {"kubernetes": object(), "metrics": object(), "logs": object()}},
    )()

    policy = agent.build_default_policy()
    enabled = {
        provider_key
        for provider_key, provider_policy in policy.evidence.providers.items()
        if provider_policy.enabled
    }

    assert enabled == {"kubernetes"}
