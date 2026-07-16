from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.timeline.access import (
    require_timeline_cluster_ids,
    resolve_authorized_timeline_scope,
)
from packages.contracts.identity import Permission


class TimelineAccessDb:
    def __init__(self, *, incident_clusters: set[str] | None = None) -> None:
        self.incident_clusters = incident_clusters or {"cluster-incident"}

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        permission: str,
    ) -> set[str]:
        assert resource_type in {"cluster", "application"}
        if permission == Permission.INVENTORY_READ.value:
            return {"cluster-inventory"}
        if permission == Permission.RCA_READ.value:
            return set(self.incident_clusters)
        if permission == Permission.APPLICATION_READ.value:
            return {"application-read"}
        if permission == Permission.DEPLOYMENT_READ.value:
            return {"application-deploy"}
        return set()


def test_timeline_authorization_revision_binds_every_source_grant() -> None:
    first = asyncio.run(
        resolve_authorized_timeline_scope(
            TimelineAccessDb(),
            SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("operator",)),
        )
    )
    changed = asyncio.run(
        resolve_authorized_timeline_scope(
            TimelineAccessDb(incident_clusters={"cluster-other"}),
            SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=("operator",)),
        )
    )

    assert first.readable_cluster_ids == {"cluster-inventory", "cluster-incident"}
    assert first.authorization_revision != changed.authorization_revision


def test_timeline_query_may_select_incident_cluster_but_not_application_only_cluster() -> None:
    authorized = asyncio.run(
        resolve_authorized_timeline_scope(
            TimelineAccessDb(),
            SimpleNamespace(user_id="user-a", workspace_id="workspace-a", roles=()),
        )
    )

    assert require_timeline_cluster_ids(authorized, {"cluster-incident"}) == {"cluster-incident"}
    with pytest.raises(HTTPException) as error:
        require_timeline_cluster_ids(authorized, {"application-read"})

    assert error.value.status_code == 404
