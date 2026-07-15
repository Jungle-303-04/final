from __future__ import annotations

from domains.cost.observation_projection import cost_overview


def test_cost_projection_exposes_scope_but_never_invents_currency_or_amounts() -> None:
    body = cost_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
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
        "namespaces": (),
        "freshness": "live",
    }
    assert body.observation.model_dump() == {
        "availability": "unavailable",
        "observed_at": None,
        "currency": None,
        "data_window": None,
        "reason_codes": ("cost_observation_not_integrated",),
    }
    assert body.summary.hourly_cost is None
    assert body.summary.monthly_projection is None
    assert body.summary.savings_recommendations is None
    assert body.refresh_after_seconds == 60


def test_cost_projection_keeps_partial_and_disconnected_scope_evidence() -> None:
    body = cost_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b", "cluster-c"),
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
