from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import SafePrRequestedBody


def test_repo_gateway_creates_pr_from_request(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", "https://github.test.local/project/repo/pull")
    repo = load_service("gitops/scm-worker")
    db = SpyDb(latest_github_token_ref="token-ref-1")  # 자격증명 보유
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].provider == "github"
    assert outs[0].token_ref == "token-ref-1"
    assert db.called("save_pull_request")


def test_repo_gateway_fails_closed_without_credential() -> None:
    repo = load_service("gitops/scm-worker")
    db = SpyDb()  # 자격증명 없음(latest_github_token_ref → None)
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]  # PR 생성 거부
    assert outs[0].reason == "github credential not available"
    assert not db.called("save_pull_request")  # 저장도 안 함


def test_repo_gateway_fails_closed_without_pr_adapter(monkeypatch) -> None:
    monkeypatch.delenv("SCM_PR_URL_PREFIX", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb(latest_github_token_ref="token-ref-1")
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "safe pr creation failed"
    assert not db.called("save_pull_request")


class FailingDb(SpyDb):
    def save_pull_request(self, *args: object) -> None:
        self.calls.append(("save_pull_request", args))
        raise RuntimeError("github unavailable")


def test_repo_gateway_emits_failed_event_on_provider_error(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", "https://github.test.local/project/repo/pull")
    repo = load_service("gitops/scm-worker")
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=FailingDb(latest_github_token_ref="token-ref-1"),  # 자격증명은 있고 provider 가 실패
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "safe pr creation failed"
