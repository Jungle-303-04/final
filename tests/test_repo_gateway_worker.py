from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from domains.alert.events import AlertRequestedBody
from domains.scm.events import SafePrRequestedBody


def _alert() -> AlertRequestedBody:
    return AlertRequestedBody(
        cluster_id="cluster-1",
        namespace="sandbox",
        severity="info",
        message="ready",
        reason="safe pr created",
    )


def test_repo_gateway_creates_pr_from_request(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", "https://github.test.local/project/repo/pull")
    repo = load_service("gitops/scm-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].provider == "github"
    assert db.called("save_pull_request")


def test_repo_gateway_emits_next_alert_after_pr_creation(monkeypatch) -> None:
    monkeypatch.setenv("SCM_PR_URL_PREFIX", "https://github.test.local/project/repo/pull")
    repo = load_service("gitops/scm-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github", next_alert=_alert()),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created", "alert.requested"]
    assert db.called("save_pull_request")


def test_repo_gateway_fails_closed_without_pr_adapter(monkeypatch) -> None:
    monkeypatch.delenv("SCM_PR_URL_PREFIX", raising=False)
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
    monkeypatch.delenv("SCM_PR_URL_PREFIX", raising=False)
    repo = load_service("gitops/scm-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github", next_alert=_alert()),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert not db.called("save_pull_request")


def test_validate_pr_url_prefix_fails_fast_with_korean_message() -> None:
    # 부팅 시 검증되는 순수 함수 — 미설정/공백이면 명확한 한국어 메시지로 즉시 실패
    repo = load_service("gitops/scm-worker")

    for missing in ("", "   ", "/"):
        try:
            repo.validate_pr_url_prefix(missing)
        except RuntimeError as exc:
            assert "SCM_PR_URL_PREFIX" in str(exc)
            assert "미설정" in str(exc)
        else:
            raise AssertionError("빈 prefix 는 RuntimeError 여야 함")

    assert (
        repo.validate_pr_url_prefix("https://github.test.local/pr/")
        == "https://github.test.local/pr"
    )


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
        db=FailingDb(),
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "safe pr creation failed"
