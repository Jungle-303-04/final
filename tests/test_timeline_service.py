from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.target.connectivity import AGENT_ONLINE_WINDOW_SECONDS_ENV
from domains.timeline.service import resolve_timeline_read
from domains.timeline.settings import TIMELINE_MAX_WINDOW_SECONDS_ENV
from packages.contracts.identity import Permission
from packages.contracts.parity import ClusterScope
from packages.contracts.timeline import TimelineQuery, TimelineWindow


class TimelineServiceDb:
    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        if resource_type == "cluster" and permission == Permission.INVENTORY_READ.value:
            return {"cluster-inventory"}
        if resource_type == "cluster" and permission == Permission.RCA_READ.value:
            return {"cluster-incident"}
        if resource_type == "application" and permission == Permission.APPLICATION_READ.value:
            return {"application-gitops"}
        if resource_type == "application" and permission == Permission.DEPLOYMENT_READ.value:
            return {"application-workflow"}
        return set()

    def latest_cluster_agent_statuses(
        self, _workspace_id: str, cluster_ids: set[str]
    ) -> dict[str, dict[str, str]]:
        now = datetime.now(UTC)
        return {
            cluster_id: {
                "last_seen_at": (
                    now if cluster_id == "cluster-inventory" else now - timedelta(minutes=5)
                ).isoformat()
            }
            for cluster_id in cluster_ids
        }


def _query(*cluster_ids: str, from_ms: int = 1_000, to_ms: int = 2_000) -> TimelineQuery:
    return TimelineQuery(
        scopes=tuple(
            ClusterScope(
                workspace_id="workspace-a",
                cluster_id=cluster_id,
                namespaces=("payments",),
                freshness="disconnected",
            )
            for cluster_id in cluster_ids
        ),
        window=TimelineWindow(from_ms=from_ms, to_ms=to_ms),
        mode="live",
    )


def _current() -> SimpleNamespace:
    return SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("operator",))


def test_timeline_read_derives_server_freshness_and_preserves_source_grants(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(AGENT_ONLINE_WINDOW_SECONDS_ENV, "1")
    resolution = asyncio.run(
        resolve_timeline_read(
            TimelineServiceDb(),
            _current(),
            _query("cluster-inventory", "cluster-incident"),
        )
    )

    assert [(scope.cluster_id, scope.freshness) for scope in resolution.scopes] == [
        ("cluster-incident", "stale"),
        ("cluster-inventory", "live"),
    ]
    assert resolution.read_scope.inventory_cluster_ids == {"cluster-inventory"}
    assert resolution.read_scope.kubernetes_event_cluster_ids == {"cluster-inventory"}
    assert resolution.read_scope.incident_cluster_ids == {"cluster-incident"}
    assert resolution.read_scope.application_workflow_ids == {"application-workflow"}
    assert resolution.read_scope.gitops_application_ids == {"application-gitops"}
    assert (
        resolution.cursor_binding.authorization_revision
        == resolution.authorized.authorization_revision
    )


def test_timeline_read_rejects_unreadable_cluster_before_freshness_lookup() -> None:
    with pytest.raises(HTTPException) as error:
        asyncio.run(
            resolve_timeline_read(TimelineServiceDb(), _current(), _query("cluster-hidden"))
        )

    assert error.value.status_code == 404


def test_timeline_read_fails_closed_when_observed_freshness_is_unavailable() -> None:
    class NoFreshnessDb:
        def accessible_resource_ids(
            self,
            user_id: str,
            workspace_id: str,
            resource_type: str,
            permission: str,
        ) -> set[str]:
            return TimelineServiceDb().accessible_resource_ids(
                user_id,
                workspace_id,
                resource_type,
                permission,
            )

    with pytest.raises(HTTPException) as error:
        asyncio.run(resolve_timeline_read(NoFreshnessDb(), _current(), _query("cluster-inventory")))

    assert error.value.status_code == 503


def test_timeline_read_enforces_server_window_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(TIMELINE_MAX_WINDOW_SECONDS_ENV, "1")

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            resolve_timeline_read(
                TimelineServiceDb(), _current(), _query("cluster-inventory", from_ms=0, to_ms=1_001)
            )
        )

    assert error.value.status_code == 422
