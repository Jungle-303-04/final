from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import SafePrRequestedBody


def test_repo_gateway_creates_pr_from_request() -> None:
    repo = load_service("gitops/repo-gateway-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].provider == "github"
    assert db.called("save_pull_request")


class FailingDb(SpyDb):
    def save_pull_request(self, *args: object) -> None:
        self.calls.append(("save_pull_request", args))
        raise RuntimeError("github unavailable")


def test_repo_gateway_emits_failed_event_on_provider_error() -> None:
    repo = load_service("gitops/repo-gateway-worker")
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedBody(title="t", body="b", provider="github"),
        db=FailingDb(),
    )
    assert subjects_of(outs) == ["safe_pr.failed"]
    assert outs[0].reason == "github unavailable"
