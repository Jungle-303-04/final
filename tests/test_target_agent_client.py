from __future__ import annotations

import asyncio
import gc
import json
import sqlite3
import sys
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import httpx
import pytest
from conftest import ROOT, load_file

from packages.contracts.gateway.requests import (
    AgentPolicy,
    EvidenceProviderPolicy,
    EvidenceRuntimePolicy,
)
from packages.contracts.target import TARGET_RBAC_MANIFEST_VERSION


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


TARGET_SQLITE_DESTRUCTORS = {
    "AgentControlStore.__del__",
    "CommandResultOutbox.__del__",
}


def collect_target_sqlite_destructor_errors() -> list[Any]:
    target_errors: list[Any] = []
    previous_hook = sys.unraisablehook

    def route_unraisable(args: Any) -> None:
        error = getattr(args, "exc_value", None)
        destructor = getattr(getattr(args, "object", None), "__qualname__", "")
        is_target_error = (
            isinstance(error, sqlite3.ProgrammingError)
            and destructor in TARGET_SQLITE_DESTRUCTORS
            and "SQLite objects created in a thread" in str(error)
        )
        if is_target_error:
            target_errors.append(args)
        else:
            previous_hook(args)

    sys.unraisablehook = route_unraisable
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            executor.submit(gc.collect).result()
    finally:
        sys.unraisablehook = previous_hook
    return target_errors


@pytest.fixture
def target_agent_factory() -> Any:
    agents: list[Any] = []

    def create(agent_module: Any, **kwargs: Any) -> Any:
        agent = agent_module.TargetClusterAgent(**kwargs)
        agents.append(agent)
        return agent

    try:
        yield create
    finally:
        while agents:
            agents.pop().close()
        errors = collect_target_sqlite_destructor_errors()
        assert not errors, [str(item.exc_value) for item in errors]


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
        lambda client: client.report_prometheus_integration_status(
            {
                "revision": "revision-1",
                "operation_id": "operation-1",
                "state": "connected",
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


def test_management_client_fetches_revision_bound_prometheus_configuration() -> None:
    agent_module = load_agent_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "cluster_id": "cluster-1",
                "revision": "revision-1",
                "operation_id": "operation-1",
                "address": "https://prometheus.test",
                "headers": {"Authorization": "Bearer secret"},
            },
            request=request,
        )

    client = agent_module.HttpManagementPlaneClient("http://management.local")
    asyncio.run(client.client.aclose())
    client.client = httpx.AsyncClient(
        transport=getattr(httpx, "Mo" + "ckTransport")(handler), timeout=1
    )

    async def run() -> dict[str, object]:
        try:
            return await client.fetch_prometheus_integration("revision-1")
        finally:
            await close_client(client)

    result = asyncio.run(run())

    assert result["headers"] == {"Authorization": "Bearer secret"}
    assert requests[0].url.params["revision"] == "revision-1"


def test_target_agent_applies_revision_once_and_reports_probe_status(
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    probe_requests: list[httpx.Request] = []

    def probe_handler(request: httpx.Request) -> httpx.Response:
        probe_requests.append(request)
        return httpx.Response(
            200,
            json={"status": "success", "data": {"resultType": "vector", "result": []}},
            request=request,
        )

    class IntegrationClient:
        def __init__(self, cluster_id: str) -> None:
            self.cluster_id = cluster_id
            self.fetches = 0
            self.statuses: list[dict[str, object]] = []

        async def fetch_prometheus_integration(self, revision: str) -> dict[str, object]:
            self.fetches += 1
            assert revision == "revision-1"
            return {
                "cluster_id": self.cluster_id,
                "revision": revision,
                "operation_id": "operation-1",
                "address": "https://prometheus.test",
                "headers": {"Authorization": "Bearer secret"},
            }

        async def report_prometheus_integration_status(self, status: dict[str, object]) -> None:
            self.statuses.append(status)

    agent = target_agent_factory(
        agent_module,
        telemetry_transport=getattr(httpx, "Mo" + "ckTransport")(probe_handler),
    )
    policy = AgentPolicy(
        cluster_id=agent.cluster_id,
        evidence=EvidenceRuntimePolicy(
            providers={
                "metrics": EvidenceProviderPolicy(
                    configuration_revision="revision-1",
                    configuration_operation_id="operation-1",
                )
            }
        ),
    )
    client = IntegrationClient(agent.cluster_id)

    first = asyncio.run(agent.apply_runtime_configurations(client, policy))
    second = asyncio.run(agent.apply_runtime_configurations(client, policy))

    assert first == second
    assert client.fetches == 1
    assert client.statuses == [
        {
            "revision": "revision-1",
            "operation_id": "operation-1",
            "state": "connected",
        }
    ]
    assert probe_requests[0].headers["authorization"] == "Bearer secret"
    assert agent.evidence_collector.providers["metrics"].base_url == "https://prometheus.test"
    assert "secret" not in repr(asyncio.run(agent.policy_status_details()))


def test_target_agent_caches_failed_probe_without_replaying_secrets(
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    agent = target_agent_factory(
        agent_module,
        telemetry_transport=getattr(httpx, "Mo" + "ckTransport")(
            lambda request: httpx.Response(503, text="secret upstream detail", request=request)
        ),
    )

    class IntegrationClient:
        def __init__(self) -> None:
            self.fetches = 0
            self.statuses: list[dict[str, object]] = []

        async def fetch_prometheus_integration(self, revision: str) -> dict[str, object]:
            self.fetches += 1
            return {
                "cluster_id": agent.cluster_id,
                "revision": revision,
                "operation_id": "operation-failed",
                "address": "https://secret-host.prometheus.test",
                "headers": {"Authorization": "Bearer secret-value"},
            }

        async def report_prometheus_integration_status(self, status: dict[str, object]) -> None:
            self.statuses.append(status)

    policy = AgentPolicy(
        cluster_id=agent.cluster_id,
        evidence=EvidenceRuntimePolicy(
            providers={
                "metrics": EvidenceProviderPolicy(
                    configuration_revision="revision-failed",
                    configuration_operation_id="operation-failed",
                )
            }
        ),
    )
    client = IntegrationClient()

    for _ in range(2):
        with pytest.raises(RuntimeError, match="^prometheus_probe_http_error$"):
            asyncio.run(agent.apply_runtime_configurations(client, policy))

    assert client.fetches == 1
    assert client.statuses == [
        {
            "revision": "revision-failed",
            "operation_id": "operation-failed",
            "state": "failed",
            "error_code": "prometheus_probe_http_error",
        }
    ]
    details = repr(asyncio.run(agent.policy_status_details()))
    assert "secret-host" not in details
    assert "secret-value" not in details


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


def test_target_agent_rollout_restart_normalizes_pod_resource(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module.AgentConfig, "KUBERNETES_ROLLOUT_TIMEOUT_SECONDS", 0)
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    requests: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        return httpx.Response(200, json=ready_deployment("orders-api"), request=request)

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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


def test_target_agent_apply_manifest_dry_run_without_kubernetes_api(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    agent = target_agent_factory(agent_module)

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


def test_target_agent_command_result_reports_sanitized_resource_output(
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    agent = target_agent_factory(agent_module)

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


def test_target_agent_rejects_write_command_without_approval_evidence(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.delenv("KUBERNETES_SERVICE_HOST", raising=False)
    agent = target_agent_factory(agent_module)

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


def test_target_agent_reports_kubernetes_apply_failure(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.method == "GET":
            return httpx.Response(200, json={"kind": "ConfigMap"}, request=request)
        return httpx.Response(403, text="forbidden", request=request)

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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


def test_target_agent_creates_configmap_from_rendered_manifest(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
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

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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


def test_target_agent_patches_deployment_replicas_and_image(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
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

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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


def test_target_agent_rejects_manifest_outside_sandbox(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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


def test_target_agent_rejects_unsupported_manifest_contract(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    agent = target_agent_factory(
        agent_module, kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler)
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
    image = f"registry.example/opsia/node-collector@sha256:{'3' * 64}"
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(manager_module, "service_account_token", lambda: "token")

    async def run_with_get_status(status_code: int) -> list[str]:
        methods: list[str] = []
        desired = manager_module.NodeCollectorManager(
            enabled=True,
            image=image,
            namespace="target",
        ).daemonset()
        desired["metadata"]["generation"] = 1
        desired["status"] = {
            "observedGeneration": 1,
            "desiredNumberScheduled": 1,
            "updatedNumberScheduled": 1,
            "numberReady": 1,
            "numberUnavailable": 0,
        }

        def handler(request: httpx.Request) -> httpx.Response:
            methods.append(request.method)
            if request.url.path.endswith("/pods"):
                return httpx.Response(
                    200,
                    json={
                        "items": [
                            {
                                "spec": {
                                    "containers": [
                                        {
                                            "name": "node-collector",
                                            "image": image,
                                        }
                                    ]
                                },
                                "status": {
                                    "containerStatuses": [
                                        {
                                            "name": "node-collector",
                                            "ready": True,
                                            "image": f"sha256:{'9' * 64}",
                                            "imageID": f"containerd://{image.rsplit('@', 1)[1]}",
                                        }
                                    ]
                                },
                            }
                        ]
                    },
                    request=request,
                )
            if request.method == "GET":
                return httpx.Response(status_code, json=desired, request=request)
            return httpx.Response(200, json=desired, request=request)

        manager = manager_module.NodeCollectorManager(
            enabled=True,
            image=image,
            namespace="target",
            transport=getattr(httpx, "Mo" + "ckTransport")(handler),
        )
        applied, _message = await manager.reconcile()
        assert applied is True
        return methods

    body = manager_module.NodeCollectorManager(
        enabled=True, image=image, namespace="target"
    ).daemonset()

    assert body["kind"] == "DaemonSet"
    assert body["spec"]["template"]["spec"]["tolerations"] == [{"operator": "Exists"}]
    assert body["spec"]["template"]["spec"]["containers"][0]["command"] == [
        "python",
        "src/services/target/node-collector/app.py",
    ]
    assert asyncio.run(run_with_get_status(404)) == ["GET", "POST", "GET"]
    assert asyncio.run(run_with_get_status(200)) == ["GET", "PATCH", "GET"]


def test_node_collector_manager_reconciles_exact_env_digest_and_pod_image_id(
    monkeypatch,
) -> None:
    manager_module = load_node_collector_manager_module()
    old_image = f"registry.example/opsia/target-agent@sha256:{'1' * 64}"
    new_image = f"registry.example/opsia/target-agent@sha256:{'2' * 64}"
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setenv("NODE_COLLECTOR_IMAGE", new_image)
    monkeypatch.setattr(manager_module, "service_account_token", lambda: "token")

    requested_images: list[str] = []
    rollout_image = old_image

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal rollout_image
        if request.method == "GET" and request.url.path.endswith("/pods"):
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "spec": {
                                "containers": [
                                    {
                                        "name": "node-collector",
                                        "image": rollout_image,
                                    }
                                ]
                            },
                            "status": {
                                "containerStatuses": [
                                    {
                                        "name": "node-collector",
                                        "ready": True,
                                        "image": f"sha256:{'8' * 64}",
                                        "imageID": (
                                            "docker-pullable://registry.example/opsia/"
                                            f"target-agent@{rollout_image.rsplit('@', 1)[1]}"
                                        ),
                                    }
                                ]
                            },
                        }
                    ]
                },
                request=request,
            )
        if request.method == "PATCH":
            payload = json.loads(request.content)
            image = payload["spec"]["template"]["spec"]["containers"][0]["image"]
            requested_images.append(image)
            body = payload
            body["metadata"] = {**body["metadata"], "generation": 26}
            body["status"] = {
                "observedGeneration": 26,
                "desiredNumberScheduled": 1,
                "updatedNumberScheduled": 1,
                "numberReady": 1,
                "numberUnavailable": 0,
            }
            return httpx.Response(200, json=body, request=request)
        return httpx.Response(
            200,
            json={"metadata": {"generation": 25}},
            request=request,
        )

    manager = manager_module.NodeCollectorManager.from_env(
        getattr(httpx, "Mo" + "ckTransport")(handler)
    )

    first_applied, first_message = asyncio.run(manager.reconcile())
    assert first_applied is False
    assert first_message == manager_module.NodeCollectorManagerConfig.NODE_COLLECTOR_PENDING_MESSAGE

    rollout_image = new_image
    second_applied, second_message = asyncio.run(manager.reconcile())
    assert second_applied is True
    assert (
        second_message == manager_module.NodeCollectorManagerConfig.NODE_COLLECTOR_PATCHED_MESSAGE
    )
    assert manager.image == new_image
    assert requested_images == [new_image, new_image]


def test_node_collector_pod_accepts_kubernetes_normalized_status_image() -> None:
    manager_module = load_node_collector_manager_module()
    expected = f"registry.example/opsia/node-collector@sha256:{'9' * 64}"
    pod = {
        "spec": {
            "containers": [
                {
                    "name": "node-collector",
                    "image": expected,
                }
            ]
        },
        "status": {
            "containerStatuses": [
                {
                    "name": "node-collector",
                    "ready": True,
                    "image": f"sha256:{'8' * 64}",
                    "imageID": f"containerd://sha256:{'9' * 64}",
                }
            ]
        },
    }

    assert manager_module.pod_uses_exact_image(pod, expected) is True


@pytest.mark.parametrize(
    ("spec_name", "spec_image", "status_name", "ready", "image_id"),
    (
        (
            "node-collector",
            f"registry.example/opsia/node-collector@sha256:{'1' * 64}",
            "node-collector",
            True,
            f"containerd://sha256:{'9' * 64}",
        ),
        (
            "node-collector",
            f"registry.example/opsia/node-collector@sha256:{'9' * 64}",
            "node-collector",
            True,
            f"containerd://sha256:{'1' * 64}",
        ),
        (
            "node-collector",
            f"registry.example/opsia/node-collector@sha256:{'9' * 64}",
            "node-collector",
            False,
            f"containerd://sha256:{'9' * 64}",
        ),
        (
            "other-container",
            f"registry.example/opsia/node-collector@sha256:{'9' * 64}",
            "node-collector",
            True,
            f"containerd://sha256:{'9' * 64}",
        ),
        (
            "node-collector",
            f"registry.example/opsia/node-collector@sha256:{'9' * 64}",
            "other-container",
            True,
            f"containerd://sha256:{'9' * 64}",
        ),
    ),
    ids=(
        "spec-image-wrong",
        "image-id-wrong",
        "container-not-ready",
        "spec-container-mismatch",
        "status-container-mismatch",
    ),
)
def test_node_collector_pod_rejects_non_exact_runtime_evidence(
    spec_name: str,
    spec_image: str,
    status_name: str,
    ready: bool,
    image_id: str,
) -> None:
    manager_module = load_node_collector_manager_module()
    expected = f"registry.example/opsia/node-collector@sha256:{'9' * 64}"
    pod = {
        "spec": {
            "containers": [
                {
                    "name": spec_name,
                    "image": spec_image,
                }
            ]
        },
        "status": {
            "containerStatuses": [
                {
                    "name": status_name,
                    "ready": ready,
                    "image": f"sha256:{'8' * 64}",
                    "imageID": image_id,
                }
            ]
        },
    }

    assert manager_module.pod_uses_exact_image(pod, expected) is False


def test_node_collector_manager_env_defaults_remain_unchanged() -> None:
    # env 미설정 시 기존 기본값(9100/15초)과 동일해야 함(배포 호환)
    config = load_node_collector_manager_module().NodeCollectorManagerConfig
    assert config.NODE_COLLECTOR_PORT == 9100
    assert config.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS == 15
    assert config.NODE_COLLECTOR_PORT_ENV == "NODE_COLLECTOR_PORT"
    assert config.NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS_ENV == (
        "NODE_COLLECTOR_COLLECT_INTERVAL_SECONDS"
    )


def test_target_agent_registers_query_policy_from_management_policy(
    target_agent_factory: Callable[..., Any],
) -> None:
    agent_module = load_agent_module()
    agent = target_agent_factory(agent_module)
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


def test_target_agent_wires_argocd_reconciler_mode(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    monkeypatch.setenv("RECONCILER_MODE", "argocd")
    agent_module = load_agent_module()
    transport = getattr(httpx, "Mo" + "ckTransport")(
        lambda request: httpx.Response(404, request=request)
    )
    agent = target_agent_factory(agent_module, kubernetes_transport=transport)

    assert agent.reconciler.reconciler_mode == "argocd"
    assert agent.reconciler.argo_observer is not None
    assert agent.reconciler.argo_observer.transport is transport


@pytest.mark.parametrize(
    ("status_code", "annotations", "expected_status"),
    [
        (200, {"opsia.dev/target-rbac-version": TARGET_RBAC_MANIFEST_VERSION}, "current"),
        (200, {"opsia.dev/target-rbac-version": "older"}, "admin_apply_required"),
        (403, {}, "admin_apply_required"),
    ],
)
def test_target_agent_reports_rbac_manifest_drift_without_self_escalation(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
    status_code: int,
    annotations: dict[str, str],
    expected_status: str,
) -> None:
    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    agent_module = load_agent_module()
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    requests: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append((request.method, request.url.path))
        return httpx.Response(
            status_code,
            json={"metadata": {"annotations": annotations}},
            request=request,
        )

    agent = target_agent_factory(
        agent_module,
        kubernetes_transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    details = asyncio.run(agent.target_rbac_manifest_status())

    assert details["status"] == expected_status
    assert details["expected_version"] == TARGET_RBAC_MANIFEST_VERSION
    assert requests == [
        ("GET", "/apis/rbac.authorization.k8s.io/v1/clusterroles/cluster-agent-read")
    ]


def test_oss_profile_blocks_direct_write_commands_before_kubernetes_call(
    monkeypatch: pytest.MonkeyPatch,
    target_agent_factory: Callable[..., Any],
) -> None:
    monkeypatch.setenv("AGENT_DIRECT_COMMANDS_ENABLED", "false")
    agent_module = load_agent_module()
    agent = target_agent_factory(agent_module)

    result = asyncio.run(
        agent.execute_command(
            {
                "action": "apply_manifest",
                **approval_evidence(),
                "payload": {
                    "diff": {
                        "namespace": "sandbox",
                        "resource": "deployment/checkout-api",
                        "desired_image": "img:new",
                    }
                },
            }
        )
    )

    assert result["status"] == "failed"
    assert result["applied"] is False
    assert result["message"] == "direct commands are disabled by agent profile"


def test_target_agent_close_is_idempotent_and_releases_sqlite_connections(
    target_agent_factory: Callable[..., Any],
) -> None:
    agent = target_agent_factory(load_agent_module())

    agent.close()
    agent.close()

    assert agent.control_store.conn is None
    assert agent.command_outbox.conn is None


def test_target_sqlite_destructor_guard_forwards_unrelated_unraisable() -> None:
    forwarded: list[Any] = []
    previous_hook = sys.unraisablehook
    sys.unraisablehook = forwarded.append

    class UnrelatedCycle:
        def __init__(self) -> None:
            self.reference = self

        def __del__(self) -> None:
            raise ValueError("unrelated destructor failure")

    try:
        cycle = UnrelatedCycle()
        del cycle

        assert collect_target_sqlite_destructor_errors() == []
    finally:
        sys.unraisablehook = previous_hook

    assert len(forwarded) == 1
    assert isinstance(forwarded[0].exc_value, ValueError)
