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
