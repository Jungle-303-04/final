from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.payloads import Diff, DiffAnalyzedPayload


def _analyzed(safe: bool) -> DiffAnalyzedPayload:
    diff = Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk="sandbox-only",
    )
    return DiffAnalyzedPayload(
        diff=diff, safe=safe, risk="sandbox-only", reason="r"
    )


def test_repo_gateway_opens_pr_when_safe() -> None:
    repo = load_service("repo-gateway-worker")
    db = SpyDb()
    safe = run_handler(repo.on_diff_analyzed, _analyzed(True), db=db)
    assert subjects_of(safe) == ["safe_pr.created"]
    assert db.called("save_pull_request")

    unsafe = run_handler(repo.on_diff_analyzed, _analyzed(False), db=SpyDb())
    assert unsafe == []
