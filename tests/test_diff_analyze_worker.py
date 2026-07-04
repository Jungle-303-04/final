from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.gitops.events import DesiredDesiredDiffDetectedBody, Diff
from domains.gitops.repository import derive_approval_id


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
    db = SpyDb()
    safe = run_handler(
        analyze.on_desired_diff,
        DesiredDesiredDiffDetectedBody(diff=_diff("sandbox-only")),
        db=db,
    )
    approval_ref = derive_approval_id("workflow-default")
    policy_decision_ref = f"policy-decision:{approval_ref}:safe_pr"
    assert subjects_of(safe) == ["diff.analyzed", "safe_pr.requested"]
    assert safe[0].safe is True
    assert safe[1].workspace_id == "workspace-1"
    assert safe[1].repository_id == "repo-1"
    assert safe[1].binding_id == "binding-1"
    assert safe[1].next_alert is not None
    assert safe[1].next_alert.workspace_id == "workspace-1"
    assert safe[1].next_alert.cluster_id == "cluster-1"
    assert safe[1].next_alert.next_command is not None
    assert safe[1].next_alert.next_command.action == "apply_manifest"
    assert safe[1].next_alert.next_command.cluster_id == "cluster-1"
    assert safe[1].next_alert.next_command.workspace_id == "workspace-1"
    assert safe[1].next_alert.next_command.approval_ref == approval_ref
    assert safe[1].next_alert.next_command.policy_decision_ref == policy_decision_ref
    assert db.called("request_workflow_approval")
    assert db.called("resolve_workflow_approval")
    approval_payload = db.calls[0][1][0]
    assert approval_payload["approval_id"] == approval_ref
    assert approval_payload["details"]["policy_decision_ref"] == policy_decision_ref
    assert approval_payload["details"]["policy_route"] == "safe_pr"


def test_unsafe_diff_skips_pr() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    unsafe = run_handler(
        analyze.on_desired_diff, DesiredDesiredDiffDetectedBody(diff=_diff("non-sandbox-namespace"))
    )
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
    outs = run_handler(analyze.on_desired_diff, DesiredDesiredDiffDetectedBody(diff=noop))
    assert subjects_of(outs) == ["diff.analyzed"]
    assert outs[0].safe is False
    assert outs[0].reason == "desired and actual images already match"


def test_manifest_diff_with_same_image_is_not_treated_as_noop() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    diff = _diff("sandbox-only")
    manifest_diff = Diff(
        resource=diff.resource,
        namespace=diff.namespace,
        desired_image=diff.actual_image,
        actual_image=diff.actual_image,
        risk=diff.risk,
        workspace_id=diff.workspace_id,
        repository_id=diff.repository_id,
        binding_id=diff.binding_id,
        cluster_id=diff.cluster_id,
        desired_manifest={
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
            "spec": {"replicas": 3},
        },
    )

    outs = run_handler(analyze.on_desired_diff, DesiredDesiredDiffDetectedBody(diff=manifest_diff))

    assert subjects_of(outs) == ["diff.analyzed", "safe_pr.requested"]
    assert outs[0].safe is True
    assert outs[1].body == "deployment/checkout-api: apply rendered manifest"
    assert len(outs[1].patches) == 1
    assert outs[1].patches[0].path == "deploy.yaml"
    assert "apiVersion: apps/v1" in outs[1].patches[0].content
    assert "replicas: 3" in outs[1].patches[0].content
