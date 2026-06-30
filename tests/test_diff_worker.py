from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

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
        ),
        repository_id="repo-1",
        binding_id="binding-1",
        cluster_id="cluster-1",
    )
    outs = run_handler(diff.on_manifest_rendered, payload)
    assert subjects_of(outs) == ["desired.diff.detected"]
    assert outs[0].diff.desired_image == "img:new"
    assert outs[0].diff.resource == "deployment/checkout-api"
    assert outs[0].diff.repository_id == "repo-1"
    assert outs[0].diff.binding_id == "binding-1"
    assert outs[0].diff.cluster_id == "cluster-1"
