from __future__ import annotations

import asyncio
import base64
import logging

from conftest import SpyDb, github_scm_transport, load_service, run_handler, subjects_of

from domains.alert.events import AlertRequestedBody
from domains.scm.events import SafePrFilePatch, SafePrReadyForCreationBody, SafePrRequestedBody
from domains.scm.pipeline import safe_pr_patch_sha256

PR_HTML_URL = "https://github.test.local/project/repo/pull/7"


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
