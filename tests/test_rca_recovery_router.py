from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.rca.events import HealingActionDraft, RecoveryActionCandidate, RecoveryPlan
from domains.rca.router import recovery_plan_by_correlation


def _current() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="workspace-1")


def _candidate(action_id: str, *, title: str, rank: int) -> RecoveryActionCandidate:
    return RecoveryActionCandidate(
        action_id=action_id,
        title=title,
        description=f"{title} description",
        draft=HealingActionDraft(
            action_type="kubectl",
            namespace="sandbox",
            resource_kind="deployment",
            resource_name="checkout-api",
            reason="recover failed rollout",
            risk_level="medium",
            dry_run=True,
            source_evidence=["evidence://corr-1"],
            params={},
        ),
        route="kubectl",
        rank=rank,
        score=1.0 / rank,
        risk_level="medium",
        blast_radius="deployment/checkout-api",
        approval_required=True,
        prerequisites=["deployment exists"],
        validation_checks=["rollout status"],
        rollback_plan="undo rollout",
        evidence_refs=["evidence://corr-1"],
    )


def _plan() -> RecoveryPlan:
    return RecoveryPlan(
        plan_id="plan-1",
        incident_id="incident-1",
        evidence_ref="evidence://corr-1",
        summary="checkout-api rollout recovery",
        target={"workspace_id": "workspace-1", "cluster_id": "cluster-1"},
        recommended_action_id="restart",
        execution_route="manual_selection",
        selection_required=True,
        candidates=[
            _candidate("restart", title="Restart deployment", rank=1),
            _candidate("safe-pr", title="Open Safe PR", rank=2),
        ],
    )


class RecoveryRouterDb:
    def __init__(self, *, has_access: bool = True, row: dict[str, object] | None = None) -> None:
        self.has_access = has_access
        self.row = row
        self.calls: list[tuple[object, ...]] = []

    def get_recovery_plan_by_correlation(
        self, correlation_id: str, workspace_id: str
    ) -> dict[str, object] | None:
        self.calls.append(("get", correlation_id, workspace_id))
        return self.row

    def can_access(
        self,
        user_id: str,
        organization_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.calls.append(
            ("can_access", user_id, organization_id, resource_type, resource_id, permission)
        )
        return self.has_access


def test_recovery_plan_by_correlation_returns_selected_action_status() -> None:
    plan = _plan()
    db = RecoveryRouterDb(
        row={
            "plan_id": plan.plan_id,
            "workspace_id": "workspace-1",
            "correlation_id": "corr-1",
            "incident_id": plan.incident_id,
            "evidence_ref": plan.evidence_ref,
            "status": "selected",
            "selected_action_id": "safe-pr",
            "selected_by": "user-2",
            "payload": plan.to_body(),
        }
    )

    async def run() -> None:
        response = await recovery_plan_by_correlation(
            "corr-1",
            current=_current(),
            db=db,
        )

        assert response.plan_id == "plan-1"
        assert response.status == "selected"
        assert response.selected_action_id == "safe-pr"
        assert response.selected_action is not None
        assert response.selected_action.title == "Open Safe PR"
        assert response.candidates[0].action_id == "restart"
        assert ("can_access", "user-1", "workspace-1", "cluster", "cluster-1", "rca.read") in db.calls

    asyncio.run(run())


def test_recovery_plan_by_correlation_requires_cluster_read_access() -> None:
    plan = _plan()
    db = RecoveryRouterDb(
        has_access=False,
        row={
            "plan_id": plan.plan_id,
            "workspace_id": "workspace-1",
            "correlation_id": "corr-1",
            "incident_id": plan.incident_id,
            "evidence_ref": plan.evidence_ref,
            "status": "selection_requested",
            "selected_action_id": None,
            "selected_by": None,
            "payload": plan.to_body(),
        },
    )

    async def run() -> None:
        try:
            await recovery_plan_by_correlation("corr-1", current=_current(), db=db)
        except HTTPException as exc:
            assert exc.status_code == 403
        else:  # pragma: no cover - assertion guard
            raise AssertionError("expected forbidden recovery plan read")

    asyncio.run(run())


def test_recovery_plan_by_correlation_returns_404_when_missing() -> None:
    db = RecoveryRouterDb(row=None)

    async def run() -> None:
        try:
            await recovery_plan_by_correlation("missing", current=_current(), db=db)
        except HTTPException as exc:
            assert exc.status_code == 404
        else:  # pragma: no cover - assertion guard
            raise AssertionError("expected missing recovery plan")

    asyncio.run(run())
