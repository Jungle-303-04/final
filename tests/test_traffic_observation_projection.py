from __future__ import annotations

from domains.traffic.observation_projection import traffic_overview


def test_traffic_projection_exposes_scope_but_never_invents_a_zero_flow_result() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "storefront"),),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
    )

    assert body.scope_coverage.availability == "available"
    assert body.scope_coverage.scopes[0].model_dump() == {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "namespaces": ("storefront",),
        "freshness": "live",
    }
    assert body.observation.observed_at is None
    assert body.observation.reason_codes == ("traffic_observation_not_integrated",)
    assert body.summary.total_flow_count is None
    assert body.summary.denied_flow_count is None
    assert body.relationships.edges is None


def test_traffic_projection_keeps_partial_and_disconnected_clusters_distinct() -> None:
    body = traffic_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b", "cluster-c"),
        namespace_refs=(),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-16T09:00:00Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            },
            "cluster-b": {
                "snapshot_revision": 9,
                "observed_at": "2026-07-16T09:01:00Z",
                "resources_complete": False,
                "labels_complete": True,
                "partial_reason_codes": ["agent_snapshot_truncated"],
            },
        },
    )

    assert body.scope_coverage.availability == "unavailable"
    assert [scope.freshness for scope in body.scope_coverage.scopes] == [
        "live",
        "partial",
        "disconnected",
    ]
    assert body.scope_coverage.reason_codes == (
        "agent_snapshot_truncated",
        "inventory_snapshot_incomplete:cluster-b",
        "inventory_snapshot_unavailable:cluster-c",
    )
