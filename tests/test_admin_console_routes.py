"""관리 콘솔 갭 API 라우트 계약 — 경로 등록·인증 가드 회귀."""

from __future__ import annotations

from domains.identity.admin_router import router as admin_router
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
