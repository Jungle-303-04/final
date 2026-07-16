"""dashboard API 권한 필터와 응답 DTO 검증."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.dashboard.router import rca_incident, rca_issues, rca_timeline


def _current_session() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-1", roles=("user",), workspace_id="workspace-1")


def _timeline_row(cluster_id: str = "cluster-1") -> dict[str, object]:
    return {
        "workspace_id": "workspace-1",
        "correlation_id": "corr-1",
        "cluster_id": cluster_id,
        "incident_id": "incident-1",
        "evidence_ref": "evidence://cluster-1/incident-1",
        "current_subject": "rca.completed",
        "status": "rca_completed",
        "root_cause": "image_pull_backoff",
        "confidence": 0.91,
        "supporting_evidence": ["pod waiting reason"],
        "missing_evidence": [],
        "action_route": "safe_pr",
        "command_id": None,
        "pr_url": None,
        "error_reason": None,
        "updated_at": "2026-07-05T10:00:00Z",
        "payload": {"ignored": "response model does not expose raw payload"},
    }


class DashboardApiDb:
    def __init__(self, *, allowed: set[str] | None, has_access: bool = True) -> None:
        self.allowed = allowed
        self.has_access = has_access
        self.calls: list[tuple[object, ...]] = []
        self.row = _timeline_row()

    def accessible_resource_ids(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        action: str,
    ) -> set[str] | None:
        self.calls.append(("accessible", user_id, workspace_id, resource_type, action))
        return self.allowed

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        action: str,
    ) -> bool:
        self.calls.append(("has_access", user_id, workspace_id, resource_type, resource_id, action))
        return self.has_access

    def list_rca_timeline(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append(("list", workspace_id, allowed_cluster_ids, limit))
        if allowed_cluster_ids == set():
            return []
        if allowed_cluster_ids:
            return [_timeline_row(sorted(allowed_cluster_ids)[0])]
        return [self.row]

    def list_rca_issues(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str] | None,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append(("issues", workspace_id, allowed_cluster_ids, limit))
        if allowed_cluster_ids == set():
            return []
        row = _timeline_row(sorted(allowed_cluster_ids)[0]) if allowed_cluster_ids else self.row
        return [
            {
                **row,
                "issue_severity": "critical",
                "severity_availability": "available",
                "severity_reason_code": None,
            }
        ]

    def get_rca_timeline_item(
        self,
        workspace_id: str,
        incident_id: str,
        allowed_cluster_ids: set[str] | None,
    ) -> dict[str, object] | None:
        self.calls.append(("get", workspace_id, incident_id, allowed_cluster_ids))
        if incident_id != "incident-1" or allowed_cluster_ids == set():
            return None
        return self.row


def test_rca_timeline_filters_by_accessible_clusters() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed={"cluster-1"})
        response = await rca_timeline(
            cluster_id=None,
            limit=25,
            current=_current_session(),
            db=db,
        )

        assert len(response.items) == 1
        assert response.items[0].cluster_id == "cluster-1"
        assert response.items[0].status == "rca_completed"
        assert ("list", "workspace-1", {"cluster-1"}, 25) in db.calls
        assert db.calls[0] == ("accessible", "user-1", "workspace-1", "cluster", "rca.read")

    asyncio.run(run())


def test_rca_timeline_with_cluster_query_requires_read_access() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=set(), has_access=True)
        response = await rca_timeline(
            cluster_id="cluster-2",
            limit=10,
            current=_current_session(),
            db=db,
        )

        assert response.items[0].cluster_id == "cluster-2"
        assert db.calls[0] == (
            "has_access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-2",
            "rca.read",
        )
        assert ("list", "workspace-1", {"cluster-2"}, 10) in db.calls

    asyncio.run(run())


def test_rca_issues_uses_the_same_cluster_permission_and_additive_contract() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=set(), has_access=True)
        response = await rca_issues(
            cluster_id="cluster-2",
            limit=10,
            current=_current_session(),
            db=db,
        )

        assert response.items[0].issue_severity == "critical"
        assert response.items[0].severity_availability == "available"
        assert ("issues", "workspace-1", {"cluster-2"}, 10) in db.calls
        assert db.calls[0] == (
            "has_access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-2",
            "rca.read",
        )

    asyncio.run(run())


def test_rca_issues_denies_an_unauthorized_cluster_scope() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=None, has_access=False)
        try:
            await rca_issues(
                cluster_id="cluster-1",
                limit=10,
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "resource access denied"
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_rca_timeline_denies_cluster_query_without_read_access() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=None, has_access=False)
        try:
            await rca_timeline(
                cluster_id="cluster-1",
                limit=10,
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 403
            assert exc.detail == "resource access denied"
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())


def test_rca_incident_returns_item_inside_allowed_clusters() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed={"cluster-1"})
        response = await rca_incident(
            "incident-1",
            cluster_id=None,
            current=_current_session(),
            db=db,
        )

        assert response.item.incident_id == "incident-1"
        assert response.item.supporting_evidence == ["pod waiting reason"]
        assert ("get", "workspace-1", "incident-1", {"cluster-1"}) in db.calls

    asyncio.run(run())


def test_rca_incident_returns_404_when_read_model_has_no_match() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed={"cluster-1"})
        try:
            await rca_incident(
                "incident-missing",
                cluster_id=None,
                current=_current_session(),
                db=db,
            )
        except HTTPException as exc:
            assert exc.status_code == 404
        else:
            raise AssertionError("expected HTTPException")

    asyncio.run(run())
