"""control_namespaces → 에이전트 수집 정책 반영 — 관리 네임스페이스가 화면에 보이게.

종전에는 standard 프로파일이 에이전트 자신의 네임스페이스(target)만 수집해,
control 네임스페이스(sandbox 등)에 배포된 워크로드가 인벤토리에 나타나지 않았다.
"""

from __future__ import annotations

from domains.target.evidence_policy import (
    control_namespace_tuple,
    default_agent_policy,
    evidence_provider_queries,
)


def _kubernetes_namespaces(queries: list[dict[str, object]]) -> list[str]:
    namespaces: list[str] = []
    for query in queries:
        provenance = query.get("provenance")
        if not isinstance(provenance, dict):
            continue
        for namespace in provenance.get("namespaces") or []:
            namespaces.append(str(namespace))
    return namespaces


def test_control_namespace_tuple_normalizes_commas_and_spaces() -> None:
    assert control_namespace_tuple("sandbox,color-turf") == ("sandbox", "color-turf")
    assert control_namespace_tuple("  sandbox  color-turf ") == ("sandbox", "color-turf")
    assert control_namespace_tuple("sandbox,sandbox") == ("sandbox",)
    assert control_namespace_tuple(None) == ()


def test_standard_profile_collects_control_namespaces() -> None:
    queries = evidence_provider_queries(
        "kubernetes",
        cluster_id="c-1",
        evidence_profile="standard",
        control_namespaces=("sandbox", "color-turf"),
    )
    namespaces = _kubernetes_namespaces(queries)
    assert "target" in namespaces
    assert "sandbox" in namespaces
    assert "color-turf" in namespaces
    names = [str(query["name"]) for query in queries]
    # 이름 슬러그: 하이픈 → 언더스코어(정책 이름 규칙 유지).
    assert "color_turf_namespace_snapshot" in names


def test_standard_profile_collects_control_namespace_logs() -> None:
    queries = evidence_provider_queries(
        "logs",
        cluster_id="c-1",
        evidence_profile="standard",
        control_namespaces=("sandbox", "color-turf"),
    )
    names = [str(query["name"]) for query in queries]
    assert "sandbox_namespace_related_logs" in names
    assert "color_turf_namespace_related_logs" in names
    assert any(query["query"] == '{k8s_namespace_name="sandbox"}' for query in queries)


def test_target_profile_enables_cluster_local_tempo_query() -> None:
    queries = evidence_provider_queries(
        "traces",
        cluster_id="c-1",
        evidence_profile="standard",
    )
    assert [query["name"] for query in queries] == ["cluster_recent_traces"]
    assert queries[0]["query"] == "{}"
    assert queries[0]["provenance"]["backend_scope"] == "cluster_local"


def test_demo_profile_does_not_duplicate_covered_namespaces() -> None:
    queries = evidence_provider_queries(
        "kubernetes",
        cluster_id="c-1",
        evidence_profile="demo",
        control_namespaces=("sandbox", "game-live"),
    )
    names = [str(query["name"]) for query in queries]
    assert names.count("sandbox_namespace_snapshot") == 1  # demo 기본과 중복 금지
    assert "game_live_namespace_snapshot" in names


def test_default_agent_policy_threads_control_namespaces() -> None:
    policy = default_agent_policy(
        cluster_id="c-1",
        cluster_role="target",
        control_namespaces=("sandbox",),
    )
    kubernetes = policy.evidence.providers["kubernetes"]
    namespaces = _kubernetes_namespaces(list(kubernetes.queries))
    assert "sandbox" in namespaces


def test_empty_control_namespaces_keeps_existing_query_set() -> None:
    baseline = evidence_provider_queries(
        "kubernetes", cluster_id="c-1", evidence_profile="standard"
    )
    with_empty = evidence_provider_queries(
        "kubernetes",
        cluster_id="c-1",
        evidence_profile="standard",
        control_namespaces=(),
    )
    assert [q["name"] for q in baseline] == [q["name"] for q in with_empty]
