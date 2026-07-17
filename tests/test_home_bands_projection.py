from __future__ import annotations

from datetime import UTC, datetime

from domains.checks.observation_projection import checks_overview
from domains.cost.observation_projection import cost_overview
from domains.dashboard.home_bands import (
    compose_home_explore_summary,
    compose_home_posture_summary,
    compose_home_topology_preview,
)
from domains.gitops.overview_projection import project_gitops_overview
from domains.traffic.observation_projection import traffic_overview

WORKSPACE_ID = "workspace-a"
CLUSTER_ID = "cluster-a"
OBSERVED_AT = "2026-07-17T05:59:30Z"
CONTEXT = {
    "snapshot_revision": 8,
    "observed_at": OBSERVED_AT,
    "resources_complete": True,
    "labels_complete": True,
    "partial_reason_codes": [],
}


def test_home_topology_preview_preserves_graph_counts_and_completeness() -> None:
    preview = compose_home_topology_preview(
        {
            "node_count": 7,
            "edge_count": 5,
            "omitted_node_count": 2,
            "omitted_edge_count": 1,
            "relation_completeness": "partial",
            "partial_reason_codes": ["graph_node_budget_exceeded"],
        },
        observed_at=OBSERVED_AT,
    )

    assert preview.coverage.availability == "partial"
    assert preview.coverage.observed_at == OBSERVED_AT
    assert preview.node_count == 7
    assert preview.edge_count == 5
    assert preview.omitted_node_count == 2
    assert preview.omitted_edge_count == 1
    assert preview.relation_completeness == "partial"


def test_home_explore_summary_omits_unobserved_traffic_and_cost_instead_of_zeroes() -> None:
    contexts = {CLUSTER_ID: CONTEXT}
    summary = compose_home_explore_summary(
        traffic=traffic_overview(
            workspace_id=WORKSPACE_ID,
            contexts=contexts,
            namespace_refs=(),
            selected_cluster_ids=(CLUSTER_ID,),
        ),
        cost=cost_overview(
            workspace_id=WORKSPACE_ID,
            contexts=contexts,
            selected_cluster_ids=(CLUSTER_ID,),
        ),
    )

    assert summary.traffic.coverage.availability == "unavailable"
    assert summary.cost.coverage.availability == "unavailable"
    assert summary.traffic.coverage.reason_codes == ("traffic_observation_not_integrated",)
    assert summary.cost.coverage.reason_codes == ("cost_observation_unavailable",)


def test_home_posture_summary_reuses_agent_checks_and_gitops_inventory_evidence() -> None:
    checks = checks_overview(
        workspace_id=WORKSPACE_ID,
        selected_cluster_ids=(CLUSTER_ID,),
        namespace_refs=(),
        contexts={CLUSTER_ID: CONTEXT},
        snapshots={CLUSTER_ID: _checks_snapshot()},
        now=datetime(2026, 7, 17, 6, 0, tzinfo=UTC),
    )
    gitops = project_gitops_overview(
        workspace_id=WORKSPACE_ID,
        registered_rows=[],
        inventory_rows=[_gitops_controller()],
        snapshot_contexts={CLUSTER_ID: CONTEXT},
        has_more=False,
    )

    posture = compose_home_posture_summary(checks=checks, gitops=gitops)

    assert posture.audit.coverage.availability == "available"
    assert posture.audit.total_finding_count == 2
    assert posture.audit.severity_counts == {"danger": 1, "warning": 1}
    assert posture.gitops.coverage.availability == "available"
    assert posture.gitops.controller_count == 1
    assert posture.gitops.provider_counts == {"argo": 1}
    assert posture.gitops.health_counts == {"degraded": 1}
    assert posture.network_policy.coverage.availability == "unavailable"
    assert posture.network_policy.total_policies is None
    assert posture.network_policy.covered_workloads is None


def _checks_snapshot() -> dict[str, object]:
    catalog = [
        {
            "check_id": "workload-limits",
            "title": "Workload limits",
            "category": "resources",
            "severity": "warning",
            "description": "Checks resource limits.",
            "remediation": "Set explicit resource limits.",
        },
        {
            "check_id": "service-selector",
            "title": "Service selector",
            "category": "networking",
            "severity": "danger",
            "description": "Checks Service selectors.",
            "remediation": "Match a ready workload.",
        },
    ]
    findings = [
        {
            "finding_id": "finding-warning",
            "check_id": "workload-limits",
            "category": "resources",
            "severity": "warning",
            "message": "Limits were not observed.",
            "resource": _resource_ref("Deployment", "checkout", "uid-checkout"),
        },
        {
            "finding_id": "finding-danger",
            "check_id": "service-selector",
            "category": "networking",
            "severity": "danger",
            "message": "Selector has no ready target.",
            "resource": _resource_ref("Service", "checkout", "uid-service", api_group=""),
        },
    ]
    return {
        "summary": {
            "summary": {
                "checks_observation": {
                    "availability": "available",
                    "observed_at": OBSERVED_AT,
                    "namespaces": [],
                    "reason_codes": [],
                    "findings": findings,
                    "catalog": catalog,
                    "visibility": {
                        "state": "ok",
                        "namespace_scope": [],
                        "core": {"deployments": "allowed", "services": "allowed"},
                        "missing_optional_kinds": [],
                    },
                }
            }
        }
    }


def _resource_ref(
    kind: str,
    name: str,
    uid: str,
    *,
    api_group: str = "apps",
) -> dict[str, object]:
    return {
        "api_group": api_group,
        "version": "v1",
        "kind": kind,
        "namespace": "storefront",
        "name": name,
        "uid": uid,
    }


def _gitops_controller() -> dict[str, object]:
    return {
        "cluster_id": CLUSTER_ID,
        "api_version": "argoproj.io/v1alpha1",
        "kind": "Application",
        "namespace": "argocd",
        "name": "checkout",
        "uid": "uid-argo-checkout",
        "resource_version": "17",
        "application_ids": [],
        "status": "OutOfSync",
        "health": "degraded",
        "summary": {"revision": "abc123"},
        "observed_at": OBSERVED_AT,
        "labels": {},
    }
