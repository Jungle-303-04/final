"""dashboard API 권한 필터와 응답 DTO 검증."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from fastapi import HTTPException

from domains.dashboard.router import rca_incident, rca_issues, rca_timeline, resource_rca_issues


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
        *,
        namespaces: tuple[tuple[str, str], ...],
        severities: tuple[str, ...],
        categories: tuple[str, ...],
        limit: int,
    ) -> dict[str, object]:
        self.calls.append(
            (
                "issues",
                workspace_id,
                allowed_cluster_ids,
                namespaces,
                severities,
                categories,
                limit,
            )
        )
        if allowed_cluster_ids == set():
            return {
                "items": [],
                "total_matched": 0,
                "visibility": {
                    "state": "restricted",
                    "completeness": "unavailable",
                    "authorized_cluster_count": 0,
                    "requested_namespaces": [],
                    "reason_codes": ["no_authorized_clusters"],
                },
                "facets": {"namespaces": [], "severities": [], "categories": []},
            }
        row = _timeline_row(sorted(allowed_cluster_ids)[0]) if allowed_cluster_ids else self.row
        return {
            "items": [
                {
                    **row,
                    "issue_severity": "critical",
                    "severity_availability": "available",
                    "severity_reason_code": None,
                    "category": "container_restart",
                    "category_availability": "available",
                    "category_reason_code": None,
                }
            ],
            "total_matched": 3,
            "visibility": {
                "state": "partial",
                "completeness": "partial",
                "authorized_cluster_count": 1,
                "requested_namespaces": ["cluster-2/payments"],
                "reason_codes": ["legacy_category_projection_incomplete"],
            },
            "facets": {
                "namespaces": [{"value": "cluster-2/payments", "count": 3}],
                "severities": [{"value": "critical", "count": 2}],
                "categories": [{"value": "container_restart", "count": 2}],
            },
        }

    def list_recent_workload_changes_for_incidents(
        self,
        workspace_id: str,
        incident_ids: tuple[str, ...],
        allowed_cluster_ids: set[str],
        *,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append(("issue_changes", workspace_id, incident_ids, allowed_cluster_ids, limit))
        return [
            {
                "incident_id": "incident-1",
                "event_id": "change-1",
                "changed_at": "2026-07-05T09:50:00Z",
                "namespace": "payments",
                "resource_kind": "deployment",
                "resource_name": "checkout-api",
                "image_before": "checkout:v1",
                "image_after": "checkout:v2",
                "pr_url": None,
                "commit_sha": "abc123",
                "repository_id": "repo-1",
                "repo_ref": "github:org/repo",
                "workflow_run_id": "run-1",
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

    def filter_snapshot_contexts(
        self,
        workspace_id: str,
        cluster_ids: tuple[str, ...],
    ) -> dict[str, dict[str, object]]:
        self.calls.append(("contexts", workspace_id, cluster_ids))
        return {
            cluster_id: {
                "snapshot_revision": 7,
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
                "observed_at": "2026-07-16T05:00:00Z",
            }
            for cluster_id in cluster_ids
        }

    def list_resource_issues(
        self,
        workspace_id: str,
        cluster_id: str,
        *,
        namespace: str | None,
        resource_kind: str,
        resource_name: str,
        limit: int,
    ) -> list[dict[str, object]]:
        self.calls.append(
            (
                "resource_issues",
                workspace_id,
                cluster_id,
                namespace,
                resource_kind,
                resource_name,
                limit,
            )
        )
        return [
            {
                **_timeline_row(cluster_id),
                "incident_namespace": namespace,
                "incident_resource_kind": resource_kind,
                "incident_resource_name": resource_name,
                "issue_severity": "critical",
                "severity_availability": "available",
                "severity_reason_code": None,
                "onset": {
                    "first_observed_at": "2026-07-16T04:00:00Z",
                    "source": "timeline_created_at",
                    "timing_kind": None,
                    "timing_availability": "unavailable",
                    "timing_reason_code": "health_transition_evidence_unavailable",
                },
            }
        ]


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
            namespaces="cluster-2/payments",
            severity="critical",
            category="container_restart",
            limit=10,
            current=_current_session(),
            db=db,
        )

        assert response.items[0].issue_severity == "critical"
        assert response.items[0].severity_availability == "available"
        assert response.items[0].category == "container_restart"
        assert response.total == 1
        assert response.total_matched == 3
        assert response.count_completeness == "exact"
        assert response.visibility.state == "partial"
        assert response.recent_changes[0].incident_id == "incident-1"
        assert response.facets.categories[0].value == "container_restart"
        assert (
            "issues",
            "workspace-1",
            {"cluster-2"},
            (("cluster-2", "payments"),),
            ("critical",),
            ("container_restart",),
            10,
        ) in db.calls
        assert db.calls[0] == (
            "has_access",
            "user-1",
            "workspace-1",
            "cluster",
            "cluster-2",
            "rca.read",
        )
        assert (
            "issue_changes",
            "workspace-1",
            ("incident-1",),
            {"cluster-2"},
            10,
        ) in db.calls

    asyncio.run(run())


def test_rca_issues_denies_an_unauthorized_cluster_scope() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=None, has_access=False)
        try:
            await rca_issues(
                cluster_id="cluster-1",
                namespaces=None,
                severity=None,
                category=None,
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


def test_resource_rca_issues_requires_both_permissions_and_returns_server_onset() -> None:
    async def run() -> None:
        db = DashboardApiDb(allowed=None, has_access=True)
        response = await resource_rca_issues(
            cluster_id="cluster-1",
            kind="Deployment",
            name="checkout-api",
            namespace="target",
            limit=25,
            current=_current_session(),
            db=db,
        )

        assert response.scope.cluster_id == "cluster-1"
        assert response.scope.namespaces == ("target",)
        assert response.scope.freshness == "live"
        assert response.coverage_availability == "available"
        assert response.items[0].onset.first_observed_at == "2026-07-16T04:00:00Z"
        assert response.items[0].onset.timing_kind is None
        assert response.items[0].onset.timing_availability == "unavailable"
        assert response.has_more is False
        assert (
            "resource_issues",
            "workspace-1",
            "cluster-1",
            "target",
            "Deployment",
            "checkout-api",
            26,
        ) in db.calls
        permission_calls = [call for call in db.calls if call[0] == "has_access"]
        assert [call[-1] for call in permission_calls] == ["inventory.read", "rca.read"]

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
