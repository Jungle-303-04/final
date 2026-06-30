from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import Diff, DiffDetectedBody


def _diff(risk: str) -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk=risk,
        workspace_id="workspace-1",
        repository_id="repo-1",
        binding_id="binding-1",
        cluster_id="cluster-1",
    )


def test_safe_diff_requests_pr() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    safe = run_handler(analyze.on_desired_diff, DiffDetectedBody(diff=_diff("sandbox-only")))
    assert subjects_of(safe) == ["diff.analyzed", "safe_pr.requested", "alert.requested"]
    assert safe[0].safe is True
    assert safe[1].workspace_id == "workspace-1"
    assert safe[1].repository_id == "repo-1"
    assert safe[1].binding_id == "binding-1"
    assert safe[2].workspace_id == "workspace-1"
    assert safe[2].cluster_id == "cluster-1"
    assert safe[2].next_command is not None
    assert safe[2].next_command.action == "apply_manifest"
    assert safe[2].next_command.cluster_id == "cluster-1"
    assert safe[2].next_command.workspace_id == "workspace-1"


def test_unsafe_diff_skips_pr() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    unsafe = run_handler(analyze.on_desired_diff, DiffDetectedBody(diff=_diff("production")))
    assert subjects_of(unsafe) == ["diff.analyzed"]
    assert unsafe[0].safe is False


def test_noop_diff_skips_pr_even_when_sandbox() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    diff = _diff("sandbox-only")
    noop = Diff(
        resource=diff.resource,
        namespace=diff.namespace,
        desired_image=diff.desired_image,
        actual_image=diff.desired_image,
        risk=diff.risk,
    )
    outs = run_handler(analyze.on_desired_diff, DiffDetectedBody(diff=noop))
    assert subjects_of(outs) == ["diff.analyzed"]
    assert outs[0].safe is False
    assert outs[0].reason == "desired and actual images already match"
