from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.rca import repository as rca_repository
from domains.rca import router as rca_router
from domains.rca.events import (
    HealingActionDraft,
    RecoveryActionCandidate,
    RecoveryActionSelectedBody,
    RecoveryPlan,
)
from domains.rca.router import recovery_plan_by_correlation
from packages.contracts.gateway import requests as gateway_requests
from packages.contracts.gateway import routes as gateway_routes


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


class RecoverySelectionDb(RecoveryRouterDb):
    def __init__(
        self,
        *,
        has_access: bool = True,
        row: dict[str, object] | None = None,
    ) -> None:
        super().__init__(has_access=has_access, row=row)
        self.approvals: list[dict[str, object]] = []

    def select_recovery_plan_action_if_open(
        self,
        plan_id: str,
        workspace_id: str,
        action_id: str,
        selected_by: str,
    ) -> dict[str, object] | None:
        self.calls.append(("select", plan_id, workspace_id, action_id, selected_by))
        if self.row is None or self.row["status"] != "selection_requested":
            return None
        self.row["status"] = "selected"
        self.row["selected_action_id"] = action_id
        self.row["selected_by"] = selected_by
        return {
            "payload": self.row["payload"],
            "correlation_id": self.row["correlation_id"],
        }

    def request_workflow_approval(self, payload: dict[str, object]) -> None:
        self.approvals.append(payload)


class RecoverySelectionEvents:
    def __init__(self) -> None:
        self.bodies: list[RecoveryActionSelectedBody] = []

    async def accept_body(
        self,
        body: RecoveryActionSelectedBody,
        *,
        correlation_id: str,
        actor: object,
    ) -> SimpleNamespace:
        self.bodies.append(body)
        return SimpleNamespace(
            event=SimpleNamespace(event_id="evt-selected-1", correlation_id=correlation_id)
        )


def _object_id_plan() -> RecoveryPlan:
    evidence_ref = "object://evidence/corr-object-id.json"
    recommended_action_id = f"{evidence_ref}:image_tag_fix"
    return RecoveryPlan(
        plan_id=f"recovery:{evidence_ref}",
        incident_id="corr-object-id",
        evidence_ref=evidence_ref,
        summary="image pull recovery",
        target={"workspace_id": "workspace-1", "cluster_id": "cluster-1"},
        recommended_action_id=recommended_action_id,
        execution_route="draft_pr",
        selection_required=True,
        candidates=[
            _candidate(recommended_action_id, title="Fix image tag", rank=1),
            _candidate(f"{evidence_ref}:manual_analysis", title="Manual analysis", rank=2),
        ],
    )


def _selection_row(plan: RecoveryPlan, *, status: str = "selection_requested") -> dict[str, object]:
    return {
        "plan_id": plan.plan_id,
        "workspace_id": "workspace-1",
        "correlation_id": "corr-object-id",
        "incident_id": plan.incident_id,
        "evidence_ref": plan.evidence_ref,
        "status": status,
        "selected_action_id": None,
        "selected_by": None,
        "payload": plan.to_body(),
    }


def _selection_request(**values: object) -> object:
    request_type = gateway_requests.RecoveryActionSelectByCorrelationRequest
    return request_type(**values)


async def _select_by_correlation(
    correlation_id: str,
    payload: object,
    db: RecoverySelectionDb,
    events: RecoverySelectionEvents,
) -> object:
    endpoint = rca_router.select_recovery_action_by_correlation
    return await endpoint(
        correlation_id,
        payload,
        current=_current(),
        db=db,
        events=events,
    )


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
        assert (
            "can_access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-1",
            "rca.read",
        ) in db.calls

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


def test_recovery_selection_by_correlation_route_keeps_ids_out_of_path() -> None:
    assert (
        gateway_routes.RCA_RECOVERY_ACTION_SELECT_BY_CORRELATION_PATH
        == "/rca/recovery-plans/by-correlation/{correlation_id}/actions/select"
    )


def test_recovery_selection_atomic_update_only_accepts_selection_requested() -> None:
    assert rca_repository.OPEN_RECOVERY_PLAN_STATUSES == (
        rca_repository.RECOVERY_PLAN_STATUS_SELECTION_REQUESTED,
    )


def test_select_recovery_action_by_correlation_accepts_object_ids_in_json() -> None:
    plan = _object_id_plan()
    selected_action_id = plan.candidates[1].action_id
    db = RecoverySelectionDb(row=_selection_row(plan))
    events = RecoverySelectionEvents()
    payload = _selection_request(
        expected_plan_id=plan.plan_id,
        action_id=selected_action_id,
        reason="operator chose manual analysis",
    )

    response = asyncio.run(_select_by_correlation("corr-object-id", payload, db, events))

    assert response.accepted is True
    assert response.correlation_id == "corr-object-id"
    assert ("get", "corr-object-id", "workspace-1") in db.calls
    assert (
        "can_access",
        "user-1",
        "workspace-1",
        "cluster",
        "cluster-1",
        "deploy.run",
    ) in db.calls
    assert (
        "select",
        plan.plan_id,
        "workspace-1",
        selected_action_id,
        "user-1",
    ) in db.calls
    assert len(db.approvals) == 1
    assert db.approvals[0]["details"]["recovery_plan_id"] == plan.plan_id
    assert db.approvals[0]["details"]["recovery_action_id"] == selected_action_id
    assert len(events.bodies) == 1
    assert events.bodies[0].selected.action_id == selected_action_id
    assert events.bodies[0].reason == "operator chose manual analysis"


def test_select_recovery_action_defaults_to_recommended_candidate() -> None:
    plan = _object_id_plan()
    db = RecoverySelectionDb(row=_selection_row(plan))
    events = RecoverySelectionEvents()
    payload = _selection_request(
        expected_plan_id=plan.plan_id,
        reason="accept recommendation",
    )

    asyncio.run(_select_by_correlation("corr-object-id", payload, db, events))

    assert (
        "select",
        plan.plan_id,
        "workspace-1",
        plan.recommended_action_id,
        "user-1",
    ) in db.calls
    assert events.bodies[0].selected.action_id == plan.recommended_action_id


def test_select_recovery_action_rejects_stale_expected_plan() -> None:
    plan = _object_id_plan()
    db = RecoverySelectionDb(row=_selection_row(plan))
    events = RecoverySelectionEvents()
    payload = _selection_request(
        expected_plan_id="recovery:object://evidence/stale.json",
        action_id=plan.recommended_action_id,
    )

    async def run() -> HTTPException:
        try:
            await _select_by_correlation("corr-object-id", payload, db, events)
        except HTTPException as exc:
            return exc
        raise AssertionError("stale expected_plan_id must not select a newer plan")

    exc = asyncio.run(run())

    assert exc.status_code == 409
    assert not [call for call in db.calls if call[0] == "select"]
    assert db.approvals == []
    assert events.bodies == []


def test_select_recovery_action_requires_deploy_access_in_current_workspace() -> None:
    plan = _object_id_plan()
    db = RecoverySelectionDb(has_access=False, row=_selection_row(plan))
    events = RecoverySelectionEvents()
    payload = _selection_request(expected_plan_id=plan.plan_id)

    async def run() -> HTTPException:
        try:
            await _select_by_correlation("corr-object-id", payload, db, events)
        except HTTPException as exc:
            return exc
        raise AssertionError("selection without deploy.run must be forbidden")

    exc = asyncio.run(run())

    assert exc.status_code == 403
    assert ("get", "corr-object-id", "workspace-1") in db.calls
    assert not [call for call in db.calls if call[0] == "select"]
    assert db.approvals == []
    assert events.bodies == []


def test_select_recovery_action_only_transitions_selection_requested_once() -> None:
    plan = _object_id_plan()
    db = RecoverySelectionDb(row=_selection_row(plan))
    events = RecoverySelectionEvents()
    payload = _selection_request(
        expected_plan_id=plan.plan_id,
        action_id=plan.recommended_action_id,
    )

    async def run() -> HTTPException:
        await _select_by_correlation("corr-object-id", payload, db, events)
        try:
            await _select_by_correlation("corr-object-id", payload, db, events)
        except HTTPException as exc:
            return exc
        raise AssertionError("repeated selection must conflict")

    exc = asyncio.run(run())

    assert exc.status_code == 409
    assert db.row is not None
    assert db.row["status"] == "selected"
    assert len(db.approvals) == 1
    assert len(events.bodies) == 1
