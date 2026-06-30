from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import AlertRequestedBody, CommandRequestedBody, Diff


def test_alert_worker_dispatches_then_auto_deploys_after_gate() -> None:
    alert = load_service("alert/alert-worker")
    diff = Diff(
        resource="deployment/checkout-api",
        namespace="sandbox",
        desired_image="img:new",
        actual_image="img:old",
        risk="sandbox-only",
    )
    command = CommandRequestedBody(
        cluster_id="target-cluster-01",
        action="apply_manifest",
        namespace="sandbox",
        reason="safe sandbox gitops apply",
        diff=diff,
    )

    outs = run_handler(
        alert.on_alert_requested,
        AlertRequestedBody(
            cluster_id="target-cluster-01",
            namespace="sandbox",
            severity="info",
            message="pre-deploy check passed",
            reason="safe sandbox deploy",
            next_command=command,
        ),
    )

    assert subjects_of(outs) == ["alert.dispatched", "command.requested"]
    assert outs[1].action == "apply_manifest"
