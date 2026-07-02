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
                "spec": {
                    "replicas": 2,
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "checkout-api",
                                    "image": "img:new",
                                }
                            ]
                        }
                    },
                },
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
    assert outs[0].diff.status == "intended_change"
    assert outs[0].diff.has_changes is True
    assert outs[0].diff.basis["policy_source"] == "demo_declared_fields"
    assert outs[0].diff.basis["policy_managed_fields"] == [
        "spec.replicas",
        "spec.template.spec.containers[name=checkout-api].image",
    ]


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


def test_unknown_declared_field_requires_user_adoption() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=3, image="unknown"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                "spec": {
                    "replicas": 3,
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "checkout-api",
                                    "image": "unknown",
                                }
                            ]
                        }
                    },
                },
            },
            declared_fields=[
                "spec.replicas",
                "spec.template.spec.containers[name=checkout-api].image",
            ],
            managed_fields=["spec.template.spec.containers[name=checkout-api].image"],
            last_approved_snapshot={
                "spec.template.spec.containers[name=checkout-api].image": "unknown"
            },
        )
    )

    outs = run_handler(diff.on_manifest_rendered, payload)

    assert outs[0].diff.status == "adoption_required"
    assert outs[0].diff.risk == "review-required"
    assert outs[0].diff.changes == [
        {
            "field_path": "spec.replicas",
            "classification": "adoption_required",
            "old_desired": "<missing>",
            "live": 3,
            "new_desired": 3,
            "before": 3,
            "after": 3,
        }
    ]
    assert outs[0].diff.basis["policy_source"] == "rendered_policy"
    assert outs[0].diff.basis["unknown_fields"] == ["spec.replicas"]


def test_ignored_declared_field_is_not_diffed() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=3, image="unknown"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                "spec": {
                    "replicas": 3,
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "checkout-api",
                                    "image": "unknown",
                                }
                            ]
                        }
                    },
                },
            },
            declared_fields=[
                "spec.replicas",
                "spec.template.spec.containers[name=checkout-api].image",
            ],
            managed_fields=["spec.template.spec.containers[name=checkout-api].image"],
            ignored_fields=["spec.replicas"],
            last_approved_snapshot={
                "spec.template.spec.containers[name=checkout-api].image": "unknown"
            },
        )
    )

    outs = run_handler(diff.on_manifest_rendered, payload)

    assert outs[0].diff.status == "no_change"
    assert outs[0].diff.has_changes is False
    assert outs[0].diff.changes == []
    assert outs[0].diff.basis["ignored_fields"] == ["spec.replicas"]
