from __future__ import annotations

from types import SimpleNamespace

from domains.identity.dependencies import (
    resolve_allowed_application_ids,
    resolve_allowed_cluster_ids,
)
from packages.contracts.identity import Permission


class ScopeDb:
    def __init__(self, *, accessible: set[str] | None) -> None:
        self.accessible = accessible
        self.application_catalog_calls = 0
        self.cluster_catalog_calls = 0

    def accessible_resource_ids(self, *_args: object) -> set[str] | None:
        return self.accessible

    def list_workspace_application_ids(self, workspace_id: str) -> set[str]:
        assert workspace_id == "workspace-a"
        self.application_catalog_calls += 1
        return {"app-a", "app-b"}

    def list_workspace_cluster_ids(self, workspace_id: str) -> set[str]:
        assert workspace_id == "workspace-a"
        self.cluster_catalog_calls += 1
        return {"cluster-a", "cluster-b"}


def test_non_admin_none_grant_is_empty_for_both_resource_axes() -> None:
    db = ScopeDb(accessible=None)
    current = SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=["user"],
    )

    assert (
        resolve_allowed_cluster_ids(db, current, "workspace-a", Permission.INVENTORY_READ.value)
        == set()
    )
    assert (
        resolve_allowed_application_ids(
            db, current, "workspace-a", Permission.APPLICATION_READ.value
        )
        == set()
    )
    assert db.cluster_catalog_calls == 0
    assert db.application_catalog_calls == 0


def test_admin_none_grant_is_materialized_instead_of_becoming_repository_wildcard() -> None:
    db = ScopeDb(accessible=None)
    current = SimpleNamespace(
        user_id="admin-a",
        workspace_id="workspace-a",
        roles=["service_admin"],
    )

    assert resolve_allowed_cluster_ids(
        db, current, "workspace-a", Permission.INVENTORY_READ.value
    ) == {"cluster-a", "cluster-b"}
    assert resolve_allowed_application_ids(
        db, current, "workspace-a", Permission.APPLICATION_READ.value
    ) == {"app-a", "app-b"}
    assert db.cluster_catalog_calls == 1
    assert db.application_catalog_calls == 1


def test_workspace_mismatch_closes_both_axes_without_catalog_lookup() -> None:
    db = ScopeDb(accessible={"spoofed"})
    current = SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=["service_admin"],
    )

    assert (
        resolve_allowed_cluster_ids(db, current, "workspace-b", Permission.INVENTORY_READ.value)
        == set()
    )
    assert (
        resolve_allowed_application_ids(
            db, current, "workspace-b", Permission.APPLICATION_READ.value
        )
        == set()
    )
