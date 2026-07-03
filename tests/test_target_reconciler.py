from __future__ import annotations

from conftest import load_service, run_handler, subjects_of

from domains.target.events import (
    ClusterDesiredStateChangedBody,
    ClusterReconcileRequestedBody,
    TargetDesiredComponent,
)
from domains.target.reconciler import (
    ActualStateSnapshot,
    TargetReconciler,
    desired_state_version,
)
from packages.contracts.target import TargetReconcileStatus


class TargetReconcileDb:
    def __init__(self) -> None:
        self.rows = [
            {
                "component": "cluster-agent",
                "namespace": "target",
                "version": "service:v1",
                "spec": {"deployment": "cluster-agent"},
            }
        ]
        self.records: list[dict[str, object]] = []

    async def list_target_desired_states(self, _workspace_id: str, _cluster_id: str):
        return self.rows

    async def record_target_reconcile_result(self, payload: dict[str, object]):
        self.records.append(payload)
        return payload


def desired_component() -> TargetDesiredComponent:
    return TargetDesiredComponent(
        component="cluster-agent",
        namespace="target",
        version="service:v1",
        spec={"deployment": "cluster-agent"},
    )


def test_target_reconciler_reports_in_sync() -> None:
    component = desired_component()
    decision = TargetReconciler().evaluate(
        [component],
        ActualStateSnapshot(
            components={
                "cluster-agent": {
                    "version": "service:v1",
                    "spec": {"deployment": "cluster-agent"},
                }
            }
        ),
    )

    assert decision.status == TargetReconcileStatus.IN_SYNC.value
    assert decision.drifted is False
    assert decision.drifts == []


def test_target_reconciler_reports_missing_component_drift() -> None:
    component = desired_component()
    decision = TargetReconciler().evaluate([component], ActualStateSnapshot())

    assert decision.status == TargetReconcileStatus.DRIFTED.value
    assert decision.drifted is True
    assert decision.drifts[0].component == "cluster-agent"


def test_target_reconcile_worker_requests_reconcile_after_desired_state_change() -> None:
    worker = load_service("target/reconcile-worker")
    component = desired_component()
    body = ClusterDesiredStateChangedBody(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        desired_state_version=desired_state_version([component]),
        components=[component],
        reason="target registered",
        requested_by="user-1",
    )

    outs = run_handler(worker.on_desired_state_changed, body, db=TargetReconcileDb())

    assert subjects_of(outs) == ["cluster.reconcile.requested"]
    assert outs[0].cluster_id == "cluster-1"


def test_target_reconcile_worker_records_pending_without_actual_state() -> None:
    worker = load_service("target/reconcile-worker")
    db = TargetReconcileDb()
    body = ClusterReconcileRequestedBody(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        desired_state_version="v1",
        reason="target registered",
    )

    outs = run_handler(worker.on_reconcile_requested, body, db=db)

    assert subjects_of(outs) == ["cluster.reconcile.started", "cluster.reconcile.completed"]
    assert outs[1].status == TargetReconcileStatus.REQUESTED.value
    assert db.records[0]["status"] == TargetReconcileStatus.REQUESTED.value


def test_target_reconcile_worker_emits_drift_when_actual_differs() -> None:
    worker = load_service("target/reconcile-worker")
    db = TargetReconcileDb()
    body = ClusterReconcileRequestedBody(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        desired_state_version="v1",
        reason="manual check",
        actual_state={
            "components": {
                "cluster-agent": {
                    "version": "service:v0",
                    "spec": {"deployment": "cluster-agent"},
                }
            }
        },
    )

    outs = run_handler(worker.on_reconcile_requested, body, db=db)

    assert subjects_of(outs) == [
        "cluster.reconcile.started",
        "cluster.drift.detected",
        "cluster.reconcile.completed",
    ]
    assert outs[1].drifts[0].reason == "component version differs"
    assert db.records[0]["drifted"] is True
