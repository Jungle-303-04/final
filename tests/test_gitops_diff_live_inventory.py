from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from conftest import load_service

from domains.gitops.events import (
    Diff,
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)


def rendered_deployment(*, desired_replicas: int) -> RenderedManifest:
    image = "registry.example/api:v2"
    return RenderedManifest(
        api_version="apps/v1",
        kind="Deployment",
        metadata=RenderedMetadata(name="api", namespace="sandbox"),
        spec=RenderedSpec(replicas=desired_replicas, image=image),
        manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "api", "namespace": "sandbox"},
            "spec": {
                "replicas": desired_replicas,
                "template": {
                    "spec": {
                        "containers": [{"name": "api", "image": image}],
                    }
                },
            },
        },
        declared_fields=[
            "spec.replicas",
            "spec.template.spec.containers[name=api].image",
        ],
        managed_fields=[
            "spec.replicas",
            "spec.template.spec.containers[name=api].image",
        ],
        last_approved_snapshot={
            "spec.replicas": 2,
            "spec.template.spec.containers[name=api].image": image,
        },
    )


def observed_deployment(*, live_replicas: int) -> dict[str, object]:
    return {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {"name": "api", "namespace": "sandbox"},
        "spec": {
            "replicas": live_replicas,
            "template": {
                "spec": {
                    "containers": [
                        {"name": "api", "image": "registry.example/api:v2"},
                    ],
                }
            },
        },
    }


def replica_change(diff: Diff) -> dict[str, object]:
    return next(
        change for change in diff.changes if change["field_path"] == "spec.replicas"
    )


def test_diff_uses_live_replicas_for_intended_scale_down(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITOPS_REQUIRE_APPROVED_SNAPSHOT", "1")
    service = load_service("gitops/diff-worker")
    event = ManifestRenderedBody(
        rendered_manifest=rendered_deployment(desired_replicas=1),
        environment="production",
    )

    diff = service.build_desired_diff(
        event,
        "registry.example/api:v2",
        actual_manifest=observed_deployment(live_replicas=2),
        inventory_manifest_supported=True,
    )

    change = replica_change(diff)
    assert change["classification"] == "intended_change"
    assert change["before"] == 2
    assert change["after"] == 1
    assert diff.has_changes is True
    assert diff.basis["live_source"] == "observed_actual_manifest"


def test_diff_does_not_reapply_when_live_already_matches_new_desired(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GITOPS_REQUIRE_APPROVED_SNAPSHOT", "1")
    service = load_service("gitops/diff-worker")
    event = ManifestRenderedBody(
        rendered_manifest=rendered_deployment(desired_replicas=1),
        environment="production",
    )

    diff = service.build_desired_diff(
        event,
        "registry.example/api:v2",
        actual_manifest=observed_deployment(live_replicas=1),
        inventory_manifest_supported=True,
    )

    assert replica_change(diff)["classification"] == "already_converged"
    assert diff.has_changes is False


def test_inventory_manifest_loader_reconstructs_observed_workload() -> None:
    service = load_service("gitops/diff-worker")
    event = ManifestRenderedBody(
        rendered_manifest=rendered_deployment(desired_replicas=1),
        workspace_id="workspace-1",
        cluster_id="cluster-1",
    )

    class Inventory:
        async def get_actual_resource_manifest(self, *args: object) -> dict[str, object]:
            assert args == (
                "workspace-1",
                "cluster-1",
                "sandbox",
                "deployment/api",
            )
            return {
                "kind": "Deployment",
                "raw": {
                    "kind": "Deployment",
                    "name": "api",
                    "namespace": "sandbox",
                    "desired_replicas": 2,
                    "pod_template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "api",
                                    "image": "registry.example/api:v2",
                                }
                            ]
                        }
                    },
                },
            }

    actual, supported = asyncio.run(
        service.load_actual_resource_manifest(
            event,
            SimpleNamespace(db=Inventory()),
        )
    )

    assert supported is True
    assert actual is not None
    assert actual["spec"]["replicas"] == 2
