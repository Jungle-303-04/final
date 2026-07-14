"""kubelet stats 기반 실시간 Pod resource 측정과 metrics-server 폴백."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import httpx
import pytest
from conftest import ROOT, load_file


def load_resource_metrics_module() -> Any:
    return load_file(
        ROOT / "src" / "services" / "target" / "cluster-agent" / "live_resource_metrics.py",
        "test_live_resource_metrics_module",
    )


def pod(
    name: str = "checkout-0",
    *,
    namespace: str = "shop",
    node_name: str = "node-a",
    uid: str = "pod-uid-1",
    containers: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "metadata": {"name": name, "namespace": namespace, "uid": uid},
        "spec": {
            "nodeName": node_name,
            "containers": containers
            or [
                {
                    "name": "app",
                    "resources": {
                        "requests": {"cpu": "100m", "memory": "128Mi"},
                        "limits": {"cpu": "500m", "memory": "256Mi"},
                    },
                },
                {
                    "name": "sidecar",
                    "resources": {
                        "requests": {"cpu": "50m", "memory": "64Mi"},
                        "limits": {"cpu": "100m", "memory": "128Mi"},
                    },
                },
            ],
        },
        "status": {"phase": "Running", "containerStatuses": []},
    }


@pytest.mark.parametrize(
    ("pod_count", "expected"),
    [(0, 1.0), (199, 1.0), (200, 2.0), (799, 2.0), (800, 5.0), (1999, 5.0), (2000, 10.0)],
)
def test_collection_interval_adapts_to_pod_count(pod_count: int, expected: float) -> None:
    module = load_resource_metrics_module()
    assert module.collection_interval_for_pods(pod_count) == expected


def test_kubelet_stats_join_actual_usage_with_complete_request_and_limit_totals() -> None:
    module = load_resource_metrics_module()

    async def handle(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/nodes/node-a/proxy/stats/summary"
        return httpx.Response(
            200,
            json={
                "pods": [
                    {
                        "podRef": {
                            "name": "checkout-0",
                            "namespace": "shop",
                            "uid": "pod-uid-1",
                        },
                        "cpu": {
                            "time": "2026-07-15T03:00:00Z",
                            "usageNanoCores": 300_000_000,
                        },
                        "memory": {"workingSetBytes": 201_326_592},
                    }
                ]
            },
        )

    async def collect() -> dict[str, dict[str, Any]]:
        collector = module.PodResourceMetricsCollector(node_concurrency=2)
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await collector.collect(
                client,
                base_url="https://kubernetes.default.svc",
                headers={"authorization": "Bearer token"},
                pods=[pod()],
                actual_interval_seconds=1.25,
            )

    measured = asyncio.run(collect())["shop/checkout-0"]

    assert measured["cpu_mcores"] == 300.0
    assert measured["mem_bytes"] == 201_326_592
    assert measured["mem_mib"] == 192.0
    assert measured["cpu_request_pct"] == 200.0
    assert measured["cpu_limit_pct"] == 50.0
    assert measured["mem_request_pct"] == 100.0
    assert measured["mem_limit_pct"] == 50.0
    assert measured["observed_at"] == "2026-07-15T03:00:00Z"
    assert measured["metrics_metadata"] == {
        "source": "kubelet_stats_summary",
        "actual_interval_seconds": 1.25,
        "degraded_reason": None,
    }


def test_partial_kubelet_measurement_and_denominator_remain_none() -> None:
    module = load_resource_metrics_module()
    partial_pod = pod(
        containers=[
            {
                "name": "app",
                "resources": {
                    "requests": {"cpu": "100m", "memory": "128Mi"},
                    "limits": {"cpu": "500m", "memory": "256Mi"},
                },
            },
            {
                "name": "sidecar",
                "resources": {
                    "requests": {"memory": "64Mi"},
                    "limits": {"cpu": "100m"},
                },
            },
        ]
    )

    async def handle(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "pods": [
                    {
                        "podRef": {
                            "name": "checkout-0",
                            "namespace": "shop",
                            "uid": "pod-uid-1",
                        },
                        "cpu": {"time": "2026-07-15T03:00:00Z"},
                        "memory": {"workingSetBytes": 67_108_864},
                    }
                ]
            },
        )

    async def collect() -> dict[str, dict[str, Any]]:
        collector = module.PodResourceMetricsCollector()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await collector.collect(
                client,
                base_url="https://kubernetes.default.svc",
                headers={},
                pods=[partial_pod],
                actual_interval_seconds=2.0,
            )

    measured = asyncio.run(collect())["shop/checkout-0"]
    assert measured["cpu_mcores"] is None
    assert measured["cpu_request_pct"] is None
    assert measured["cpu_limit_pct"] is None
    assert measured["mem_mib"] == 64.0
    assert measured["mem_request_pct"] == pytest.approx(100 / 3)
    assert measured["mem_limit_pct"] is None
    assert measured["metrics_metadata"]["degraded_reason"] == "kubelet_measurement_partial"


def test_kubelet_access_failure_uses_real_metrics_server_values_and_keeps_reason() -> None:
    module = load_resource_metrics_module()
    requested_paths: list[str] = []

    async def handle(request: httpx.Request) -> httpx.Response:
        requested_paths.append(request.url.path)
        if "/proxy/stats/summary" in request.url.path:
            return httpx.Response(403, json={"message": "forbidden"})
        if request.url.path == "/apis/metrics.k8s.io/v1beta1/namespaces/shop/pods":
            return httpx.Response(
                200,
                json={
                    "items": [
                        {
                            "metadata": {
                                "name": "checkout-0",
                                "namespace": "shop",
                            },
                            "timestamp": "2026-07-15T03:00:01Z",
                            "containers": [
                                {
                                    "name": "app",
                                    "usage": {"cpu": "200m", "memory": "128Mi"},
                                },
                                {
                                    "name": "sidecar",
                                    "usage": {"cpu": "50m", "memory": "64Mi"},
                                },
                            ],
                        }
                    ]
                },
            )
        raise AssertionError(f"unexpected path: {request.url.path}")

    async def collect() -> dict[str, dict[str, Any]]:
        collector = module.PodResourceMetricsCollector()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
            return await collector.collect(
                client,
                base_url="https://kubernetes.default.svc",
                headers={},
                pods=[pod()],
                actual_interval_seconds=1.0,
            )

    measured = asyncio.run(collect())["shop/checkout-0"]
    assert measured["cpu_mcores"] == 250.0
    assert measured["mem_mib"] == 192.0
    assert measured["metrics_metadata"] == {
        "source": "metrics_server_fallback",
        "actual_interval_seconds": 1.0,
        "degraded_reason": "kubelet_stats_forbidden",
    }
    assert requested_paths == [
        "/api/v1/nodes/node-a/proxy/stats/summary",
        "/apis/metrics.k8s.io/v1beta1/namespaces/shop/pods",
    ]


def test_node_collection_has_a_concurrency_ceiling() -> None:
    module = load_resource_metrics_module()
    active = 0
    peak = 0

    class ProbeCollector(module.PodResourceMetricsCollector):
        async def _fetch_node_stats(
            self,
            _client: Any,
            _base_url: str,
            _headers: dict[str, str],
            node_name: str,
        ) -> tuple[dict[tuple[str, str], dict[str, Any]], str | None]:
            nonlocal active, peak
            active += 1
            peak = max(peak, active)
            await asyncio.sleep(0.005)
            active -= 1
            index = int(node_name.rpartition("-")[2])
            return (
                {
                    ("shop", f"pod-{index}"): {
                        "uid": f"uid-{index}",
                        "cpu_mcores": 10.0,
                        "mem_bytes": 1_048_576,
                        "observed_at": "2026-07-15T03:00:00Z",
                    }
                },
                None,
            )

    pods = [
        pod(name=f"pod-{index}", node_name=f"node-{index}", uid=f"uid-{index}")
        for index in range(12)
    ]
    collector = ProbeCollector(node_concurrency=3)
    measured = asyncio.run(
        collector.collect(
            object(),
            base_url="https://kubernetes.default.svc",
            headers={},
            pods=pods,
            actual_interval_seconds=1.0,
        )
    )

    assert len(measured) == 12
    assert peak == 3


def test_generated_and_static_agent_rbac_grant_only_node_proxy_get() -> None:
    from domains.target.install_manifest import target_install_manifest
    from packages.contracts.gateway.requests import TargetRegisterRequest

    request = TargetRegisterRequest(
        cluster_id="target-cluster-01",
        name="target",
        environment="sandbox",
        workspace_id="default",
        management_base_url="http://management.local:30080",
        image="ghcr.io/acme/agent:test",
    )
    manifests = [
        target_install_manifest(request, "agent-secret"),
        *[
            (ROOT / path).read_text(encoding="utf-8")
            for path in (
                Path("deploy/target/target.yaml"),
                Path("deploy/management/target-agent.yaml"),
                Path("deploy/oss/kubeheal-oss.yaml"),
                Path("charts/opsia/templates/agent-rbac.yaml"),
            )
        ],
    ]

    for manifest in manifests:
        assert 'resources: ["nodes/proxy"]' in manifest
        assert 'resources: ["nodes/stats"]' not in manifest
        proxy_rule = manifest.split('resources: ["nodes/proxy"]', 1)[1].split("---", 1)[0]
        assert 'verbs: ["get"]' in proxy_rule
        assert all(
            forbidden not in proxy_rule
            for forbidden in ('"list"', '"watch"', '"create"', '"patch"', '"delete"')
        )
