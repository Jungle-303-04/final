from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.payloads import DesiredDiffPayload, Diff


def _diff(risk: str) -> Diff:
    return Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk=risk,
    )


def test_analyze_marks_sandbox_safe() -> None:
    analyze = load_service("diff-analyze-worker")
    safe = run_handler(
        analyze.on_desired_diff, DesiredDiffPayload(diff=_diff("sandbox-only"))
    )
    assert subjects_of(safe) == ["diff.analyzed"]
    assert safe[0].safe is True

    unsafe = run_handler(
        analyze.on_desired_diff, DesiredDiffPayload(diff=_diff("production"))
    )
    assert unsafe[0].safe is False
