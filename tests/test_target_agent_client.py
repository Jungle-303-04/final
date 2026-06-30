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
        lambda client: client.start_command("cmd-1", "cluster-1", "lease-1", "agent-1"),
        lambda client: client.complete_command(
            "cmd-1",
            "lease-1",
            "agent-1",
            {"status": "completed", "cluster_id": "cluster-1"},
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


def test_target_agent_builds_node_collector_daemonset() -> None:
    agent_module = load_agent_module()

    body = agent_module.build_node_collector_daemonset("target", "service:local")

    assert body["kind"] == "DaemonSet"
    assert body["metadata"]["name"] == "optional-node-collector"
    assert body["metadata"]["namespace"] == "target"
    assert body["spec"]["template"]["spec"]["tolerations"] == [{"operator": "Exists"}]
    assert body["spec"]["template"]["spec"]["containers"][0]["image"] == "service:local"
    assert body["spec"]["template"]["spec"]["containers"][0]["command"] == [
        "python",
        "src/services/target/node-collector/app.py",
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


def test_target_agent_creates_node_collector_when_missing(monkeypatch) -> None:
    agent_module = load_agent_module()
    calls: list[tuple[str, str, dict[str, Any] | None]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json_body(request)
        calls.append((request.method, request.url.path, payload))
        if request.method == "GET":
            return httpx.Response(404, request=request)
        return httpx.Response(201, json={"ok": True}, request=request)

    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=httpx.MockTransport(handler)
    )

    applied, message = asyncio.run(agent.ensure_node_collector())

    assert applied is True
    assert "created" in message
    assert calls[0][0] == "GET"
    assert calls[1][0] == "POST"
    assert calls[1][2]["kind"] == "DaemonSet"


def test_target_agent_patches_node_collector_when_present(monkeypatch) -> None:
    agent_module = load_agent_module()
    methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        methods.append(request.method)
        return httpx.Response(200, json={"ok": True}, request=request)

    monkeypatch.setenv("KUBERNETES_SERVICE_HOST", "kubernetes.local")
    monkeypatch.setenv("KUBERNETES_SERVICE_PORT_HTTPS", "443")
    monkeypatch.setattr(agent_module, "service_account_token", lambda: "token")
    agent = agent_module.TargetClusterAgent(
        kubernetes_transport=httpx.MockTransport(handler)
    )

    applied, message = asyncio.run(agent.ensure_node_collector())

    assert applied is True
    assert "reconciled" in message
    assert methods == ["GET", "PATCH"]


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


def json_body(request: httpx.Request) -> dict[str, Any] | None:
    if not request.content:
        return None
    import json

    return json.loads(request.content.decode())
