from __future__ import annotations

from datetime import UTC, datetime

from domains.checks.observation_projection import checks_detail, checks_overview
from packages.contracts.checks import ChecksSettingsPolicy
from packages.contracts.parity import ResourceRef

NOW = datetime(2026, 7, 17, 6, 0, tzinfo=UTC)


def _snapshot(
    *,
    observed_at: str = "2026-07-17T05:59:30Z",
    namespaces: list[str] | None = None,
    reason_codes: list[str] | None = None,
) -> dict[str, object]:
    findings = [
        {
            "finding_id": "finding-a",
            "check_id": "workload-limits",
            "category": "resources",
            "severity": "warning",
            "message": "Container limits are not observed.",
            "resource": {
                "api_group": "apps",
                "version": "v1",
                "kind": "Deployment",
                "namespace": "storefront",
                "name": "checkout",
                "uid": "uid-checkout",
            },
        },
        {
            "finding_id": "finding-b",
            "check_id": "service-selector",
            "category": "networking",
            "severity": "danger",
            "message": "Service selector has no ready workload.",
            "resource": {
                "api_group": "",
                "version": "v1",
                "kind": "Service",
                "namespace": "backoffice",
                "name": "admin",
                "uid": "uid-admin",
            },
        },
    ]
    if namespaces:
        findings = [
            finding
            for finding in findings
            if finding["resource"]["namespace"] in namespaces  # type: ignore[index]
        ]
    return {
        "summary": {
            "summary": {
                "checks_observation": {
                    "availability": "partial" if reason_codes else "available",
                    "observed_at": observed_at,
                    "namespaces": namespaces or [],
                    "reason_codes": reason_codes or [],
                    "findings": findings,
                    "catalog": [
                        {
                            "check_id": "workload-limits",
                            "title": "Workload limits",
                            "category": "resources",
                            "severity": "warning",
                            "description": "Checks container resource limits.",
                            "remediation": "Set explicit resource limits.",
                        },
                        {
                            "check_id": "service-selector",
                            "title": "Service selector",
                            "category": "networking",
                            "severity": "danger",
                            "description": "Checks Service selector targets.",
                            "remediation": "Match the selector to a ready workload.",
                        },
                    ],
                    "visibility": {
                        "state": "limited" if namespaces else "ok",
                        "namespace_scope": namespaces or [],
                        "core": {
                            "deployments": "allowed",
                            "secrets": "namespace_limited" if namespaces else "allowed",
                        },
                        "missing_optional_kinds": ["Gateway"],
                    },
                }
            }
        }
    }


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
        snapshots={},
        now=NOW,
    )

    assert body.scope_coverage.availability == "unavailable"
    assert body.scope_coverage.scopes[0].model_dump() == {
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "namespaces": ("storefront",),
        "freshness": "disconnected",
    }
    assert body.result_set.checks is None
    assert body.result_set.total_check_count is None
    assert body.result_set.total_finding_count is None
    assert body.result_set.reason_codes == ("checks_observation_unavailable:cluster-a",)
    assert body.catalog.entries is None


def test_checks_projection_filters_agent_observations_to_the_requested_namespace() -> None:
    body = checks_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "storefront"),),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-17T05:59:30Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        snapshots={"cluster-a": _snapshot(namespaces=["storefront"])},
        now=NOW,
    )

    assert body.scope_coverage.availability == "available"
    assert body.result_set.availability == "available"
    assert body.result_set.total_finding_count == 1
    assert body.result_set.total_check_count == 2
    assert body.result_set.checks is not None
    assert body.result_set.checks[0].cluster_id == "cluster-a"
    assert body.result_set.checks[0].resource.namespace == "storefront"
    assert body.catalog.entries is not None
    assert {entry.check_id for entry in body.catalog.entries} == {
        "service-selector",
        "workload-limits",
    }
    assert body.visibility.availability == "available"
    assert body.visibility.clusters[0].namespace_scope == ("storefront",)
    assert body.visibility.clusters[0].core == {
        "deployments": "allowed",
        "secrets": "namespace_limited",
    }


def test_checks_projection_filters_one_exact_resource_ref_without_name_fallback() -> None:
    resource = ResourceRef(
        api_group="apps",
        version="v1",
        kind="Deployment",
        namespace="storefront",
        name="checkout",
        uid="uid-checkout",
    )
    scope = {
        "workspace_id": "workspace-a",
        "selected_cluster_ids": ("cluster-a",),
        "namespace_refs": (("cluster-a", "storefront"),),
        "contexts": {
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-17T05:59:30Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        "snapshots": {"cluster-a": _snapshot(namespaces=["storefront"])},
        "resource_cluster_id": "cluster-a",
        "now": NOW,
    }

    body = checks_overview(resource=resource, **scope)
    changed_uid = checks_overview(
        resource=resource.model_copy(update={"uid": "replacement-uid"}),
        **scope,
    )

    assert body.result_set.total_finding_count == 1
    assert body.result_set.total_check_count == 1
    assert body.result_set.checks is not None
    assert body.result_set.checks[0].resource == resource
    assert body.catalog.entries is not None
    assert [entry.check_id for entry in body.catalog.entries] == ["workload-limits"]
    assert changed_uid.result_set.availability == "available"
    assert changed_uid.result_set.total_finding_count == 0
    assert changed_uid.result_set.total_check_count == 0
    assert changed_uid.result_set.checks == ()
    assert changed_uid.catalog.entries == ()


def test_checks_projection_retains_fresh_evidence_when_another_cluster_is_stale() -> None:
    body = checks_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a", "cluster-b"),
        namespace_refs=(),
        contexts={
            cluster_id: {
                "snapshot_revision": revision,
                "observed_at": "2026-07-17T05:59:30Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
            for cluster_id, revision in (("cluster-a", 8), ("cluster-b", 9))
        },
        snapshots={
            "cluster-a": _snapshot(),
            "cluster-b": _snapshot(observed_at="2026-07-17T05:58:00Z"),
        },
        now=NOW,
    )

    assert body.scope_coverage.availability == "partial"
    assert [scope.freshness for scope in body.scope_coverage.scopes] == ["live", "stale"]
    assert body.result_set.availability == "partial"
    assert body.result_set.total_finding_count == 4
    assert body.result_set.reason_codes == ("checks_observation_stale:cluster-b",)
    assert body.visibility.availability == "partial"


def test_checks_projection_fails_closed_on_internally_conflicting_agent_evidence() -> None:
    snapshot = _snapshot(namespaces=["storefront"])
    observation = snapshot["summary"]["summary"]["checks_observation"]  # type: ignore[index]
    observation["findings"].append(  # type: ignore[index,union-attr]
        {
            "finding_id": "finding-outside-scope",
            "check_id": "service-selector",
            "category": "networking",
            "severity": "danger",
            "message": "Outside the declared observation scope.",
            "resource": {
                "api_group": "",
                "version": "v1",
                "kind": "Service",
                "namespace": "backoffice",
                "name": "admin",
                "uid": "uid-admin",
            },
        }
    )
    body = checks_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(("cluster-a", "storefront"),),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-17T05:59:30Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        snapshots={"cluster-a": snapshot},
        now=NOW,
    )

    assert body.result_set.availability == "unavailable"
    assert body.result_set.checks is None
    assert body.result_set.reason_codes == ("checks_observation_unavailable:cluster-a",)


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
        snapshots={"cluster-a": _snapshot(), "cluster-b": _snapshot()},
        now=NOW,
    )

    assert body.scope_coverage.availability == "partial"
    assert body.detail.requested_check_id == "workload-limits"
    assert body.detail.title == "Workload limits"
    assert body.detail.findings is not None
    assert body.detail.affected_resource_count == 2
    assert body.detail.availability == "partial"


def test_checks_projection_applies_user_policy_without_mutating_agent_evidence() -> None:
    snapshot = _snapshot()
    body = checks_overview(
        workspace_id="workspace-a",
        selected_cluster_ids=("cluster-a",),
        namespace_refs=(),
        contexts={
            "cluster-a": {
                "snapshot_revision": 8,
                "observed_at": "2026-07-17T05:59:30Z",
                "resources_complete": True,
                "labels_complete": True,
                "partial_reason_codes": [],
            }
        },
        snapshots={"cluster-a": snapshot},
        settings=ChecksSettingsPolicy(
            hidden_categories=("networking",),
            hidden_namespaces=("cluster-a/storefront",),
        ),
        now=NOW,
    )

    assert body.result_set.total_check_count == 1
    assert body.result_set.total_finding_count == 0
    assert body.catalog.entries is not None
    assert [entry.check_id for entry in body.catalog.entries] == ["workload-limits"]
    observation = snapshot["summary"]["summary"]["checks_observation"]  # type: ignore[index]
    assert len(observation["findings"]) == 2  # type: ignore[arg-type,index]
