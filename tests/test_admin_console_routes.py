"""관리 콘솔 갭 API 라우트 계약 — 경로 등록·인증 가드 회귀."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response
from fastapi.routing import APIRoute

from domains.identity.admin_router import list_access, remove_group_member
from domains.identity.admin_router import router as admin_router
from domains.identity.dependencies import require_admin_session
from packages.contracts.gateway import routes as gateway_routes


def _paths() -> set[str]:
    return {route.path for route in admin_router.routes}  # type: ignore[attr-defined]


def test_admin_router_registers_all_gap_paths() -> None:
    paths = _paths()
    assert gateway_routes.ORGS_PATH in paths
    assert gateway_routes.ORG_PATH in paths
    assert gateway_routes.GROUPS_PATH in paths
    assert gateway_routes.GROUP_MEMBERS_PATH in paths
    assert gateway_routes.GROUP_MEMBER_PATH in paths
    assert gateway_routes.USERS_PATH in paths
    assert gateway_routes.ACCESS_PATH in paths
    assert gateway_routes.ACCESS_ITEM_PATH in paths


def test_gap_paths_do_not_collide_with_existing() -> None:
    # 신규 경로가 기존 상수와 문자열 충돌하지 않아야 함(라우팅 모호성 방지).
    new = {
        gateway_routes.ORGS_PATH,
        gateway_routes.GROUPS_PATH,
        gateway_routes.USERS_PATH,
        gateway_routes.ACCESS_PATH,
    }
    existing = {
        gateway_routes.APPLICATIONS_PATH,
        gateway_routes.CLUSTERS_PATH,
        gateway_routes.CATALOG_ITEMS_PATH,
        gateway_routes.AI_CONVERSATIONS_PATH,
    }
    assert new.isdisjoint(existing)


def test_list_access_requires_admin_session() -> None:
    route = next(
        route
        for route in admin_router.routes
        if isinstance(route, APIRoute)
        and route.path == gateway_routes.ACCESS_PATH
        and "GET" in route.methods
    )

    assert any(
        dependency.call is require_admin_session for dependency in route.dependant.dependencies
    )


def test_list_access_does_not_accept_workspace_scope_from_query() -> None:
    route = next(
        route
        for route in admin_router.routes
        if isinstance(route, APIRoute)
        and route.path == gateway_routes.ACCESS_PATH
        and "GET" in route.methods
    )

    assert {parameter.name for parameter in route.dependant.query_params} == {"resource_id"}


class WorkspaceScopedAccessDb:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str | None]] = []
        self.grants = [
            {
                "access_id": "grant-a",
                "subject_id": "user-a",
                "subject_type": "user",
                "subject_label": "user-a@example.com",
                "resource_type": "cluster",
                "resource_id": "cluster-a",
                "role": "observer",
                "granted_at": None,
                "organization_id": "workspace-a",
            },
            {
                "access_id": "grant-b",
                "subject_id": "user-b",
                "subject_type": "user",
                "subject_label": "private-b@example.com",
                "resource_type": "cluster",
                "resource_id": "cluster-b",
                "role": "observer",
                "granted_at": None,
                "organization_id": "workspace-b",
            },
        ]

    def list_access_grants(
        self,
        organization_id: str,
        resource_id: str | None = None,
    ) -> list[dict[str, object]]:
        self.calls.append((organization_id, resource_id))
        return [
            {key: value for key, value in grant.items() if key != "organization_id"}
            for grant in self.grants
            if grant["organization_id"] == organization_id
            and (resource_id is None or grant["resource_id"] == resource_id)
        ]


def test_list_access_uses_session_workspace_and_excludes_other_workspace_email() -> None:
    db = WorkspaceScopedAccessDb()

    response = asyncio.run(
        list_access(
            resource_id=None,
            current=SimpleNamespace(workspace_id="workspace-a"),
            db=db,
        )
    )

    assert db.calls == [("workspace-a", None)]
    assert [grant["access_id"] for grant in response.grants] == ["grant-a"]
    assert all(grant["subject_label"] != "private-b@example.com" for grant in response.grants)


class LastAdminDb:
    def __init__(self, *, last_admin: bool) -> None:
        self.last_admin = last_admin
        self.removed: list[tuple[str, str]] = []

    def is_last_active_service_admin(self, user_id: str) -> bool:
        return user_id == "admin-1" and self.last_admin

    def remove_group_member(self, group_id: str, user_id: str) -> None:
        self.removed.append((group_id, user_id))


def test_remove_group_member_rejects_last_active_admin() -> None:
    db = LastAdminDb(last_admin=True)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(
            remove_group_member(
                "group-1",
                "admin-1",
                Response(),
                _current=SimpleNamespace(user_id="admin-1"),
                db=db,
            )
        )

    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "last_admin"
    assert db.removed == []


def test_remove_group_member_allows_non_last_admin() -> None:
    db = LastAdminDb(last_admin=False)
    response = asyncio.run(
        remove_group_member(
            "group-1",
            "admin-1",
            Response(),
            _current=SimpleNamespace(user_id="admin-1"),
            db=db,
        )
    )

    assert response.status_code == 204
    assert db.removed == [("group-1", "admin-1")]
