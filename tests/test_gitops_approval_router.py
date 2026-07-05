from __future__ import annotations

import asyncio
from contextlib import contextmanager
from types import SimpleNamespace

from fastapi import HTTPException

from domains.gitops.router import grant_approval, reject_approval
from packages.contracts.gateway.requests import ApprovalDecisionRequest


class ApprovalDb:
    def __init__(self, allowed: bool = True, open_for_resolution: bool = True) -> None:
        self.allowed = allowed
        self.open_for_resolution = open_for_resolution
        self.access_calls: list[tuple[str, str, str, str, str]] = []
        self.resolutions: list[tuple[str, str, str, str, str]] = []

    def get_workflow_approval(self, approval_id: str, workspace_id: str) -> dict[str, object]:
        return {
            "approval_id": approval_id,
            "workflow_run_id": "workflow-1",
            "workspace_id": workspace_id,
            "application_id": "app-1",
            "binding_id": "binding-1",
            "environment": "prod",
            "status": "requested",
            "reason": "approval required",
            "requested_role": "release_operator",
            "details": {
                "diff": {
                    "resource": "deployment/checkout-api",
                    "namespace": "sandbox",
                    "desired_image": "img:new",
                    "actual_image": "img:old",
                    "risk": "sandbox-only",
                    "workspace_id": workspace_id,
                    "application_id": "app-1",
                    "workflow_run_id": "workflow-1",
                    "binding_id": "binding-1",
                    "environment": "prod",
                    "cluster_id": "cluster-1",
                }
            },
        }

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        self.access_calls.append((user_id, workspace_id, resource_type, resource_id, action))
        return self.allowed

    def resolve_workflow_approval_if_open(
        self,
        approval_id: str,
        workspace_id: str,
        status: str,
        decided_by: str,
        decision: str,
        details: dict[str, object],
    ) -> bool:
        self.resolutions.append((approval_id, workspace_id, status, decided_by, decision))
        return self.open_for_resolution


class ApprovalEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.actor: object | None = None

    async def accept_body(self, body: object, actor: object | None = None) -> object:
        self.body = body
        self.actor = actor
        return SimpleNamespace(event=SimpleNamespace(event_id="evt-1", correlation_id="corr-1"))


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="workspace-1")


def test_grant_approval_emits_granted_event_with_command_request() -> None:
    async def run() -> tuple[object, ApprovalDb, ApprovalEvents]:
        db = ApprovalDb()
        events = ApprovalEvents()
        response = await grant_approval(
            "approval-1",
            ApprovalDecisionRequest(reason="looks safe"),
            current_session(),
            db,
            events,
        )
        return response, db, events

    response, db, events = asyncio.run(run())

    assert response.accepted is True
    assert db.access_calls == [("user-1", "workspace-1", "cluster", "cluster-1", "deploy.run")]
    assert db.resolutions == [("approval-1", "workspace-1", "granted", "user-1", "granted")]
    assert events.body is not None
    assert events.body.__subject__ == "approval.granted"
    assert events.body.details["command_requested"]["action"] == "apply_manifest"
    assert events.body.details["command_requested"]["cluster_id"] == "cluster-1"
    assert events.body.details["command_requested"]["approval_ref"] == "approval-1"
    assert events.body.details["command_requested"]["policy_decision_ref"] == (
        "approval:approval-1:granted"
    )


def test_reject_approval_emits_rejected_event() -> None:
    async def run() -> ApprovalEvents:
        events = ApprovalEvents()
        await reject_approval(
            "approval-1",
            ApprovalDecisionRequest(reason="not safe"),
            current_session(),
            ApprovalDb(),
            events,
        )
        return events

    events = asyncio.run(run())

    assert events.body is not None
    assert events.body.__subject__ == "approval.rejected"
    assert events.body.reason == "not safe"


def test_grant_approval_conflicts_when_already_resolved() -> None:
    # 동시 grant 경합: 원자 UPDATE 가 0행이면 409 — 두 번째 요청은 이벤트를 발행하지 않음
    async def run() -> tuple[HTTPException, ApprovalDb, ApprovalEvents]:
        db = ApprovalDb(open_for_resolution=False)
        events = ApprovalEvents()
        try:
            await grant_approval(
                "approval-1",
                ApprovalDecisionRequest(reason="second click"),
                current_session(),
                db,
                events,
            )
        except HTTPException as exc:
            return exc, db, events
        raise AssertionError("이미 해결된 승인은 409 여야 함")

    exc, db, events = asyncio.run(run())

    assert exc.status_code == 409
    assert db.resolutions == [
        ("approval-1", "workspace-1", "granted", "user-1", "granted"),
    ]
    assert events.body is None  # 원자 갱신 실패 시 ApprovalGranted 미발행


def test_reject_approval_conflicts_when_already_resolved() -> None:
    async def run() -> tuple[HTTPException, ApprovalEvents]:
        events = ApprovalEvents()
        try:
            await reject_approval(
                "approval-1",
                ApprovalDecisionRequest(reason="late reject"),
                current_session(),
                ApprovalDb(open_for_resolution=False),
                events,
            )
        except HTTPException as exc:
            return exc, events
        raise AssertionError("이미 해결된 승인은 409 여야 함")

    exc, events = asyncio.run(run())

    assert exc.status_code == 409
    assert events.body is None  # 원자 갱신 실패 시 ApprovalRejected 미발행


class TransactionalApprovalDb(ApprovalDb):
    """unit_of_work 를 제공해 승인 해결과 이벤트 스테이징이 한 트랜잭션인지 기록함."""

    def __init__(self) -> None:
        super().__init__()
        self.uow_active = False
        self.resolved_in_uow: list[bool] = []

    @contextmanager
    def unit_of_work(self):
        self.uow_active = True
        try:
            yield self
        finally:
            self.uow_active = False

    def resolve_workflow_approval_if_open(self, *args: object, **kwargs: object) -> bool:
        self.resolved_in_uow.append(self.uow_active)
        return super().resolve_workflow_approval_if_open(*args, **kwargs)


class UowTrackingApprovalEvents(ApprovalEvents):
    def __init__(self, db: TransactionalApprovalDb) -> None:
        super().__init__()
        self.db = db
        self.accepted_in_uow: list[bool] = []

    async def accept_body(self, body: object, actor: object | None = None) -> object:
        self.accepted_in_uow.append(self.db.uow_active)
        return await super().accept_body(body, actor)


def test_grant_approval_wraps_resolution_and_event_in_single_transaction() -> None:
    # 승인 해결(원자 UPDATE)과 이벤트 스테이징이 하나의 unit_of_work 안에서 실행돼야 함
    # (이벤트 스테이징 실패 시 해결도 롤백 → '해결됐지만 이벤트 없는' 고아 승인 방지).
    async def run() -> tuple[TransactionalApprovalDb, UowTrackingApprovalEvents]:
        db = TransactionalApprovalDb()
        events = UowTrackingApprovalEvents(db)
        await grant_approval(
            "approval-1",
            ApprovalDecisionRequest(reason="looks safe"),
            current_session(),
            db,
            events,
        )
        return db, events

    db, events = asyncio.run(run())

    assert db.resolved_in_uow == [True]
    assert events.accepted_in_uow == [True]
    assert db.uow_active is False
