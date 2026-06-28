from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.payloads import SafePrRequestedPayload


def test_repo_gateway_creates_pr_from_request() -> None:
    repo = load_service("repo-gateway-worker")
    db = SpyDb()
    outs = run_handler(
        repo.on_safe_pr_requested,
        SafePrRequestedPayload(title="t", body="b", provider="github"),
        db=db,
    )
    assert subjects_of(outs) == ["safe_pr.created"]
    assert outs[0].provider == "github"
    assert db.called("save_pull_request")
