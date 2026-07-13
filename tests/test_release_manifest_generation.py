from __future__ import annotations

import asyncio
from types import SimpleNamespace

import yaml
from fastapi import HTTPException

from domains.release_flow import router as release_router
from domains.release_flow.manifest import render_release_step_manifest
from domains.scm.events import SafePrRequestedBody
from packages.contracts.gateway.requests import (
    ReleaseManifestRenderRequest,
    ReleaseManifestSafePrRequest,
)


def full_plan() -> dict[str, object]:
    return {
        "plan_id": "plan-1",
        "name": "Checkout release",
        "settings": {"default_strategy": "rolling"},
        "steps": [
            {
                "application_id": "checkout",
                "name": "Checkout API",
                "position": 0,
                "depends_on": [],
                "config": {
                    "image": "ghcr.io/example/checkout-api:v1.2.3",
                    "branch": "main",
                    "commit_sha": "abc123",
                    "manifest_path": "deploy/checkout.yaml",
                    "namespace": "sandbox",
                    "replicas": 3,
                    "container_port": 8080,
                    "service_port": 80,
                    "config_map": {"LOG_LEVEL": "info"},
                    "secret_refs": [
                        {
                            "env": "DATABASE_URL",
                            "secret_name": "checkout-secrets",
                            "secret_key": "database-url",
                        }
                    ],
                    "autoscaling_enabled": True,
                    "min_replicas": 3,
                    "max_replicas": 8,
                    "ingress_enabled": True,
                    "ingress_host": "checkout.example.com",
                },
            }
        ],
    }


def test_release_step_manifest_generates_real_kubernetes_resources() -> None:
    result = render_release_step_manifest(
        full_plan(),
        0,
        {
            "application_id": "checkout",
            "name": "checkout-api",
            "manifest_path": "deploy/checkout.yaml",
            "metadata": {"source_type": "raw-yaml"},
        },
    )

    docs = [doc for doc in yaml.safe_load_all(result["manifest"]) if doc]
    kinds = [doc["kind"] for doc in docs]

    assert kinds == [
        "ConfigMap",
        "Deployment",
        "Service",
        "PodDisruptionBudget",
        "HorizontalPodAutoscaler",
        "Ingress",
    ]
    deployment = next(doc for doc in docs if doc["kind"] == "Deployment")
    service = next(doc for doc in docs if doc["kind"] == "Service")
    container = deployment["spec"]["template"]["spec"]["containers"][0]

    assert result["files"][0]["path"] == "deploy/checkout.yaml"
    assert deployment["metadata"]["namespace"] == "sandbox"
    assert service["spec"]["selector"] == deployment["spec"]["selector"]["matchLabels"]
    assert container["image"] == "ghcr.io/example/checkout-api:v1.2.3"
    assert container["env"] == [
        {
            "name": "DATABASE_URL",
            "valueFrom": {
                "secretKeyRef": {
                    "name": "checkout-secrets",
                    "key": "database-url",
                }
            },
        }
    ]
    assert "database-url" in result["manifest"]
    assert "postgres://" not in result["manifest"]
    assert not [diag for diag in result["diagnostics"] if diag.severity == "error"]


def test_release_step_manifest_blocks_missing_image_and_plain_secret_config() -> None:
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config.pop("image")
    config["config_map"] = {"PASSWORD": "plain-text"}

    result = render_release_step_manifest(plan, 0, {})
    codes = {diag.code for diag in result["diagnostics"]}

    assert "manifest.image_required" in codes
    assert "manifest.secret_like_config_key" in codes
    assert "plain-text" not in result["manifest"]


def test_release_step_manifest_blocks_unsafe_repository_path() -> None:
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config["generated_manifest_path"] = "../checkout.yaml"

    result = render_release_step_manifest(plan, 0, {})
    codes = {diag.code for diag in result["diagnostics"]}

    assert "manifest.path_unsafe" in codes
    assert result["files"][0]["path"] == "deploy/checkout-api.yaml"


def test_kustomize_sources_default_to_generated_manifest_path() -> None:
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config.pop("manifest_path")
    result = render_release_step_manifest(
        plan,
        0,
        {
            "application_id": "checkout",
            "name": "checkout-api",
            "manifest_path": "deploy/k8s/kustomization.yaml",
            "metadata": {"source_type": "kustomize"},
        },
    )

    assert result["files"][0]["path"] == "deploy/k8s/generated/checkout-api.generated.yaml"
    assert result["warnings"]


def test_release_manifest_route_uses_application_context(monkeypatch) -> None:
    class Db:
        def get_application(self, workspace_id: str, application_id: str) -> dict[str, object]:
            assert workspace_id == "workspace-a"
            assert application_id == "checkout"
            return {
                "application_id": "checkout",
                "name": "checkout-api",
                "manifest_path": "deploy/live.yaml",
                "metadata": {"source_type": "raw-yaml"},
            }

    monkeypatch.setattr(release_router, "require_plan_application_read_access", lambda *_args: None)
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config.pop("manifest_path")
    payload = ReleaseManifestRenderRequest(plan=release_router.ReleasePlanUpsertRequest(**plan))

    response = asyncio.run(
        release_router.render_release_manifest(
            payload,
            current=SimpleNamespace(user_id="operator", workspace_id="workspace-a", roles=()),
            db=Db(),
        )
    )

    assert response.files[0].path == "deploy/live.yaml"
    assert response.resource_count >= 3


def test_release_manifest_safe_pr_route_submits_generated_file_patch(monkeypatch) -> None:
    class Db:
        def get_application(self, workspace_id: str, application_id: str) -> dict[str, object]:
            assert workspace_id == "workspace-a"
            assert application_id == "checkout"
            return {
                "application_id": "checkout",
                "name": "checkout-api",
                "image": "ghcr.io/example/checkout-api:v1.2.2",
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/live.yaml",
                "cluster_id": "cluster-1",
                "metadata": {"source_type": "raw-yaml"},
            }

    class Events:
        def __init__(self) -> None:
            self.body: SafePrRequestedBody | None = None

        async def accept_body(self, body: SafePrRequestedBody, **_kwargs: object) -> object:
            self.body = body
            return SimpleNamespace(
                event=SimpleNamespace(event_id="evt-safe-pr", correlation_id="corr-safe-pr")
            )

    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )
    events = Events()
    payload = ReleaseManifestSafePrRequest(
        plan=release_router.ReleasePlanUpsertRequest(**full_plan())
    )

    response = asyncio.run(
        release_router.submit_release_manifest_safe_pr(
            payload,
            current=SimpleNamespace(user_id="operator", workspace_id="workspace-a", roles=()),
            db=Db(),
            events=events,
        )
    )

    assert response.accepted is True
    assert response.event_id == "evt-safe-pr"
    assert response.workflow_run_id
    assert response.application_id == "checkout"
    assert response.repo_ref == "org/checkout"
    assert response.base_branch == "main"
    assert response.manifest_path == "deploy/checkout.yaml"
    assert response.commit_sha == "abc123"
    assert len(response.patch_sha256) == 64
    assert events.body is not None
    assert events.body.application_id == "checkout"
    assert events.body.repository_id.startswith("repo-")
    assert events.body.repo_ref == "org/checkout"
    assert events.body.base_branch == "main"
    assert events.body.commit_sha == "abc123"
    assert events.body.patch_sha256 == response.patch_sha256
    assert events.body.patches[0].path == "deploy/checkout.yaml"
    assert "kind: Deployment" in events.body.patches[0].content
    assert len(events.body.patches) == 2
    assert events.body.patches[1].path.startswith(".gitops/rollback/")
    assert (
        events.body.patches[1].description
        == "Generated rollback manifest from current application state"
    )
    assert "ghcr.io/example/checkout-api:v1.2.2" in events.body.patches[1].content
    assert "ghcr.io/example/checkout-api:v1.2.3" not in events.body.patches[1].content
    assert "postgres://" not in events.body.patches[0].content
    assert "repo_ref: `org/checkout`" in events.body.body
    assert "branch: `main`" in events.body.body
    assert "rollback_patch: `.gitops/rollback/" in events.body.body


def test_release_manifest_safe_pr_route_blocks_error_diagnostics(monkeypatch) -> None:
    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config.pop("image")
    payload = ReleaseManifestSafePrRequest(plan=release_router.ReleasePlanUpsertRequest(**plan))

    try:
        asyncio.run(
            release_router.submit_release_manifest_safe_pr(
                payload,
                current=SimpleNamespace(user_id="operator", workspace_id="workspace-a", roles=()),
                db=SimpleNamespace(),
                events=SimpleNamespace(),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "image is required" in str(exc.detail)
    else:
        raise AssertionError("Safe PR submission should be blocked when manifest has errors")


def test_release_manifest_safe_pr_route_blocks_production_without_rollback_source(
    monkeypatch,
) -> None:
    class Db:
        def get_application(self, workspace_id: str, application_id: str) -> dict[str, object]:
            assert workspace_id == "workspace-a"
            assert application_id == "checkout"
            return {
                "application_id": "checkout",
                "name": "checkout-api",
                "repo_ref": "org/checkout",
                "branch": "main",
                "manifest_path": "deploy/live.yaml",
                "cluster_id": "cluster-1",
                "metadata": {"source_type": "raw-yaml"},
            }

    class Events:
        called = False

        async def accept_body(self, body: SafePrRequestedBody, **_kwargs: object) -> object:
            self.called = True
            return SimpleNamespace(
                event=SimpleNamespace(event_id="evt-safe-pr", correlation_id="corr-safe-pr")
            )

    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )
    plan = full_plan()
    step = plan["steps"][0]
    assert isinstance(step, dict)
    config = step["config"]
    assert isinstance(config, dict)
    config["environment"] = "production"
    config["namespace"] = "production"
    events = Events()
    payload = ReleaseManifestSafePrRequest(plan=release_router.ReleasePlanUpsertRequest(**plan))

    try:
        asyncio.run(
            release_router.submit_release_manifest_safe_pr(
                payload,
                current=SimpleNamespace(user_id="operator", workspace_id="workspace-a", roles=()),
                db=Db(),
                events=events,
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "production generated Safe PR requires rollback_image" in str(exc.detail)
    else:
        raise AssertionError("Production Safe PR should require rollback source")

    assert events.called is False


def test_release_manifest_safe_pr_route_requires_repository_context(monkeypatch) -> None:
    class Db:
        def get_application(self, _workspace_id: str, _application_id: str) -> dict[str, object]:
            return {
                "application_id": "checkout",
                "name": "checkout-api",
                "branch": "main",
                "manifest_path": "deploy/live.yaml",
                "cluster_id": "cluster-1",
            }

    monkeypatch.setattr(
        release_router, "require_plan_application_manage_access", lambda *_args: None
    )
    payload = ReleaseManifestSafePrRequest(
        plan=release_router.ReleasePlanUpsertRequest(**full_plan())
    )

    try:
        asyncio.run(
            release_router.submit_release_manifest_safe_pr(
                payload,
                current=SimpleNamespace(user_id="operator", workspace_id="workspace-a", roles=()),
                db=Db(),
                events=SimpleNamespace(),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "missing repository context" in str(exc.detail)
    else:
        raise AssertionError("Safe PR submission should require repository context")
