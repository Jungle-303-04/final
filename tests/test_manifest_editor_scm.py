from __future__ import annotations

import asyncio
import hashlib

import pytest
from conftest import SpyDb, load_service, make_context

from domains.scm.events import SafePrFilePatch, SafePrRequestedBody
from domains.scm.pipeline import normalize_safe_pr_request, safe_pr_patch_sha256


def manifest_edit_request() -> SafePrRequestedBody:
    patch = SafePrFilePatch(
        path="deploy/app.yaml",
        content="apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout}\n",
    )
    return normalize_safe_pr_request(
        SafePrRequestedBody(
            title="Update Deployment checkout",
            body="Human-approved edit",
            provider="github",
            patches=[patch],
            pr_kind="safe_pr_manifest_edit",
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-manifest-edit-1",
            environment="sandbox",
            manifest_path=patch.path,
            repo_ref="project/repo",
            base_branch="main",
            commit_sha="a" * 40,
            approval_ref="approval-manifest-edit-1",
        )
    )


def granted_approval(request: SafePrRequestedBody) -> dict[str, object]:
    desired = request.patches[0].content
    return {
        "approval_id": request.approval_ref,
        "workflow_run_id": request.workflow_run_id,
        "workspace_id": request.workspace_id,
        "application_id": request.application_id,
        "binding_id": request.binding_id,
        "environment": request.environment,
        "status": "granted",
        "requested_by": "operator-1",
        "decided_by": "operator-1",
        "decision": "granted",
        "details": {
            "authority": "safe_pr_manifest_edit",
            "repository_id": request.repository_id,
            "repo_ref": request.repo_ref,
            "branch": request.base_branch,
            "manifest_path": request.manifest_path,
            "base_sha": request.commit_sha,
            "source_sha256": "sha256:" + "b" * 64,
            "desired_sha256": "sha256:" + hashlib.sha256(desired.encode()).hexdigest(),
            "patch_sha256": safe_pr_patch_sha256(request.patches),
        },
    }


def test_scm_writer_requires_exact_granted_manifest_edit_authority() -> None:
    scm = load_service("gitops/scm-worker")
    request = manifest_edit_request()
    approval = granted_approval(request)
    provider = scm.GithubScmProvider()

    authority = asyncio.run(
        provider.validate_manifest_edit_approval(
            request,
            make_context(SpyDb(get_workflow_approval=approval)),
        )
    )

    assert authority["base_sha"] == request.commit_sha


def test_scm_writer_rejects_manifest_edit_without_matching_human_decision() -> None:
    scm = load_service("gitops/scm-worker")
    request = manifest_edit_request()
    approval = granted_approval(request)
    approval["decided_by"] = "different-operator"
    provider = scm.GithubScmProvider()

    with pytest.raises(RuntimeError, match="granted human approval"):
        asyncio.run(
            provider.validate_manifest_edit_approval(
                request,
                make_context(SpyDb(get_workflow_approval=approval)),
            )
        )
