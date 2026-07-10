from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import (
    ManifestRenderedBody,
    RenderedManifest,
    RenderedMetadata,
    RenderedSpec,
)
from packages.config.constants import Sandbox


def test_diff_emits_desired_diff() -> None:
    diff = load_service("gitops/diff-worker")
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="img:new"),
            artifact_digest="sha256:test-digest",
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
        commit_sha="abc123",
        manifest_path="deploy/checkout-api.yaml",
        repo_ref="team/checkout",
        branch="main",
    )
    outs = run_handler(diff.on_manifest_rendered, payload)
    assert subjects_of(outs) == ["desired.diff.detected", "gitops.change_context.detected"]
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
    assert outs[0].diff.basis["policy_source"] == "dev_declared_fields_fallback"
    assert outs[0].diff.basis["policy_managed_fields"] == [
        "spec.replicas",
        "spec.template.spec.containers[name=checkout-api].image",
    ]
    assert outs[0].diff.basis["artifact_digest"] == "sha256:test-digest"
    change_context = outs[1].metadata["change_context"]
    assert change_context["gitops"] == {
        "repository": "team/checkout",
        "repository_id": "repo-1",
        "branch": "main",
        "manifest_path": "deploy/checkout-api.yaml",
        "commit_sha": "abc123",
        "binding_id": "binding-1",
        "environment": "sandbox",
    }
    assert change_context["image"]["current"] == "img:new"
    assert change_context["risk"]["risk_level"] == "sandbox-only"
    assert change_context["risk"]["approval_required"] is False
    assert any(
        change["change_type"] == "image"
        and change["field"] == "spec.template.spec.containers[name=checkout-api].image"
        for change in change_context["recent_changes"]
    )


def test_diff_requires_approved_snapshot_when_enabled(monkeypatch) -> None:
    monkeypatch.setenv("GITOPS_REQUIRE_APPROVED_SNAPSHOT", "1")
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
        )
    )

    outs = run_handler(diff.on_manifest_rendered, payload)

    assert outs[0].diff.status == "adoption_required"
    assert outs[0].diff.risk == "review-required"
    assert outs[0].diff.basis["old_desired_source"] == "missing_last_approved_snapshot"
    assert outs[0].diff.basis["policy_source"] == "missing_approved_policy"
    assert outs[0].diff.basis["policy_managed_fields"] == []
    assert outs[0].diff.basis["unknown_fields"] == [
        "spec.replicas",
        "spec.template.spec.containers[name=checkout-api].image",
    ]


def test_change_context_summarizes_probe_and_secret_config_refs() -> None:
    diff = load_service("gitops/diff-worker")
    image_path = "spec.template.spec.containers[name=checkout-api].image"
    env_path = "spec.template.spec.containers[name=checkout-api].env"
    env_from_path = "spec.template.spec.containers[name=checkout-api].envFrom"
    probe_path = "spec.template.spec.containers[name=checkout-api].readinessProbe"
    payload = ManifestRenderedBody(
        rendered_manifest=RenderedManifest(
            api_version="apps/v1",
            kind="Deployment",
            metadata=RenderedMetadata(name="checkout-api", namespace="sandbox"),
            spec=RenderedSpec(replicas=2, image="checkout:v2@sha256:abc"),
            manifest={
                "apiVersion": "apps/v1",
                "kind": "Deployment",
                "metadata": {"name": "checkout-api", "namespace": "sandbox"},
                "spec": {
                    "template": {
                        "spec": {
                            "containers": [
                                {
                                    "name": "checkout-api",
                                    "image": "checkout:v2@sha256:abc",
                                    "env": [
                                        {
                                            "name": "DATABASE_URL",
                                            "valueFrom": {
                                                "secretKeyRef": {
                                                    "name": "checkout-db-v2",
                                                    "key": "DATABASE_URL",
                                                }
                                            },
                                        }
                                    ],
                                    "envFrom": [{"configMapRef": {"name": "checkout-settings-v2"}}],
                                    "readinessProbe": {
                                        "httpGet": {"path": "/readyz", "port": 8080}
                                    },
                                }
                            ]
                        }
                    }
                },
            },
            managed_fields=[image_path, env_path, env_from_path, probe_path],
            last_approved_snapshot={
                image_path: "checkout:v1",
                env_path: [
                    {
                        "name": "DATABASE_URL",
                        "valueFrom": {
                            "secretKeyRef": {
                                "name": "checkout-db-v1",
                                "key": "DATABASE_URL",
                            }
                        },
                    }
                ],
                env_from_path: [{"configMapRef": {"name": "checkout-settings-v1"}}],
                probe_path: {"httpGet": {"path": "/healthz", "port": 8080}},
            },
        ),
        repository_id="repo-1",
        binding_id="binding-1",
        cluster_id="cluster-1",
        commit_sha="abc123",
        manifest_path="deploy/checkout-api.yaml",
        repo_ref="team/checkout",
        branch="main",
    )

    outs = run_handler(
        diff.on_manifest_rendered, payload, db=SpyDb(get_actual_resource_image="checkout:v1")
    )

    change_context = outs[1].metadata["change_context"]
    assert change_context["image"] == {
        "current": "checkout:v2@sha256:abc",
        "previous": "checkout:v1",
        "digest": "sha256:abc",
        "changed_recently": True,
    }
    assert change_context["rollout"]["rollback_available"] is True
    assert change_context["config"]["secret_ref_changed"] is True
    assert change_context["config"]["config_map_ref_changed"] is True
    assert {"name": "checkout-db-v2", "key": "DATABASE_URL"} in change_context["config"]["secrets"]
    assert {"name": "checkout-settings-v2"} in change_context["config"]["config_maps"]
    change_types = {change["change_type"] for change in change_context["recent_changes"]}
    assert {"image", "probe", "secret_ref", "config_ref"} <= change_types
    assert "checkout:v1" in str(change_context)
    assert "real-password" not in str(change_context)


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

    assert subjects_of(outs) == ["desired.diff.detected", "gitops.change_context.detected"]
    assert outs[0].diff.namespace == "kube-system"
    assert outs[0].diff.risk == Sandbox.UNSAFE_NAMESPACE_RISK_TAG


def test_diff_marks_production_environment_review_required_even_in_sandbox_namespace() -> None:
    diff = load_service("gitops/diff-worker")
    analyze = load_service("gitops/diff-analyze-worker")
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
        environment="production",
    )

    outs = run_handler(diff.on_manifest_rendered, payload)
    analyzed = run_handler(analyze.on_desired_diff, outs[0])

    assert outs[0].diff.risk == "review-required"
    assert outs[0].diff.has_changes is True
    assert outs[1].metadata["change_context"]["risk"]["approval_required"] is True
    assert subjects_of(analyzed) == ["diff.analyzed"]
    assert analyzed[0].safe is False


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

    assert subjects_of(outs) == ["desired.diff.detected", "gitops.change_context.detected"]
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
