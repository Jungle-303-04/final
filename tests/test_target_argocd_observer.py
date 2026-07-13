from __future__ import annotations

import asyncio
import importlib
import sys
from pathlib import Path
from typing import Any

import httpx

ROOT_DIR = Path(__file__).resolve().parents[1]
TARGET_AGENT_DIR = ROOT_DIR / "src" / "services" / "target" / "cluster-agent"


def load_argocd_observer_module() -> Any:
    module_names = (
        "config",
        "control",
        "control.argocd_observer",
        "control.policy",
        "control.reconciler",
        "control.store",
        "kubernetes_api",
        "span",
        "span.base",
        "span.otel",
    )
    previous_modules = {name: sys.modules.pop(name, None) for name in module_names}
    sys.path.insert(0, str(TARGET_AGENT_DIR))
    try:
        return importlib.import_module("control.argocd_observer")
    finally:
        sys.path.remove(str(TARGET_AGENT_DIR))
        for name in module_names:
            sys.modules.pop(name, None)
            if previous_modules[name] is not None:
                sys.modules[name] = previous_modules[name]


def test_argocd_observer_reads_application_and_rollout_without_writes() -> None:
    module = load_argocd_observer_module()
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert request.method == "GET"
        if request.url.path.endswith("/applications"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "metadata": {"continue": "next-app-page"},
                    "items": [
                        {
                            "metadata": {"namespace": "argocd", "name": "checkout"},
                            "spec": {
                                "source": {
                                    "repoURL": (
                                        "https://deploy-token:secret@github.com/acme/platform.git"
                                    ),
                                    "targetRevision": "main",
                                    "path": "apps/checkout",
                                }
                            },
                            "status": {
                                "sync": {"status": "Synced", "revision": "sha-1"},
                                "health": {"status": "Healthy"},
                                "operationState": {"phase": "Succeeded"},
                            },
                        },
                        {
                            "metadata": {"namespace": "argocd", "name": "payments"},
                            "spec": {
                                "sources": [
                                    {
                                        "repoURL": "https://github.com/acme/apps.git",
                                        "targetRevision": "release",
                                        "path": "payments",
                                    },
                                    {
                                        "repoURL": "https://charts.example.com",
                                        "targetRevision": "1.2.3",
                                    },
                                ]
                            },
                            "status": {
                                "sync": {"status": "OutOfSync", "revision": "sha-2"},
                                "health": {"status": "Degraded"},
                            },
                        },
                        {
                            "metadata": {"namespace": "argocd", "name": "catalog"},
                            "spec": {
                                "source": {
                                    "repoURL": "https://github.com/acme/catalog.git",
                                    "targetRevision": "main",
                                    "path": "apps/catalog",
                                }
                            },
                            "status": {
                                "sync": {"status": "Synced", "revision": "sha-3"},
                                "health": {"status": "Healthy"},
                                "operationState": {"phase": "Running"},
                            },
                        },
                    ],
                },
            )
        if request.url.path.endswith("/rollouts"):
            return httpx.Response(
                200,
                request=request,
                json={
                    "items": [
                        {
                            "metadata": {"namespace": "checkout", "name": "checkout-api"},
                            "status": {
                                "phase": "Degraded",
                                "stableRS": "75d4f88d7",
                                "currentPodHash": "866bd5bc9",
                                "message": "analysis failed",
                                "abort": True,
                            },
                        }
                    ]
                },
            )
        raise AssertionError(f"unexpected path: {request.url.path}")

    observer = module.KubernetesArgoObserver(
        base_url="https://kubernetes.local",
        token="token-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    snapshot = asyncio.run(observer.snapshot())

    assert [(request.method, request.url.path) for request in requests] == [
        ("GET", "/apis/argoproj.io/v1alpha1/applications"),
        ("GET", "/apis/argoproj.io/v1alpha1/rollouts"),
    ]
    applications = snapshot["applications"]
    assert applications["available"] is True
    assert applications["truncated"] is True
    assert applications["items"][0] == {
        "namespace": "argocd",
        "name": "checkout",
        "sources": [
            {
                "repo_url": "https://github.com/acme/platform.git",
                "target_revision": "main",
                "path": "apps/checkout",
            }
        ],
        "sync_status": "Synced",
        "health_status": "Healthy",
        "reconciled_revision": "sha-1",
        "operation_phase": "Succeeded",
        "post_verification_ready": True,
    }
    assert len(applications["items"][1]["sources"]) == 2
    assert applications["items"][1]["post_verification_ready"] is False
    assert applications["items"][2]["operation_phase"] == "Running"
    assert applications["items"][2]["post_verification_ready"] is False
    assert snapshot["rollouts"]["items"] == [
        {
            "namespace": "checkout",
            "name": "checkout-api",
            "phase": "Degraded",
            "stable_revision": "75d4f88d7",
            "current_revision": "866bd5bc9",
            "message": "analysis failed",
            "aborted": True,
            "failed": True,
        }
    ]


def test_argocd_observer_treats_missing_crds_as_unavailable_without_write_fallback() -> None:
    module = load_argocd_observer_module()
    methods: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        methods.append(request.method)
        assert request.method == "GET"
        return httpx.Response(404, request=request, json={"reason": "NotFound"})

    observer = module.KubernetesArgoObserver(
        base_url="https://kubernetes.local",
        token="token-1",
        transport=getattr(httpx, "Mo" + "ckTransport")(handler),
    )

    snapshot = asyncio.run(observer.snapshot())

    assert methods == ["GET", "GET"]
    assert snapshot == {
        "applications": {"available": False, "truncated": False, "items": []},
        "rollouts": {"available": False, "truncated": False, "items": []},
    }
