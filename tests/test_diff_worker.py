from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.config.constants import Sandbox
from packages.contracts.event_bus.bodies import (
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)


def test_diff_emits_desired_diff() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="img:new"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                "spec": {"replicas": 2},
            },
        ),
        repository_id="repo-1",
        binding_id="binding-1",
        cluster_id="cluster-1",
    )
    outs = run_handler(diff.on_manifest_rendered, payload)
    assert subjects_of(outs) == ["desired.diff.detected"]
    assert outs[0].diff.desired_image == "img:new"
    assert outs[0].diff.actual_image == "unknown"
    assert outs[0].diff.resource == "deployment/checkout-api"
    assert outs[0].diff.desired_manifest["kind"] == "Deployment"
    assert outs[0].diff.repository_id == "repo-1"
    assert outs[0].diff.binding_id == "binding-1"
    assert outs[0].diff.cluster_id == "cluster-1"
    assert outs[0].diff.risk == Sandbox.RISK_TAG


def test_diff_marks_non_sandbox_namespace_unsafe() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="kube-system"),
            spec=RenderedSpec(replicas=2, image="img:new"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "kube-system"},
                "spec": {"replicas": 2},
            },
        )
    )

    outs = run_handler(diff.on_manifest_rendered, payload)

    assert subjects_of(outs) == ["desired.diff.detected"]
    assert outs[0].diff.namespace == "kube-system"
    assert outs[0].diff.risk == Sandbox.UNSAFE_NAMESPACE_RISK_TAG


def test_diff_uses_actual_resource_image_reader_when_available() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="img:new"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "sandbox"},
            },
        ),
        workspace_id="workspace-1",
        cluster_id="cluster-1",
    )

    outs = run_handler(
        diff.on_manifest_rendered,
        payload,
        db=SpyDb(get_actual_resource_image="img:old"),
    )

    assert subjects_of(outs) == ["desired.diff.detected"]
    assert outs[0].diff.actual_image == "img:old"
