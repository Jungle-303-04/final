from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from domains.rca.events import SafePrPatchPreparedBody
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256


def _request(**kwargs) -> SafePrRequestedBody:
    payload = {
        "title": "Apply manifest update",
        "body": "Update generated manifest.",
        "provider": "github",
        "manifest_path": "deploy/app.yaml",
        "patches": [
            SafePrFilePatch(
                path="deploy/app.yaml",
                content="apiVersion: apps/v1\nkind: Deployment\n",
                description="rendered Kubernetes manifest",
            )
        ],
    }
    payload.update(kwargs)
    return SafePrRequestedBody(**payload)


def _prepared(request: SafePrRequestedBody) -> SafePrPatchPreparedBody:
    return SafePrPatchPreparedBody(
        title=request.title,
        body=request.body,
        patch={"patches": [patch.to_body() for patch in request.patches]},
        provider=request.provider,
        request=request.to_body(),
        workspace_id=request.workspace_id,
        repository_id=request.repository_id,
        binding_id=request.binding_id,
        application_id=request.application_id,
        workflow_run_id=request.workflow_run_id,
        environment=request.environment,
        manifest_path=request.manifest_path,
        approval_ref=request.approval_ref,
        policy_decision_ref=request.policy_decision_ref,
    )


def test_ai_diff_worker_emits_ready_after_allowed_diff() -> None:
    ai_diff = load_service("ai/diff-worker")

    outs = run_handler(ai_diff.on_safe_pr_patch_prepared, _prepared(_request()))

    assert subjects_of(outs) == ["diff.explained", "safe_pr.ready_for_creation"]
    assert outs[0].ready_for_creation is True
    assert outs[1].request.patches


def test_ai_diff_worker_emits_failed_event_after_blocked_diff() -> None:
    ai_diff = load_service("ai/diff-worker")
    request = _request(patches=[], commit_sha="abc123", patch_sha256="empty-patch")

    outs = run_handler(
        ai_diff.on_safe_pr_patch_prepared,
        _prepared(request),
    )

    assert subjects_of(outs) == ["diff.explained", "safe_pr.failed"]
    assert outs[0].ready_for_creation is False
    assert outs[1].stage == "diff"
    assert outs[1].reason_code == "missing_patches"
    assert outs[1].commit_sha == "abc123"
    assert outs[1].patch_sha256 == safe_pr_patch_sha256([])
