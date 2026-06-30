from __future__ import annotations

from conftest import SpyDb, load_service, run_handler, subjects_of

from packages.contracts.event_bus.bodies import ClusterEvidenceReceivedBody


def test_rca_subscriber_yields_typed_event_chain() -> None:
    rca = load_service("ai/rca")
    db = SpyDb()
    payload = ClusterEvidenceReceivedBody(
        cluster_id="target-cluster-01",
        kubernetes={"pods": []},
        metrics={"cpu": 0.8},
        logs=[{"line": "boom"}],
        traces={"slow_span": "GET /x"},
    )
    outs = run_handler(rca.on_cluster_evidence, payload, db=db, correlation_id="corr-9")
    assert subjects_of(outs) == [
        "incident.detected",
        "evidence.built",
        "rca.scenarios.evaluated",
        "rca.completed",
        "safe_pr.policy_decided",
        "safe_pr.requested",
    ]
    assert outs[0].detected is True
    assert outs[4].route == "draft_pr"
    assert db.called("save_evidence")
    assert db.called("save_rca_report")
    assert not db.called("save_pull_request")


def test_rca_subscriber_stops_when_incident_flag_is_not_set() -> None:
    rca = load_service("ai/rca")
    db = SpyDb()
    payload = ClusterEvidenceReceivedBody(
        cluster_id="target-cluster-01",
        kubernetes={},
        metrics={},
        logs=[],
        traces={},
    )
    outs = run_handler(rca.on_cluster_evidence, payload, db=db, correlation_id="corr-10")
    assert subjects_of(outs) == ["incident.detected", "evidence.built", "rca.action_required"]
    assert outs[0].detected is False
    assert db.called("save_evidence")
    assert not db.called("save_rca_report")
