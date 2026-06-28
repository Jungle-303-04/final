from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import DesiredDiffBody, Diff


def _diff(risk: str) -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk=risk,
    )


def test_safe_diff_requests_pr() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    safe = run_handler(analyze.on_desired_diff, DesiredDiffBody(diff=_diff("sandbox-only")))
    assert subjects_of(safe) == ["diff.analyzed", "safe_pr.requested"]
    assert safe[0].safe is True


def test_unsafe_diff_skips_pr() -> None:
    analyze = load_service("gitops/diff-analyze-worker")
    unsafe = run_handler(analyze.on_desired_diff, DesiredDiffBody(diff=_diff("production")))
    assert subjects_of(unsafe) == ["diff.analyzed"]
    assert unsafe[0].safe is False
