from __future__ import annotations

import asyncio
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from conftest import ROOT, load_file

from packages.contracts.gateway.requests import (
    AgentPolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)


def load_agent_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "agent.py",
        "test_target_cluster_agent_module",
    )


def load_node_collector_manager_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "node_collector_manager.py",
        "test_node_collector_manager_module",
    )


def make_client(agent_module: Any, status_code: int) -> Any:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status_code, request=request)

    client = agent_module.HttpManagementPlaneClient("http://management.local")
    asyncio.run(client.client.aclose())
    client.client = httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=1)
    return client


async def close_client(client: Any) -> None:
    await client.close()


@pytest.mark.parametrize(
    "call",
    [
        lambda client: client.register_agent("cluster-1", "agent-1", ["evidence"]),
        lambda client: client.schedule_evidence_jobs(
            "cluster-snapshot",
            "2026-06-30T00:00:00Z",
            ["metrics"],
        ),
        lambda client: client.poll_evidence_job("metrics", "agent-1", 1),
        lambda client: client.start_command("cmd-1", "cluster-1", "default", "lease-1", "agent-1"),
        lambda client: client.heartbeat_command(
            "cmd-1", "cluster-1", "default", "lease-1", "agent-1"
        ),
        lambda client: client.complete_command(
            "cmd-1",
            "default",
            "lease-1",
            "agent-1",
            {"status": "completed", "cluster_id": "cluster-1"},
        ),
        lambda client: client.complete_evidence_job(
            "job-1",
            "agent-1",
            "lease-1",
            "completed",
            {"metrics": {}},
            "",
        ),
    ],
)
def test_management_client_write_calls_raise_on_gateway_error(
    call: Callable[[Any], Any],
) -> None:
    agent_module = load_agent_module()
    client = make_client(agent_module, status_code=500)

    async def run() -> None:
        try:
            with pytest.raises(httpx.HTTPStatusError):
                await call(client)
        finally:
            await close_client(client)

    asyncio.run(run())


def test_management_client_polls_evidence_job() -> None:
    agent_module = load_agent_module()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"job": {"job_id": "job-1", "provider_key": "metrics", "lease_id": "lease-1"}},
            request=request,
        )

    client = agent_module.HttpManagementPlaneClient("http://management.local")
    asyncio.run(client.client.aclose())
    client.client = httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=1)

    async def run() -> dict[str, object] | None:
        try:
            return await client.poll_evidence_job("metrics", "agent-1", 1)
        finally:
            await close_client(client)

    assert asyncio.run(run()) == {
        "job_id": "job-1",
        "provider_key": "metrics",
        "lease_id": "lease-1",
    }


def test_target_agent_builds_apply_manifest_patch() -> None:
    agent_module = load_agent_module()

    patch = agent_module.build_apply_manifest_patch("checkout-api", "img:new")

    assert agent_module.deployment_name_from_resource("deployment/checkout-api") == "checkout-api"
    assert patch["spec"]["template"]["spec"]["containers"] == [
        {"name": "checkout-api", "image": "img:new"}
    ]


def test_target_agent_apply_manifest_dry_run_without_kubernetes_api(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    agent = agent_module.TargetClusterAgent()

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "deployment/checkout-api",
                        "namespace": "sandbox",
                        "desired_image": "img:new",
                    }
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert "dry-run" in result["message"]


def test_target_agent_reports_kubernetes_apply_failure(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"kind": "ConfigMap"}, request=request)
        return httpx.Response(403, text="forbidden", request=request)

    agent = agent_module.TargetClusterAgent(kubernetes_transport=httpx.MockTransport(handler))

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "configmap/checkout-api-config",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "v1",
                            "kind": "ConfigMap",
                            "metadata": {"name": "checkout-api-config", "namespace": "sandbox"},
                            "data": {"LOG_LEVEL": "info"},
                        },
                    }
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert result["message"] == "kubernetes patch failed (403): forbidden"


def test_target_agent_creates_configmap_from_rendered_manifest(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, body))
        if request.method == "GET":
            return httpx.Response(404, request=request)
        return httpx.Response(201, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(kubernetes_transport=httpx.MockTransport(handler))

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "configmap/checkout-api-config",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "v1",
                            "kind": "ConfigMap",
                            "metadata": {"name": "checkout-api-config"},
                            "data": {"LOG_LEVEL": "info"},
                        },
                    }
                },
            }
        )
    )

    assert result["applied"] is True
    assert [call[0] for call in calls] == ["GET", "POST"]
    assert calls[0][1] == "/api/v1/namespaces/sandbox/configmaps/checkout-api-config"
    assert calls[1][1] == "/api/v1/namespaces/sandbox/configmaps"
    assert calls[1][2]["metadata"]["namespace"] == "sandbox"
    assert calls[1][2]["data"]["LOG_LEVEL"] == "info"


def test_target_agent_patches_deployment_replicas_and_image(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, body))
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(kubernetes_transport=httpx.MockTransport(handler))

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "deployment/checkout-api",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "apps/v1",
                            "kind": "Deployment",
                            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                            "spec": {
                                "replicas": 5,
                                "template": {
                                    "spec": {
                                        "containers": [
                                            {
                                                "name": "checkout-api",
                                                "image": "ghcr.io/project/checkout-api:v2",
                                            }
                                        ]
                                    }
                                },
                            },
                        },
                    }
                },
            }
        )
    )

    assert result["applied"] is True
    assert [call[0] for call in calls] == ["GET", "PATCH"]
    assert calls[1][1] == "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api"
    assert calls[1][2]["spec"]["replicas"] == 5
    assert calls[1][2]["spec"]["template"]["spec"]["containers"][0]["image"].endswith(":v2")


def test_target_agent_rejects_manifest_outside_sandbox(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(kubernetes_transport=httpx.MockTransport(handler))

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "configmap/forbidden",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "v1",
                            "kind": "ConfigMap",
                            "metadata": {"name": "forbidden", "namespace": "kube-system"},
                        },
                    }
                },
            }
        )
    )

    assert result["applied"] is False
    assert result["message"] == "only sandbox namespace writes are allowed"
    assert calls == []


def test_target_agent_rejects_unsupported_manifest_contract(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(kubernetes_transport=httpx.MockTransport(handler))

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                "payload": {
                    "diff": {
                        "resource": "clusterrole/forbidden-role",
                        "namespace": "sandbox",
                        "desired_manifest": {
                            "apiVersion": "rbac.authorization.k8s.io/v1",
                            "kind": "ClusterRole",
                            "metadata": {"name": "forbidden-role"},
                            "rules": [],
                        },
                    }
                },
            }
        )
    )

    assert result["applied"] is False
    assert (
        result["message"] == "unsupported manifest kind: rbac.authorization.k8s.io/v1/ClusterRole"
    )
    assert calls == []


def test_node_collector_manager_creates_or_patches_daemonset(monkeypatch) -> None:
    manager_module = load_node_collector_manager_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(manager_module, "service_account_token", lambda: "token")

    async def run_with_get_status(status_code: int) -> list[str]:
        methods: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            methods.append(request.method)
            if request.method == "GET":
                return httpx.Response(status_code, request=request)
            return httpx.Response(200, json={"ok": True}, request=request)

        manager = manager_module.NodeCollectorManager(
            enabled=True,
            image="service:local",
            namespace="target",
            transport=httpx.MockTransport(handler),
        )
        applied, _message = await manager.reconcile()
        assert applied is True
        return methods

    body = manager_module.NodeCollectorManager(
        enabled=True, image="service:local", namespace="target"
    ).daemonset()

    assert body["kind"] == "DaemonSet"
    assert body["spec"]["template"]["spec"]["tolerations"] == [{"operator": "Exists"}]
    assert body["spec"]["template"]["spec"]["containers"][0]["command"] == [
        "python",
        "src/services/target/node-collector/app.py",
    ]
    assert asyncio.run(run_with_get_status(404)) == ["GET", "POST"]
    assert asyncio.run(run_with_get_status(200)) == ["GET", "PATCH"]


def test_target_agent_registers_query_policy_from_management_policy() -> None:
    agent_module = load_agent_module()
    agent = agent_module.TargetClusterAgent()
    policy = AgentPolicy(
        cluster_id=agent.cluster_id,
        evidence=EvidenceRuntimePolicy(
            providers={
                "metrics": EvidenceProviderPolicy(
                    queries=[
                        {
                            "name": "checkout_error_rate",
                            "description": "Checkout error rate",
                            "query": 'sum(rate(http_requests_total{status=~"5.."}[5m]))',
                        }
                    ]
                )
            }
        ),
    )

    result = agent.apply_policy(policy)
    definition = agent.query_registry.get("prometheus", "checkout_error_rate")

    assert result["registered_queries"]["metrics"] == ["checkout_error_rate"]
    assert definition.query.startswith("sum(rate")
