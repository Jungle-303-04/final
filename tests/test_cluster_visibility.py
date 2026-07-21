"""Blocked test-cluster 표시 규칙 공유 predicate 회귀 테스트.

list_clusters와 checks scope 투영이 동일 기준으로 blocked-test 클러스터를 숨기는지,
그리고 authorized 집합에서 blocked-test만 제외(포함/제외 count)하는지 검증한다.
"""

from __future__ import annotations

from domains.target.cluster_visibility import (
    BLOCKED_TEST_CLUSTER_IDS,
    BLOCKED_TEST_CLUSTER_NAME_PARTS,
    is_blocked_test_cluster,
    visible_allowed_cluster_ids,
)


def test_is_blocked_test_cluster_by_id_and_name() -> None:
    blocked_id = next(iter(BLOCKED_TEST_CLUSTER_IDS))
    name_marker = BLOCKED_TEST_CLUSTER_NAME_PARTS[0]
    assert is_blocked_test_cluster(blocked_id) is True
    assert is_blocked_test_cluster("cluster-x", name_marker.upper()) is True
    assert is_blocked_test_cluster("cluster-x", f"prod {name_marker} east") is True
    assert is_blocked_test_cluster("cluster-x", "Primary cluster") is False
    assert is_blocked_test_cluster("cluster-x") is False


class _RegistrationsDb:
    def __init__(self, registrations: dict[str, str]) -> None:
        # cluster_id -> display name
        self._registrations = registrations
        self.calls: list[set[str] | None] = []

    def list_cluster_registrations(
        self,
        workspace_id: str,
        *,
        cluster_ids: set[str] | None = None,
        limit: int = 100,
    ) -> list[dict[str, object]]:
        assert workspace_id == "workspace-a"
        self.calls.append(cluster_ids)
        selected = cluster_ids or set(self._registrations)
        return [
            {"cluster_id": cluster_id, "name": self._registrations[cluster_id]}
            for cluster_id in selected
            if cluster_id in self._registrations
        ][:limit]


def test_visible_allowed_cluster_ids_excludes_blocked_by_id_and_name() -> None:
    blocked_id = next(iter(BLOCKED_TEST_CLUSTER_IDS))
    name_marker = BLOCKED_TEST_CLUSTER_NAME_PARTS[0]
    db = _RegistrationsDb(
        {
            "cluster-a": "Primary cluster",
            "cluster-b": "Secondary cluster",
            blocked_id: "some name",
            "cluster-named-test": f"QA {name_marker} sandbox",
        }
    )
    allowed = {"cluster-a", "cluster-b", blocked_id, "cluster-named-test"}

    visible = visible_allowed_cluster_ids(db, "workspace-a", allowed)

    # 포함: 정상 2개, 제외: blocked-id 1개 + blocked-name 1개.
    assert visible == {"cluster-a", "cluster-b"}
    assert len(visible) == 2
    assert blocked_id not in visible
    assert "cluster-named-test" not in visible


def test_visible_universe_equals_active_registration_intersection_not_blocked_only() -> None:
    # ROOT 코드리뷰 회귀: authorized여도 등록 레코드가 반환되지 않는 id(disconnected/미등록)는
    # 기본 표시 scope에서 제외되어야 한다. visible = allowed ∩ 반환 registration ∩ not-blocked.
    blocked_id = next(iter(BLOCKED_TEST_CLUSTER_IDS))
    # 반환되는 active registration은 active-a/active-b/blocked뿐. missing은 allowed지만 미반환.
    db = _RegistrationsDb(
        {
            "active-a": "Primary cluster",
            "active-b": "Secondary cluster",
            blocked_id: "some name",
        }
    )
    allowed = {"active-a", "active-b", "disconnected-or-missing", blocked_id}

    visible = visible_allowed_cluster_ids(db, "workspace-a", allowed)

    assert visible == {"active-a", "active-b"}
    assert len(visible) == 2
    # authorized지만 미반환 → 제외(옛 `allowed - blocked` 버그였다면 되살아났을 것).
    assert "disconnected-or-missing" not in visible
    assert blocked_id not in visible


def test_visible_allowed_cluster_ids_empty_input_short_circuits() -> None:
    db = _RegistrationsDb({"cluster-a": "Primary cluster"})
    assert visible_allowed_cluster_ids(db, "workspace-a", set()) == set()
    # 빈 입력이면 등록 조회를 하지 않는다.
    assert db.calls == []


class _NoRegistrationsDb:
    """list_cluster_registrations를 제공하지 않는 저장소 double."""


def test_visible_allowed_cluster_ids_falls_back_to_id_rule_without_registrations() -> None:
    blocked_id = next(iter(BLOCKED_TEST_CLUSTER_IDS))
    allowed = {"cluster-a", blocked_id}
    # 이름을 못 얻어도 id 규칙으로 안전하게 축소(이름-only blocked는 남을 수 있으나 확대는 없음).
    visible = visible_allowed_cluster_ids(_NoRegistrationsDb(), "workspace-a", allowed)
    assert visible == {"cluster-a"}
