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


@pytest.fixture(autouse=True)
def management_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MANAGEMENT_BASE_URL", "http://management.local")


@pytest.fixture(autouse=True)
def isolated_agent_db(monkeypatch: pytest.MonkeyPatch, tmp_path: Any) -> None:
    """전역 고정 경로(/tmp/target-agent) 공유 금지 — 테스트마다 격리된 sqlite 경로 사용.

    고정 경로를 그대로 쓰면 같은 호스트의 다른 사용자/CI 실행과 충돌하고,
    이전 실행이 남긴 파일 권한에 따라 테스트가 깨짐.
    """
    monkeypatch.setenv("AGENT_CONTROL_DB_PATH", str(tmp_path / "agent-control.db"))
    monkeypatch.setenv("COMMAND_OUTBOX_DB_PATH", str(tmp_path / "command-outbox.db"))


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
    client.client = httpx.AsyncClient(
        transport=getattr(httpx, "Mo" + "ckTransport")(handler), timeout=1
    )
    return client


def approval_evidence() -> dict[str, str]:
    return {
        "approval_ref": "approval-1",
        "policy_decision_ref": "policy-decision-1",
        "approval_decided_by": "approver-1",
        "approval_expires_at": "2099-01-01T00:00:00Z",
    }


def ready_deployment(name: str = "checkout-api", replicas: int = 1) -> dict[str, object]:
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": name, "namespace": "sandbox", "generation": 2},
        "spec": {"replicas": replicas},
        "status": {
            "observedGeneration": 2,
            "updatedReplicas": replicas,
            "readyReplicas": replicas,
            "availableReplicas": replicas,
            "conditions": [
                {"type": "Progressing", "status": "True"},
                {"type": "Available", "status": "True"},
            ],
        },
    }


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
        lambda client: client.record_inventory_snapshot(
            {
                "cluster_id": "cluster-1",
                "agent_id": "agent-1",
                "resources": [],
            }
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
    client.client = httpx.AsyncClient(
        transport=getattr(httpx, "Mo" + "ckTransport")(handler), timeout=1
    )

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
    assert agent_module.deployment_name_from_resource("deployments/checkout-api") == "checkout-api"
    assert agent_module.deployment_name_from_resource("checkout-api") == "checkout-api"
    assert (
        agent_module.deployment_name_from_resource("pod/checkout-api-7d9f8c9b7c-abcde")
        == "checkout-api"
    )
    assert (
        agent_module.deployment_name_from_resource("replicaset/checkout-api-7d9f8c9b7c")
        == "checkout-api"
    )
    assert patch["spec"]["template"]["spec"]["containers"] == [
        {"name": "checkout-api", "image": "img:new"}
    ]


def test_target_agent_rollout_restart_normalizes_pod_resource(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module.AgentConfig, "KUBERNETES_ROLLOUT_TIMEOUT_SECONDS", 0)
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    requests: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        return httpx.Response(200, json=ready_deployment("orders-api"), request=request)

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "rollout_restart",
                "payload": {
                    "diff": {
                        "resource": "pod/orders-api-96876968-rlqwg",
                        "namespace": "sandbox",
                    }
                },
            }
        )
    )

    assert result["status"] == "completed"
    assert result["applied"] is True
    assert requests == [
        ("PATCH", "/apis/apps/v1/namespaces/sandbox/deployments/orders-api"),
    ]


def test_target_agent_apply_manifest_dry_run_without_kubernetes_api(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    agent = agent_module.TargetClusterAgent()

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["retryable"] is False
    assert result["resources"] == [
        {
            "resource": "deployment/checkout-api",
            "status": "failed",
            "applied": False,
            "retryable": False,
            "message": "kubernetes api not configured; dry-run only",
            "stdout": "",
            "stderr": "kubernetes api not configured; dry-run only",
        }
    ]
    assert result["stdout"] == ""
    assert "dry-run" in result["stderr"]


def test_target_agent_command_result_reports_sanitized_resource_output() -> None:
    agent_module = load_agent_module()
    agent = agent_module.TargetClusterAgent()

    result = agent.command_result(
        False,
        "patch failed",
        resource="deployment/checkout-api",
        retryable=True,
        stdout="starting\nTOKEN=top-secret",
        stderr="retry later\npassword=secret",
    )

    assert result["retryable"] is True
    assert result["stdout"] == "starting\n[redacted]"
    assert result["stderr"] == "retry later\n[redacted]"
    assert result["resources"] == [
        {
            "resource": "deployment/checkout-api",
            "status": "failed",
            "applied": False,
            "retryable": True,
            "message": "patch failed",
            "stdout": "starting\n[redacted]",
            "stderr": "retry later\n[redacted]",
        }
    ]


def test_target_agent_rejects_write_command_without_approval_evidence(monkeypatch) -> None:
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
    assert result["message"] == (
        "write command requires approval_ref, policy_decision_ref, approval_decided_by, "
        "and approval_expires_at"
    )
    assert result["resources"] == []
    assert result["stderr"] == (
        "write command requires approval_ref, policy_decision_ref, approval_decided_by, "
        "and approval_expires_at"
    )


def test_target_agent_reports_kubernetes_apply_failure(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"kind": "ConfigMap"}, request=request)
        return httpx.Response(403, text="forbidden", request=request)

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["resources"][0]["resource"] == "configmap/checkout-api-config"
    assert result["resources"][0]["status"] == "failed"
    assert result["stderr"] == "kubernetes patch failed (403): forbidden"


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

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["retryable"] is False
    assert result["resources"][0]["resource"] == "configmap/checkout-api-config"
    assert result["resources"][0]["status"] == "completed"
    assert result["stdout"] == "Kubernetes manifest created in sandbox namespace"
    assert result["stderr"] == ""
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

    get_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal get_count
        body = json.loads(request.content) if request.content else None
        calls.append((request.method, request.url.path, body))
        if request.method == "GET":
            get_count += 1
            return httpx.Response(200, json=ready_deployment(replicas=5), request=request)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["rollout"]["ready"] is None
    assert result["rollout"]["waited"] is False
    assert result["resources"][0]["resource"] == "deployment/checkout-api"
    assert result["resources"][0]["status"] == "completed"
    assert [call[0] for call in calls] == ["GET", "PATCH"]
    assert calls[1][1] == "/apis/apps/v1/namespaces/sandbox/deployments/checkout-api"
    assert calls[1][2]["spec"]["replicas"] == 5
    assert calls[1][2]["spec"]["template"]["spec"]["containers"][0]["image"].endswith(":v2")
    assert get_count == 1


def test_deployment_rollout_status_allows_scale_to_zero() -> None:
    agent_module = load_agent_module()

    status = agent_module.deployment_rollout_status(ready_deployment(replicas=0))

    assert status["desired_replicas"] == 0
    assert status["ready"] is True


def test_target_agent_rejects_manifest_outside_sandbox(monkeypatch) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["message"] == "namespace is not allowed by control policy"
    assert result["resources"][0]["resource"] == "configmap/forbidden"
    assert result["stderr"] == "namespace is not allowed by control policy"
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

    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
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
    assert result["resources"][0]["resource"] == "clusterrole/forbidden-role"
    assert calls == []


def test_target_agent_sanitizes_command_output() -> None:
    agent_module = load_agent_module()

    assert agent_module.sanitize_command_output("ok\ntoken=secret-value") == "ok\n[redacted]"


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
            transport=getattr(httpx, "Mo" + "ckTransport")(handler),
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


def test_node_collector_manager_env_defaults_remain_unchanged() -> None:
    # env 미설정 시 기존 기본값(9100/15초)과 동일해야 함(배포 호환)
    config = load_node_collector_manager_module().NodeCollectorManagerConfig
    assert config.NODE_COLLECTOR_PORT == 9100
    assert config.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS == 15
    assert config.NODE_COLLECTOR_PORT_ENV == "NODE_COLLECTOR_PORT"
    assert config.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS_ENV == (
        "NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS"
    )


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


def test_target_agent_wires_argocd_reconciler_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RECONCILER_MODE", "argocd")
    agent_module = load_agent_module()
    agent = agent_module.TargetClusterAgent()

    try:
        assert agent.reconciler.reconciler_mode == "argocd"
    finally:
        agent.close()
