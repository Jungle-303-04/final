from __future__ import annotations

from domains.checks.observation_projection import checks_detail, checks_overview


def test_checks_projection_exposes_scope_without_inventing_empty_findings_or_scores() -> None:
    body = checks_overview(
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
    assert body.result_set.checks is None
    assert body.result_set.total_check_count is None
    assert body.result_set.total_finding_count is None
    assert body.result_set.reason_codes == ("checks_result_projection_not_integrated",)
    assert body.catalog.entries is None


def test_checks_detail_preserves_requested_url_identity_without_claiming_catalog_match() -> None:
    body = checks_detail(
        requested_check_id="workload-limits",
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b"),
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

    assert body.scope_coverage.availability == "partial"
    assert body.detail.requested_check_id == "workload-limits"
    assert body.detail.title is None
    assert body.detail.findings is None
    assert body.detail.reason_codes == (
        "checks_catalog_not_integrated",
        "checks_result_projection_not_integrated",
    )
