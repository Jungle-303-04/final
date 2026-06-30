from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from conftest import ROOT, load_file


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
        lambda client: client.ship_evidence({"cluster_id": "cluster-1"}),
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
        lambda client: client.acquire_evidence_source_lease(
            "cluster-1", "default", "agent-1", "cluster-snapshot", "2026-06-30T00:00:00Z", 30
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


def test_management_client_ship_evidence_returns_success_status() -> None:
    agent_module = load_agent_module()
    client = make_client(agent_module, status_code=202)

    async def run() -> int:
        try:
            return await client.ship_evidence({"cluster_id": "cluster-1"})
        finally:
            await close_client(client)

    assert asyncio.run(run()) == 202


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

    assert result["status"] == "completed"
    assert result["applied"] is False
    assert "dry-run" in result["message"]


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


def test_target_agent_queries_prometheus_and_loki_directly(monkeypatch) -> None:
    agent_module = load_agent_module()
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request.url.path)
        if request.url.path == "/api/v1/label/__name__/values":
            return httpx.Response(
                200, json={"status": "success", "data": ["up", "http_requests_total"]}
            )
        if request.url.path == "/api/v1/query":
            return httpx.Response(
                200,
                json={
                    "status": "success",
                    "data": {
                        "result": [
                            {
                                "metric": {"__name__": request.url.params["query"]},
                                "value": [1, "1"],
                            }
                        ]
                    },
                },
            )
        if request.url.path == "/loki/api/v1/labels":
            return httpx.Response(200, json={"status": "success", "data": ["pod"]})
        if request.url.path == "/loki/api/v1/query_range":
            return httpx.Response(
                200,
                json={
                    "status": "success",
                    "data": {
                        "result": [
                            {
                                "stream": {"pod": "checkout-api"},
                                "values": [["1", "readiness failed"]],
                            }
                        ]
                    },
                },
            )
        return httpx.Response(404)

    monkeypatch.setenv("PROMETHEUS_BASE_URL", "http://prometheus.local")
    monkeypatch.setenv("LOKI_BASE_URL", "http://loki.local")
    agent = agent_module.TargetClusterAgent(telemetry_transport=httpx.MockTransport(handler))

    payload = asyncio.run(agent.build_evidence_payload())

    assert payload["metrics"]["mode"] == "direct_prometheus_api"
    assert payload["metrics"]["available_metric_count"] == 2
    assert payload["metrics"]["queried_metric_count"] == 2
    assert payload["logs"][0]["mode"] == "direct_loki_api"
    assert payload["logs"][0]["labels"] == ["pod"]
    assert any("/api/v1/label/__name__/values" in call for call in calls)
    assert calls.count("/api/v1/query") == 2
    assert "/loki/api/v1/labels" in calls
    assert "/loki/api/v1/query_range" in calls


def test_target_agent_ships_evidence_only_after_source_lease(monkeypatch) -> None:
    agent_module = load_agent_module()

    class LeaseClient:
        def __init__(self) -> None:
            self.payload: dict[str, object] | None = None
            self.leases: list[tuple[str, str, str, str, str, int]] = []

        async def acquire_evidence_source_lease(
            self,
            cluster_id: str,
            workspace_id: str,
            agent_id: str,
            source_id: str,
            window_start: str,
            lease_seconds: int,
        ) -> dict[str, object]:
            self.leases.append(
                (cluster_id, workspace_id, agent_id, source_id, window_start, lease_seconds)
            )
            return {"leased": True, "lease_id": "lease-1", "leased_until": "soon"}

        async def ship_evidence(self, evidence: dict[str, object]) -> int:
            self.payload = evidence
            return 202

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, request=request)

    monkeypatch.setenv("HOSTNAME", "agent-1")
    agent = agent_module.TargetClusterAgent(
        telemetry_transport=httpx.MockTransport(handler),
    )
    client = LeaseClient()

    assert asyncio.run(agent.ship_evidence_once(client)) is True

    assert client.leases
    assert client.payload is not None
    assert client.payload["agent_id"] == "agent-1"
    assert client.payload["source_id"] == "cluster-snapshot"
    assert client.payload["window_start"]
    assert client.payload["evidence_key"]


def test_target_agent_skips_evidence_when_source_lease_is_held(monkeypatch) -> None:
    agent_module = load_agent_module()

    class BusyLeaseClient:
        def __init__(self) -> None:
            self.shipped = False

        async def acquire_evidence_source_lease(self, *_args: object) -> dict[str, object]:
            return {"leased": False, "lease_id": "other", "leased_until": "soon"}

        async def ship_evidence(self, _evidence: dict[str, object]) -> int:
            self.shipped = True
            return 202

    monkeypatch.setenv("HOSTNAME", "agent-1")
    agent = agent_module.TargetClusterAgent()
    client = BusyLeaseClient()

    assert asyncio.run(agent.ship_evidence_once(client)) is False
    assert client.shipped is False
