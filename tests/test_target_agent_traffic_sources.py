from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
AGENT_DIR = ROOT / "src" / "services" / "target" / "cluster-agent"


class ObservedKubernetes:
    async def request(self, _method: str, path: str, **_kwargs: object) -> httpx.Response:
        request = httpx.Request("GET", f"https://kubernetes.test{path}")
        if path == "/version":
            return httpx.Response(200, request=request, json={"gitVersion": "v1.33.1"})
        if path == "/api/v1/nodes":
            return httpx.Response(
                200,
                request=request,
                json={
                    "items": [
                        {
                            "metadata": {
                                "labels": {
                                    "eks.amazonaws.com/nodegroup": "workers",
                                }
                            }
                        }
                    ]
                },
            )
        if "k8s-app%3Dhubble-relay" in path:
            return httpx.Response(
                200,
                request=request,
                json={
                    "items": [
                        {
                            "metadata": {
                                "namespace": "kube-system",
                                "labels": {
                                    "k8s-app": "hubble-relay",
                                    "app.kubernetes.io/version": "1.17.2",
                                },
                            },
                            "status": {"phase": "Running"},
                        }
                    ]
                },
            )
        if path.endswith("/namespaces/kube-system/services/hubble-relay"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "metadata": {"name": "hubble-relay", "namespace": "kube-system"},
                    "spec": {"ports": [{"name": "grpc", "port": 80}]},
                },
            )
        if "app%3Distiod" in path or "app.kubernetes.io%2Fname%3Dcaretta" in path:
            return httpx.Response(200, request=request, json={"items": []})
        if path.endswith("/namespaces/kube-system/daemonsets/cilium"):
            return httpx.Response(
                200,
                request=request,
                json={"metadata": {"name": "cilium"}},
            )
        return httpx.Response(404, request=request, json={"kind": "Status"})


def test_detector_reports_only_observed_sources_with_cluster_facts() -> None:
    sys.path.insert(0, str(AGENT_DIR))
    try:
        module = importlib.import_module("traffic_sources")
        observation = asyncio.run(
            module.TrafficSourceDetector(ObservedKubernetes()).observe(active_source="hubble")
        )
    finally:
        sys.path.remove(str(AGENT_DIR))
        sys.modules.pop("traffic_sources", None)

    assert observation["active_source"] == "hubble"
    assert observation["cluster"] == {
        "platform": "eks",
        "cni": "cilium",
        "dataplane_v2": False,
        "kubernetes_version": "v1.33.1",
    }
    assert observation["sources"] == [
        {
            "key": "caretta",
            "label": "Caretta",
            "status": "not_detected",
            "version": None,
            "native": False,
            "message": "collector workload was not observed",
        },
        {
            "key": "hubble",
            "label": "Hubble",
            "status": "available",
            "version": "1.17.2",
            "native": True,
            "message": "relay service and running endpoint were observed",
        },
        {
            "key": "istio",
            "label": "Istio",
            "status": "not_detected",
            "version": None,
            "native": False,
            "message": "control-plane workload was not observed",
        },
    ]


def test_agent_control_store_persists_active_traffic_source(tmp_path: Path) -> None:
    sys.path.insert(0, str(AGENT_DIR))
    try:
        module = importlib.import_module("control.store")
        path = tmp_path / "agent-control.db"
        first = module.AgentControlStore(str(path))
        first.save_runtime_setting("traffic.active_source", "hubble")
        first.close()
        second = module.AgentControlStore(str(path))
        assert second.load_runtime_setting("traffic.active_source") == "hubble"
        second.close()
    finally:
        sys.path.remove(str(AGENT_DIR))
        for name in ("control.store", "control"):
            sys.modules.pop(name, None)
