from __future__ import annotations

import asyncio
import base64
import logging

import pytest
from conftest import SpyDb, github_scm_transport, load_service, run_handler, subjects_of

from domains.alert.events import AlertRequestedBody
from domains.gitops.source_patch import (
    ImageScalarReplacement,
    ManifestImagePatchPlan,
    canonical_manifest_digest,
    image_patch_content,
    parse_image_patch_plan,
    parse_single_manifest,
)
from domains.scm.events import (
    SafePrFilePatch,
    SafePrReadyForCreationBody,
    SafePrRequestedBody,
)
from domains.scm.pipeline import normalize_safe_pr_request, safe_pr_patch_sha256

PR_HTML_URL = "https://github.test.local/project/repo/pull/7"
APPROVED_SHA = "a" * 40
NEW_BASE_SHA = "b" * 40


def _structured_patch(source: str) -> SafePrFilePatch:
    plan = ManifestImagePatchPlan(
        source_type="raw-yaml",
        source_manifest_sha256=canonical_manifest_digest(parse_single_manifest(source, "raw-yaml")),
        expected_base_sha=APPROVED_SHA,
        manifest_path="deploy/app.yaml",
        replacements=(
            ImageScalarReplacement(
                container_name="checkout-api",
                current_image="ghcr.io/project/checkout-api:v2",
                previous_image="ghcr.io/project/checkout-api:v1",
            ),
        ),
    )
    return SafePrFilePatch(
        path=".gitops/safe-pr/patches/test-plan.yaml",
        content=image_patch_content(plan),
        description="restore approved image",
    )


def _structured_case(source: str) -> tuple[SafePrReadyForCreationBody, SpyDb, SafePrRequestedBody]:
    request = normalize_safe_pr_request(
        _request(
            workspace_id="workspace-1",
            repository_id="repo-1",
            binding_id="binding-1",
            application_id="app-1",
            workflow_run_id="workflow-1",
            environment="sandbox",
            manifest_path="deploy/app.yaml",
            repo_ref="project/repo",
            base_branch="main",
            commit_sha=APPROVED_SHA,
            patches=[_structured_patch(source)],
        )
    )
    desired_manifest = parse_single_manifest(source, "raw-yaml")
    artifact_digest = canonical_manifest_digest(desired_manifest)
    db = SpyDb(
        get_workflow_run={
            "workflow_run_id": request.workflow_run_id,
            "workspace_id": request.workspace_id,
            "application_id": request.application_id,
            "binding_id": request.binding_id,
            "environment": request.environment,
            "commit_sha": request.commit_sha,
        },
        get_workflow_step_details={
            "resource": "deployment/checkout-api",
            "workspace_id": request.workspace_id,
            "repository_id": request.repository_id,
            "binding_id": request.binding_id,
            "application_id": request.application_id,
            "workflow_run_id": request.workflow_run_id,
            "environment": request.environment,
            "manifest_path": request.manifest_path,
            "desired_manifest": desired_manifest,
            "basis": {
                "old_desired_source": "last_approved_snapshot",
                "artifact_digest": artifact_digest,
            },
            "changes": [
                {
                    "field_path": ("spec.template.spec.containers[name=checkout-api].image"),
                    "old_desired": "ghcr.io/project/checkout-api:v1",
                    "new_desired": "ghcr.io/project/checkout-api:v2",
                }
            ],
        },
        get_manifest_artifact_provenance={
            "workspace_id": request.workspace_id,
            "repository_id": request.repository_id,
            "binding_id": request.binding_id,
            "commit_sha": request.commit_sha,
            "manifest_path": request.manifest_path,
            "artifact_digest": artifact_digest,
            "source_manifest_sha256": canonical_manifest_digest(desired_manifest),
            "repo_ref": request.repo_ref,
            "branch": request.base_branch,
        },
    )
    ready = SafePrReadyForCreationBody(
        request=request,
        summary="safe pr ready",
        risk="low",
        workspace_id=request.workspace_id,
    )
    return ready, db, request


def _change_document_text(request: SafePrRequestedBody) -> str:
    patch_rows = "\n".join(
        f"- `{patch.path}`: {patch.description or 'manifest patch'}" for patch in request.patches
    )
    approval_rows = []
    if request.approval_ref:
        approval_rows.append(f"- approval_ref: `{request.approval_ref}`")
    if request.policy_decision_ref:
        approval_rows.append(f"- policy_decision_ref: `{request.policy_decision_ref}`")
    approval_section = "\n".join(approval_rows) if approval_rows else "- approval_ref: 없음"
    return (
        f"# {request.title}\n\n{request.body}\n\n"
        f"- manifest_path: `{request.manifest_path}`\n"
        f"- workflow_run_id: `{request.workflow_run_id}`\n"
        f"- environment: `{request.environment}`\n\n"
        "## Evidence\n\n"
        f"- commit_sha: `{request.commit_sha}`\n"
        f"- patch_sha256: `{request.patch_sha256}`\n\n"
        "## Approval\n\n"
        f"{approval_section}\n\n"
        "## Files\n\n"
        f"{patch_rows}\n"
    )


def _alert() -> AlertRequestedBody:
    return AlertRequestedBody(
        cluster_id="cluster-1",
        namespace="sandbox",
        severity="info",
        message="ready",
        reason="safe pr created",
    )


def _request(**kwargs) -> SafePrRequestedBody:
    payload = {
        "title": "t",
        "body": "b",
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


def _ready(**kwargs) -> SafePrReadyForCreationBody:
    return SafePrReadyForCreationBody(
        request=_request(**kwargs),
        summary="safe pr ready",
        risk="low",
        details={"test": True},
        workspace_id="default",
    )


def _github_env(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    monkeypatch.setenv("SCM_BASE_BRANCH", "main")


def _load_with_transport(monkeypatch, **transport_kwargs):
    repo = load_service("gitops/scm-worker")
    monkeypatch.setattr(
        repo,
        "SCM_PROVIDER",
        repo.GithubScmProvider(transport=github_scm_transport(PR_HTML_URL, **transport_kwargs)),
    )
    return repo


def test_repo_gateway_creates_pr_from_requested_event(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    contents: list[dict[str, object]] = []
    repo = _load_with_transport(monkeypatch, calls=calls, contents=contents)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(
            approval_ref="approval-1", policy_decision_ref="policy-decision-1", commit_sha="abc123"
        ),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].pr_url == PR_HTML_URL
    assert outs[0].provider == "github"
    assert outs[0].mode == "github_rest"
    assert outs[0].repo_ref == "project/repo"
    assert outs[0].base_branch == "main"
    assert outs[0].manifest_path == "deploy/app.yaml"
    assert outs[0].commit_sha == "abc123"
    assert len(outs[0].patch_sha256) == 64
    assert db.called("save_pull_request")
    change_doc_path = f"/repos/project/repo/contents/.gitops/safe-pr/{outs[0].workflow_run_id}.md"
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("POST", "/repos/project/repo/git/refs"),
        ("PUT", change_doc_path),
        ("PUT", "/repos/project/repo/contents/deploy/app.yaml"),
        ("POST", "/repos/project/repo/pulls"),
    ]
    change_doc = base64.b64decode(str(contents[0]["content"])).decode()
    assert "approval_ref: `approval-1`" in change_doc
    assert "policy_decision_ref: `policy-decision-1`" in change_doc
    assert "commit_sha: `abc123`" in change_doc
    assert f"patch_sha256: `{outs[0].patch_sha256}`" in change_doc
    assert "## Evidence" in change_doc
    assert "## Approval" in change_doc


def test_repo_gateway_recomputes_spoofed_patch_digest(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch)
    db = SpyDb()
    request = _request(patch_sha256="spoofed-digest")

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        SafePrReadyForCreationBody(
            request=request,
            summary="safe pr ready",
            risk="low",
            workspace_id="default",
        ),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].patch_sha256 == safe_pr_patch_sha256(request.patches)
    assert outs[0].patch_sha256 != "spoofed-digest"


def test_safe_pr_patch_digest_is_stable_after_wire_roundtrip() -> None:
    request = _request()
    wire_patches = [patch.to_body() for patch in request.patches]

    assert safe_pr_patch_sha256(wire_patches) == safe_pr_patch_sha256(request.patches)


def test_safe_pr_patch_digest_ignores_description_metadata() -> None:
    patch = SafePrFilePatch(
        path="deploy/app.yaml",
        content="apiVersion: apps/v1\nkind: Deployment\n",
        description="first explanation",
    )
    same_patch_different_description = SafePrFilePatch(
        path=patch.path,
        content=patch.content,
        description="updated explanation",
    )

    assert safe_pr_patch_sha256([patch]) == safe_pr_patch_sha256([same_patch_different_description])


def test_structured_image_patch_is_stable_after_wire_roundtrip() -> None:
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    request = _request(commit_sha=APPROVED_SHA, patches=[_structured_patch(source)])

    decoded = SafePrRequestedBody.from_body(request.to_body())
    plan = parse_image_patch_plan(decoded.patches[0].content)

    assert plan is not None
    assert plan.expected_base_sha == APPROVED_SHA
    assert plan.replacements[0].container_name == "checkout-api"
    assert safe_pr_patch_sha256(decoded.patches) == safe_pr_patch_sha256(request.patches)


def test_repo_gateway_logs_provider_steps_with_correlation(monkeypatch, caplog) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch)
    db = SpyDb()
    caplog.set_level(logging.INFO)

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(workflow_run_id="run-observable"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    contexts = [
        record.context
        for record in caplog.records
        if record.getMessage() in {"github_provider_started", "github_provider_response"}
        and isinstance(getattr(record, "context", None), dict)
    ]
    operations = {context["operation"] for context in contexts}
    assert "safe_pr.create" in operations
    assert "github.base_ref" in operations
    assert "github.ensure_branch" in operations
    assert "github.put_content" in operations
    assert "github.create_pr" in operations
    assert {context["correlation_id"] for context in contexts} == {"corr-1"}
    assert {context["event_id"] for context in contexts} == {"evt-1"}
    assert {context["repo_ref"] for context in contexts} == {"project/repo"}
    assert any(context.get("status_code") == 201 for context in contexts)


def test_repo_gateway_reads_github_token_from_token_ref(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setenv("GITHUB_TOKEN_REF", "GITHUB_TOKEN_FROM_REF")
    monkeypatch.setenv("GITHUB_TOKEN_FROM_REF", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    monkeypatch.setenv("SCM_BASE_BRANCH", "main")
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(), db=db)

    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls[0] == ("GET", "/repos/project/repo/git/ref/heads/main")
    assert db.called("save_pull_request")


def test_repo_gateway_uses_request_repo_ref_and_base_branch(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.delenv("SCM_REPO", raising=False)
    monkeypatch.setenv("SCM_BASE_BRANCH", "env-main")
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(repo_ref="org/checkout", base_branch="release-main"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls[:5] == [
        ("GET", "/repos/org/checkout/git/ref/heads/release-main"),
        ("POST", "/repos/org/checkout/git/refs"),
        ("PUT", f"/repos/org/checkout/contents/.gitops/safe-pr/{outs[0].workflow_run_id}.md"),
        ("PUT", "/repos/org/checkout/contents/deploy/app.yaml"),
        ("POST", "/repos/org/checkout/pulls"),
    ]
    assert db.called("save_pull_request")


def test_repo_gateway_preserves_opaque_legacy_template_content(monkeypatch) -> None:
    _github_env(monkeypatch)
    template = "{{ if .Values.enabled }}\nkind: Deployment\n{{ end }}\n"
    contents: list[dict[str, object]] = []
    repo = _load_with_transport(monkeypatch, contents=contents)

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(
            manifest_path="charts/templates/deployment.yaml",
            patches=[
                SafePrFilePatch(
                    path="charts/templates/deployment.yaml",
                    content=template,
                )
            ],
        ),
        db=SpyDb(),
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert base64.b64decode(str(contents[-1]["content"])).decode() == template


def test_repo_gateway_rejects_stale_expected_base_before_any_github_write(monkeypatch) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls, base_sha=NEW_BASE_SHA)
    ready, db, _ = _structured_case(source)

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        ready,
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert outs[0].details["exception_type"] == "RuntimeError"
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
    ]
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_structured_patch_not_matching_approved_diff(monkeypatch) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    ready, db, _ = _structured_case(source)
    db._returns["get_workflow_step_details"]["changes"][0]["old_desired"] = (
        "ghcr.io/project/checkout-api:tampered"
    )
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls, base_sha=APPROVED_SHA)

    outs = run_handler(repo.on_safe_pr_ready_for_creation, ready, db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_structured_repo_or_branch_not_matching_provenance(
    monkeypatch,
) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    ready, db, _ = _structured_case(source)
    db._returns["get_manifest_artifact_provenance"]["repo_ref"] = "other/fork"
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls, base_sha=APPROVED_SHA)

    outs = run_handler(repo.on_safe_pr_ready_for_creation, ready, db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_materializes_image_patch_from_exact_base_source(monkeypatch) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\n"
        "kind: Deployment\n"
        "metadata:\n"
        "  name: checkout-api\n"
        "spec:\n"
        "  template:\n"
        "    spec:\n"
        "      containers:\n"
        "        - name: checkout-api\n"
        '          image: "ghcr.io/project/checkout-api:v2" # keep this comment\n'
    )
    expected = source.replace("checkout-api:v2", "checkout-api:v1", 1)
    source_path = "/repos/project/repo/contents/deploy/app.yaml"
    calls: list[tuple[str, str]] = []
    contents: list[dict[str, object]] = []
    repo = _load_with_transport(
        monkeypatch,
        calls=calls,
        contents=contents,
        base_sha=APPROVED_SHA,
        source_contents={source_path: source},
    )
    ready, db, _ = _structured_case(source)

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        ready,
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
        ("GET", source_path),
        ("POST", "/repos/project/repo/git/refs"),
        ("PUT", f"/repos/project/repo/contents/.gitops/safe-pr/{outs[0].workflow_run_id}.md"),
        ("PUT", source_path),
        ("POST", "/repos/project/repo/pulls"),
    ]
    assert base64.b64decode(str(contents[-1]["content"])).decode() == expected
    assert "namespace:" not in expected


def test_repo_gateway_reuses_matching_structured_pr_after_base_advances(monkeypatch) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    ready, db, request = _structured_case(source)
    head_sha = "c" * 40
    manifest_api_path = "/repos/project/repo/contents/deploy/app.yaml"
    change_path = f".gitops/safe-pr/{request.workflow_run_id}.md"
    change_api_path = f"/repos/project/repo/contents/{change_path}"
    expected_manifest = source.replace("checkout-api:v2", "checkout-api:v1", 1)
    existing_pr = {
        "html_url": PR_HTML_URL,
        "title": request.title,
        "body": (f"{request.body}\n\n<!-- safe-pr-patch-sha256: {request.patch_sha256} -->"),
        "base": {"ref": "main"},
        "head": {"ref": f"gitops/{request.workflow_run_id}", "sha": head_sha},
    }
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(
        monkeypatch,
        calls=calls,
        base_sha=NEW_BASE_SHA,
        existing_pr=existing_pr,
        compare_results={
            f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}": {
                "status": "ahead",
                "merge_base_commit": {"sha": APPROVED_SHA},
                "files": [{"status": "modified", "filename": "README.md"}],
            },
            f"/repos/project/repo/compare/{APPROVED_SHA}...{head_sha}": {
                "status": "ahead",
                "merge_base_commit": {"sha": APPROVED_SHA},
                "files": [
                    {"status": "modified", "filename": "deploy/app.yaml"},
                    {"status": "added", "filename": change_path},
                ],
            },
        },
        ref_contents={
            (manifest_api_path, APPROVED_SHA): source,
            (manifest_api_path, head_sha): expected_manifest,
            (change_api_path, head_sha): _change_document_text(request),
        },
    )
    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        ready,
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].pr_url == PR_HTML_URL
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
        ("GET", f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}"),
        ("GET", f"/repos/project/repo/compare/{APPROVED_SHA}...{head_sha}"),
        ("GET", manifest_api_path),
        ("GET", manifest_api_path),
        ("GET", change_api_path),
    ]
    assert db.called("save_pull_request")


def test_repo_gateway_rejects_structured_head_branch_collision_before_content_write(
    monkeypatch,
) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    source_path = "/repos/project/repo/contents/deploy/app.yaml"
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(
        monkeypatch,
        calls=calls,
        branch_exists=True,
        base_sha=APPROVED_SHA,
        source_contents={source_path: source},
    )
    ready, db, _ = _structured_case(source)

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        ready,
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
        ("GET", source_path),
        ("POST", "/repos/project/repo/git/refs"),
    ]
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_existing_structured_pr_with_renamed_file(monkeypatch) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    ready, db, request = _structured_case(source)
    head_sha = "c" * 40
    existing_pr = {
        "html_url": PR_HTML_URL,
        "title": request.title,
        "body": f"{request.body}\n\n<!-- safe-pr-patch-sha256: {request.patch_sha256} -->",
        "base": {"ref": "main"},
        "head": {"ref": f"gitops/{request.workflow_run_id}", "sha": head_sha},
    }
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(
        monkeypatch,
        calls=calls,
        base_sha=NEW_BASE_SHA,
        existing_pr=existing_pr,
        compare_results={
            f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}": {
                "status": "ahead",
                "merge_base_commit": {"sha": APPROVED_SHA},
                "files": [{"status": "modified", "filename": "README.md"}],
            },
            f"/repos/project/repo/compare/{APPROVED_SHA}...{head_sha}": {
                "status": "ahead",
                "merge_base_commit": {"sha": APPROVED_SHA},
                "files": [
                    {
                        "status": "renamed",
                        "filename": "deploy/app.yaml",
                        "previous_filename": "deploy/unrelated.yaml",
                    },
                    {
                        "status": "added",
                        "filename": f".gitops/safe-pr/{request.workflow_run_id}.md",
                    },
                ],
            },
        },
    )

    outs = run_handler(repo.on_safe_pr_ready_for_creation, ready, db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
        ("GET", f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}"),
        ("GET", f"/repos/project/repo/compare/{APPROVED_SHA}...{head_sha}"),
    ]
    assert not db.called("save_pull_request")


@pytest.mark.parametrize(
    "base_files",
    [
        [{"status": "modified", "filename": "deploy/app.yaml"}],
        [{"status": "modified", "filename": f"docs/generated-{index}.md"} for index in range(300)],
    ],
    ids=["protected-path-changed", "compare-file-list-truncated"],
)
def test_repo_gateway_rejects_unsafe_or_truncated_base_advance(
    monkeypatch,
    base_files,
) -> None:
    _github_env(monkeypatch)
    source = (
        "apiVersion: apps/v1\nkind: Deployment\nmetadata: {name: checkout-api}\n"
        "spec: {template: {spec: {containers: [{name: checkout-api, "
        "image: 'ghcr.io/project/checkout-api:v2'}]}}}\n"
    )
    ready, db, request = _structured_case(source)
    head_sha = "c" * 40
    existing_pr = {
        "html_url": PR_HTML_URL,
        "title": request.title,
        "body": f"{request.body}\n\n<!-- safe-pr-patch-sha256: {request.patch_sha256} -->",
        "base": {"ref": "main"},
        "head": {"ref": f"gitops/{request.workflow_run_id}", "sha": head_sha},
    }
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(
        monkeypatch,
        calls=calls,
        base_sha=NEW_BASE_SHA,
        existing_pr=existing_pr,
        compare_results={
            f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}": {
                "status": "ahead",
                "merge_base_commit": {"sha": APPROVED_SHA},
                "files": base_files,
            }
        },
    )

    outs = run_handler(repo.on_safe_pr_ready_for_creation, ready, db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("GET", "/repos/project/repo/pulls"),
        ("GET", f"/repos/project/repo/compare/{APPROVED_SHA}...{NEW_BASE_SHA}"),
    ]
    assert not db.called("save_pull_request")


def test_repo_gateway_falls_back_to_env_base_branch(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    monkeypatch.setenv("SCM_BASE_BRANCH", "release-env")
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(), db=db)

    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls[0] == ("GET", "/repos/project/repo/git/ref/heads/release-env")
    assert db.called("save_pull_request")


def test_repo_gateway_rejects_unsafe_request_base_branch_before_github_write(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(base_branch="../main"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert outs[0].details["exception_type"] == "ValueError"
    assert "safe pr branch" in outs[0].details["error"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_unsafe_generated_head_branch_before_github_write(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(workflow_run_id="run@{production"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert outs[0].details["exception_type"] == "ValueError"
    assert "safe pr branch" in outs[0].details["error"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_invalid_request_repo_ref(monkeypatch) -> None:
    monkeypatch.setenv("GITHUB_TOKEN", "token-1")
    monkeypatch.delenv("SCM_REPO", raising=False)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(repo_ref="https://github.com/org/checkout"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert outs[0].manifest_path == "deploy/app.yaml"
    assert len(outs[0].patch_sha256) == 64
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_commits_manifest_patches(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    change_doc_path = f"/repos/project/repo/contents/.gitops/safe-pr/{outs[0].workflow_run_id}.md"
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("POST", "/repos/project/repo/git/refs"),
        ("PUT", change_doc_path),
        ("PUT", "/repos/project/repo/contents/deploy/app.yaml"),
        ("POST", "/repos/project/repo/pulls"),
    ]
    assert db.called("save_pull_request")


def test_repo_gateway_rejects_unsafe_patch_path_before_github_write(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(
            manifest_path="deploy/app.yaml",
            patches=[SafePrFilePatch(path="../secret.yaml", content="x")],
        ),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_space_prefixed_absolute_patch_path(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(
            manifest_path="deploy/app.yaml",
            patches=[SafePrFilePatch(path=" /secret.yaml", content="x")],
        ),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_is_idempotent_on_redelivery(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch, branch_exists=True, file_exists=True, pr_exists=True)
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(), db=db)

    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].pr_url == PR_HTML_URL
    assert db.called("save_pull_request")


def test_repo_gateway_emits_next_alert_after_pr_creation(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(next_alert=_alert()),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created", "alert.requested"]
    assert db.called("save_pull_request")


def test_repo_gateway_fails_per_request_without_github_credentials(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("SCM_REPO", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(), db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert len(outs[0].patch_sha256) == 64
    assert not db.called("save_pull_request")


def test_repo_gateway_does_not_emit_next_alert_when_pr_fails(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("SCM_REPO", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(next_alert=_alert()), db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert not db.called("save_pull_request")


def test_repo_gateway_total_deadline_fails_through_safe_pr_failed(monkeypatch) -> None:
    class SlowProvider:
        async def create_pull_request(self, request, ctx):  # noqa: ANN001
            await asyncio.sleep(0.05)
            return PR_HTML_URL

    _github_env(monkeypatch)
    monkeypatch.setenv("SCM_CREATE_PR_DEADLINE_SECONDS", "0.001")
    repo = load_service("gitops/scm-worker")
    monkeypatch.setattr(repo, "SCM_PROVIDER", SlowProvider())
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(next_alert=_alert()),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert outs[0].details["exception_type"] == "TimeoutError"
    assert "error" not in outs[0].details
    assert not db.called("save_pull_request")


def test_repo_gateway_emits_failed_event_on_github_error(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch, fail_pr_status=500)
    db = SpyDb()

    outs = run_handler(repo.on_safe_pr_ready_for_creation, _ready(), db=db)

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason_code == "provider_error"
    assert "error" not in outs[0].details
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_event_provider_mismatch(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_ready_for_creation,
        _ready(provider="gitlab"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_build_scm_provider_rejects_unknown_provider() -> None:
    repo = load_service("gitops/scm-worker")

    assert isinstance(repo.build_scm_provider("github"), repo.GithubScmProvider)
    try:
        repo.build_scm_provider("gitlab")
    except RuntimeError as exc:
        assert "SCM_PROVIDER" in str(exc)
    else:
        raise AssertionError("지원하지 않는 provider 는 RuntimeError 여야 함")
