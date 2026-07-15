from __future__ import annotations

from conftest import load_service, run_handler

from domains.rca.events import (
    IncidentRecord,
    RcaCompletedBody,
    RcaReportDetail,
    RecoveryActionSelectedBody,
    RecoveryPlannedBody,
    RecoverySelectionRequestedBody,
)
from services.ai.agent.recovery.engine import RecoveryPlanner
from services.ai.agent.recovery.select import RecoverySelector


class RecoveryPlanStoreSpy:
    def __init__(self) -> None:
        self.records: list[dict[str, object]] = []

    async def upsert_recovery_plan(
        self,
        correlation_id: str,
        workspace_id: str,
        plan: dict[str, object],
        **state: object,
    ) -> None:
        self.records.append(
            {
                "correlation_id": correlation_id,
                "workspace_id": workspace_id,
                "plan": plan,
                **state,
            }
        )


def completed_oom(namespace: str) -> RcaCompletedBody:
    return RcaCompletedBody(
        root_cause="oom_killed",
        action="restart workload",
        evidence_ref=f"object://evidence/{namespace}.json",
        workspace_id="workspace-1",
        incident=IncidentRecord(
            incident_id=f"incident-{namespace}",
            cluster_id="cluster-1",
            resource_kind="Deployment",
            resource_name="game-api",
            namespace=namespace,
            symptom="CrashLoopBackOff",
            severity="critical",
            first_seen_at="2026-07-15T02:00:00+00:00",
            summary="game-api was OOMKilled",
            workspace_id="workspace-1",
        ),
        rca_detail=RcaReportDetail(
            root_cause="oom_killed",
            confidence=1.0,
            selected_candidate_id="oom_killed",
            supporting_evidence=["kubernetes:cluster_resource_state"],
            missing_evidence=[],
            reason="Container terminated with OOMKilled and exit code 137.",
        ),
    )


def planned_oom(namespace: str) -> RecoveryPlannedBody:
    planned = RecoveryPlanner().plan_body(completed_oom(namespace))
    assert isinstance(planned, RecoveryPlannedBody)
    assert planned.plan is not None
    assert planned.plan.candidates[0].draft.action_type == "rollout_restart"
    return planned


def test_sandbox_rollout_restart_remains_auto_selected() -> None:
    planned = planned_oom("sandbox")

    assert planned.plan is not None
    assert planned.plan.selection_required is False
    assert planned.plan.candidates[0].approval_required is False
    selected = RecoverySelector().select_body(planned)
    assert isinstance(selected, RecoveryActionSelectedBody)
    assert selected.auto_selected is True


def test_non_sandbox_rollout_restart_requires_operator_selection() -> None:
    planned = planned_oom("color-turf")

    assert planned.plan is not None
    assert planned.plan.selection_required is True
    assert planned.plan.candidates[0].approval_required is True
    selected = RecoverySelector().select_body(planned)
    assert isinstance(selected, RecoverySelectionRequestedBody)
    assert "승인 필요한 command action" in selected.reason


def test_select_worker_persists_auto_selected_plan_for_detail_read_model() -> None:
    planned = planned_oom("sandbox")
    store = RecoveryPlanStoreSpy()
    worker = load_service("ai/select-worker")

    events = run_handler(
        worker.on_recovery_planned,
        planned,
        db=store,
        correlation_id="corr-auto",
    )

    assert isinstance(events[0], RecoveryActionSelectedBody)
    assert store.records == [
        {
            "correlation_id": "corr-auto",
            "workspace_id": "workspace-1",
            "plan": planned.plan.to_body(),
            "status": "selected",
            "selected_action_id": events[0].selected.action_id,
            "selected_by": "agent-select",
        }
    ]


def test_select_worker_persists_operator_selection_plan_for_detail_read_model() -> None:
    planned = planned_oom("color-turf")
    store = RecoveryPlanStoreSpy()
    worker = load_service("ai/select-worker")

    events = run_handler(
        worker.on_recovery_planned,
        planned,
        db=store,
        correlation_id="corr-approval",
    )

    assert isinstance(events[0], RecoverySelectionRequestedBody)
    assert store.records == [
        {
            "correlation_id": "corr-approval",
            "workspace_id": "workspace-1",
            "plan": planned.plan.to_body(),
            "status": "selection_requested",
        }
    ]
