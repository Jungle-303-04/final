from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import ClusterEvidenceReceived


def test_rca_subscriber_yields_typed_event_chain() -> None:
    rca = load_service("rca-worker")
    db = SpyDb()
    payload = ClusterEvidenceReceived(
        cluster_id="target-cluster-01",
        kubernetes={"pods": []},
        metrics={"cpu": 0.8},
        logs=[{"line": "boom"}],
        traces={"slow_span": "GET /x"},
        correlation_id="corr-9",
    )
    outs = run_handler(rca.on_cluster_evidence, payload, db=db, correlation_id="corr-9")
    assert subjects_of(outs) == [
        "evidence.built",
        "rca.completed",
        "safe_pr.requested",
    ]
    assert db.called("save_evidence")
    assert db.called("save_rca_report")
    assert not db.called("save_pull_request")
