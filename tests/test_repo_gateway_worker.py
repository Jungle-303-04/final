from __future__ import annotations

from conftest import SpyDb, github_scm_transport, load_service, run_handler, subjects_of

from domains.alert.events import AlertRequestedBody
from domains.scm.events import SafePrFilePatch, SafePrRequestedBody

PR_HTML_URL = "https://github.test.local/project/repo/pull/7"


def _alert() -> AlertRequestedBody:
    return AlertRequestedBody(
        cluster_id="cluster-1",
        namespace="sandbox",
        severity="info",
        message="ready",
        reason="safe pr created",
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


def test_repo_gateway_creates_pr_from_request(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].pr_url == PR_HTML_URL
    assert outs[0].provider == "github"
    assert outs[0].mode == "github_rest"
    assert db.called("save_pull_request")
    # base ref 조회 → 브랜치 생성 → 변경 문서 커밋 → PR 생성 순으로 호출됨
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("POST", "/repos/project/repo/git/refs"),
        ("PUT", "/repos/project/repo/contents/.gitops/safe-pr/workflow-default.md"),
        ("POST", "/repos/project/repo/pulls"),
    ]


def test_repo_gateway_reads_github_token_from_token_ref(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.setenv("GITHUB_TOKEN_REF", "GITHUB_TOKEN_FROM_REF")
    monkeypatch.setenv("GITHUB_TOKEN_FROM_REF", "token-1")
    monkeypatch.setenv("SCM_REPO", "project/repo")
    monkeypatch.setenv("SCM_BASE_BRANCH", "main")
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls[0] == ("GET", "/repos/project/repo/git/ref/heads/main")
    assert db.called("save_pull_request")


def test_repo_gateway_commits_manifest_patches(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(
            title="t",
            body="b",
            provider="github",
            manifest_path="deploy/app.yaml",
            patches=[
                SafePrFilePatch(
                    path="deploy/app.yaml",
                    content="apiVersion: apps/v1\nkind: Deployment\n",
                    description="rendered Kubernetes manifest",
                )
            ],
        ),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert calls == [
        ("GET", "/repos/project/repo/git/ref/heads/main"),
        ("POST", "/repos/project/repo/git/refs"),
        ("PUT", "/repos/project/repo/contents/.gitops/safe-pr/workflow-default.md"),
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
        repo.on_safe_pr_requested,
        SafePrRequestedBody(
            title="t",
            body="b",
            provider="github",
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
        repo.on_safe_pr_requested,
        SafePrRequestedBody(
            title="t",
            body="b",
            provider="github",
            manifest_path="deploy/app.yaml",
            patches=[SafePrFilePatch(path=" /secret.yaml", content="x")],
        ),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_repo_gateway_is_idempotent_on_redelivery(monkeypatch) -> None:
    # 브랜치/파일/PR 이 이미 있어도(422) 기존 open PR URL 로 safe_pr.created 를 냄
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch, branch_exists=True, file_exists=True, pr_exists=True)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].pr_url == PR_HTML_URL
    assert db.called("save_pull_request")


def test_repo_gateway_emits_next_alert_after_pr_creation(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github", next_alert=_alert()),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created", "alert.requested"]
    assert db.called("save_pull_request")


def test_repo_gateway_fails_per_request_without_github_credentials(monkeypatch) -> None:
    # 자격 증명 부재는 부팅 실패가 아니라 요청 시점 safe_pr.failed — 워커는 뜸
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("SCM_REPO", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "safe pr creation failed"
    assert not db.called("save_pull_request")


def test_repo_gateway_does_not_emit_next_alert_when_pr_fails(monkeypatch) -> None:
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    monkeypatch.delenv("SCM_REPO", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github", next_alert=_alert()),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert not db.called("save_pull_request")


def test_repo_gateway_emits_failed_event_on_github_error(monkeypatch) -> None:
    _github_env(monkeypatch)
    repo = _load_with_transport(monkeypatch, fail_pr_status=500)
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "safe pr creation failed"
    assert not db.called("save_pull_request")


def test_repo_gateway_rejects_event_provider_mismatch(monkeypatch) -> None:
    _github_env(monkeypatch)
    calls: list[tuple[str, str]] = []
    repo = _load_with_transport(monkeypatch, calls=calls)
    db = SpyDb()

    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="gitlab"),
        db=db,
    )

    assert subjects_of(outs) == ["safe_pr.failed"]
    assert calls == []
    assert not db.called("save_pull_request")


def test_build_scm_provider_rejects_unknown_provider() -> None:
    # provider 이름 오설정만 부팅 fail-fast(자격 증명은 요청 시점 실패)
    repo = load_service("gitops/scm-worker")

    assert isinstance(repo.build_scm_provider("github"), repo.GithubScmProvider)
    try:
        repo.build_scm_provider("gitlab")
    except RuntimeError as exc:
        assert "SCM_PROVIDER" in str(exc)
    else:
        raise AssertionError("지원하지 않는 provider 는 RuntimeError 여야 함")
