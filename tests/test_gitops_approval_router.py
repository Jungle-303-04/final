from __future__ import annotations

import asyncio
from types import SimpleNamespace

from domains.gitops.router import grant_approval, reject_approval
from packages.contracts.gateway.requests import ApprovalDecisionRequest


class ApprovalDb:
    def __init__(self, allowed: bool = True) -> None:
        self.allowed = allowed
        self.access_calls: list[tuple[str, str, str, str, str]] = []

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
            "requested_role": "deployer",
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


class ApprovalEvents:
    def __init__(self) -> None:
        self.body: object | None = None
        self.actor: object | None = None

    async def accept_body(self, body: object, actor: object | None = None) -> object:
        self.body = body
        self.actor = actor
        return SimpleNamespace(event=SimpleNamespace(event_id="evt-1", correlation_id="corr-1"))


def current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("member",), workspace_id="workspace-1")


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
    assert db.access_calls == [("user-1", "workspace-1", "cluster", "cluster-1", "deploy")]
    assert events.body is not None
    assert events.body.__subject__ == "approval.granted"
    assert events.body.details["command_requested"]["action"] == "apply_manifest"
    assert events.body.details["command_requested"]["cluster_id"] == "cluster-1"


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
