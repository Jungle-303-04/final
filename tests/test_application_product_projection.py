from __future__ import annotations

from domains.applications.product_projection import (
    application_card,
    application_detail,
    deployment_history_projection,
    drift_projection,
    topology_projection,
)


def _application() -> dict[str, object]:
    return {
        "application_id": "app-1",
        "name": "checkout-api",
        "status": "active",
        "repo_ref": "org/checkout",
        "default_branch": "main",
        "manifest_path": "deploy/checkout.yaml",
        "metadata": {"credential_ref": "must-not-leak"},
    }


def _inventory() -> list[dict[str, object]]:
    return [
        {
            "id": "pod-1",
            "resource_type": "pod",
            "kind": "Pod",
            "name": "checkout-1",
            "status": "Running",
            "health": "healthy",
            "binding_complete": True,
            "summary": {
                "restart_total": 2,
                "conditions": [{"type": "Ready", "status": "True"}],
                "image": "ghcr.io/org/checkout:v2@sha256:abc",
                "secret": "must-not-leak",
            },
        },
        {
            "id": "service-1",
            "resource_type": "service",
            "kind": "Service",
            "name": "checkout",
            "status": "Ready",
            "health": "healthy",
            "binding_complete": True,
            "summary": {
                "external_url": "https://checkout.example.com",
                "token": "must-not-leak",
            },
        },
    ]


def _runs() -> list[dict[str, object]]:
    return [
        {
            "workflow_run_id": "run-1",
            "environment": "prod",
            "cluster_id": "cluster-1",
            "commit_sha": "abc123",
            "status": "succeeded",
            "summary": "checkout deployed",
            "metadata": {
                "version": "v2",
                "deployed_by": "user-1",
                "credential_ref": "must-not-leak",
            },
            "updated_at": "2026-07-14T10:00:00Z",
            "steps": [
                {
                    "name": "diff",
                    "updated_at": "2026-07-14T09:59:00Z",
                    "details": {
                        "resource": "deployment/checkout",
                        "status": "drift",
                        "has_changes": True,
                        "changes": [
                            {
                                "field_path": "spec.replicas",
                                "classification": "drift",
                                "live": 1,
                                "new_desired": 3,
                            },
                            {
                                "field_path": "spec.template.spec.containers[name=app].env.SECRET",
                                "classification": "drift",
                                "live": {"value": "actual-secret"},
                                "new_desired": {"value": "desired-secret"},
                            },
                            {
                                "field_path": "spec.selector",
                                "classification": "drift",
                                "live": {"app": "checkout"},
                                "new_desired": "checkout",
                            },
                        ],
                    },
                }
            ],
        }
    ]


def test_card_and_detail_use_only_allowlisted_observed_evidence() -> None:
    context = {
        "snapshot_revision": 42,
        "resources_complete": True,
        "application_bindings_complete": True,
    }
    incidents = {
        "complete": True,
        "open_count": 1,
        "items": [
            {
                "id": "incident-1",
                "title": "CrashLoopBackOff",
                "status": "incident_detected",
                "started_at": "2026-07-14T09:00:00Z",
                "updated_at": "2026-07-14T09:30:00Z",
            }
        ],
    }
    card = application_card(
        _application(),
        bindings=[{"cluster_id": "cluster-1", "environment": "prod"}],
        runs=_runs(),
        inventory_rows=_inventory(),
        inventory_context=context,
        incident_evidence=incidents,
    )
    detail = application_detail(
        _application(),
        bindings=[{"cluster_id": "cluster-1", "environment": "prod"}],
        runs=_runs(),
        inventory_rows=_inventory(),
        inventory_context=context,
        incident_evidence=incidents,
    )

    assert card["has_drift"] is True
    assert card["drift_summary"] == "3 fields differ"
    assert card["health"] == {
        "status": "healthy",
        "ready_pods": 1,
        "total_pods": 1,
        "restarts": 2,
    }
    assert card["runtime_readiness"] == {
        "completeness": "exact",
        "status": "healthy",
        "ready_pods": 1,
        "total_pods": 1,
        "restarts": 2,
    }
    assert card["delivery"] == {
        "availability": "available",
        "status": "succeeded",
        "workflow_run_id": "run-1",
        "observed_at": "2026-07-14T10:00:00Z",
    }
    assert card["batch_runtime"] == {
        "availability": "unavailable",
        "completeness": "unavailable",
        "status": None,
        "active_runs": None,
        "failed_runs": None,
        "succeeded_runs": None,
    }
    assert card["current_deployment"]["image_digest"] == "sha256:abc"
    assert detail["endpoints"] == [
        {
            "id": "service-1",
            "kind": "Service",
            "name": "checkout",
            "url": "https://checkout.example.com",
        }
    ]
    assert detail["recent_incidents"][0]["id"] == "incident-1"
    assert "secret" not in str(card).casefold()
    assert "credential" not in str(card).casefold()


def test_drift_projection_redacts_sensitive_or_complex_values() -> None:
    drift = drift_projection(_runs())

    assert drift["status"] == "drifted"
    replicas, secret, selector = drift["differences"]
    assert (replicas["old_value"], replicas["new_value"], replicas["value_redacted"]) == (
        3,
        1,
        False,
    )
    assert secret["old_value"] is None
    assert secret["new_value"] is None
    assert secret["value_redacted"] is True
    assert selector["old_value"] is None
    assert selector["new_value"] is None
    assert selector["value_redacted"] is True
    assert "actual-secret" not in str(drift)


def test_unknown_projection_remains_null_instead_of_inventing_zero_or_sync() -> None:
    card = application_card(
        _application(),
        bindings=[],
        runs=[],
        inventory_rows=[],
        inventory_context={"snapshot_revision": 0},
        incident_evidence={"complete": False, "open_count": None, "items": []},
    )

    assert card["health"]["status"] == "unknown"
    assert card["health"]["total_pods"] is None
    assert card["runtime_readiness"]["completeness"] == "unavailable"
    assert card["resource_counts"] is None
    assert card["resource_counts_completeness"] == "unavailable"
    assert card["open_incidents"] is None
    assert card["has_drift"] is None
    assert card["delivery"]["availability"] == "unavailable"
    assert card["batch_runtime"]["availability"] == "unavailable"


def test_delivery_and_batch_runtime_project_only_observed_latest_signals() -> None:
    context = {
        "snapshot_revision": 42,
        "resources_complete": True,
        "application_bindings_complete": True,
    }
    rows = _inventory() + [
        {
            "id": "job-1",
            "resource_type": "workload",
            "kind": "Job",
            "name": "checkout-migrate",
            "status": "Running",
            "health": "healthy",
            "binding_complete": True,
            "summary": {"active": 1, "failed": 0, "succeeded": 2},
        },
        {
            "id": "cronjob-1",
            "resource_type": "workload",
            "kind": "CronJob",
            "name": "checkout-sweep",
            "status": "Ready",
            "health": "healthy",
            "binding_complete": True,
            "summary": {"active": 0, "failed": 0, "succeeded": 3, "suspended": False},
        },
    ]
    failed_latest = {
        **_runs()[0],
        "workflow_run_id": "run-2",
        "status": "failed",
        "updated_at": "2026-07-14T11:00:00Z",
    }
    card = application_card(
        _application(),
        bindings=[],
        runs=[failed_latest, *_runs()],
        inventory_rows=rows,
        inventory_context=context,
        incident_evidence={"complete": False, "open_count": None, "items": []},
    )

    assert card["current_deployment"]["git_sha"] == "abc123"
    assert card["delivery"] == {
        "availability": "available",
        "status": "failed",
        "workflow_run_id": "run-2",
        "observed_at": "2026-07-14T11:00:00Z",
    }
    assert card["batch_runtime"] == {
        "availability": "available",
        "completeness": "exact",
        "status": "running",
        "active_runs": 1,
        "failed_runs": 0,
        "succeeded_runs": 5,
    }


def test_batch_runtime_does_not_coerce_missing_observed_counters_to_zero() -> None:
    card = application_card(
        _application(),
        bindings=[],
        runs=[],
        inventory_rows=[
            {
                "id": "job-1",
                "resource_type": "workload",
                "kind": "Job",
                "name": "checkout-migrate",
                "status": "Unknown",
                "health": "healthy",
                "binding_complete": True,
                "summary": {"active": 0},
            }
        ],
        inventory_context={
            "snapshot_revision": 42,
            "resources_complete": True,
            "application_bindings_complete": True,
        },
        incident_evidence={"complete": False, "open_count": None, "items": []},
    )

    assert card["batch_runtime"] == {
        "availability": "available",
        "completeness": "partial",
        "status": "unknown",
        "active_runs": None,
        "failed_runs": None,
        "succeeded_runs": None,
    }


def test_detail_projects_authorized_topology_history_and_source_evidence() -> None:
    context = {
        "snapshot_revision": 42,
        "observed_at": "2026-07-14T10:00:00Z",
        "resources_complete": True,
        "labels_complete": True,
        "application_bindings_complete": True,
        "partial_reason_codes": [],
    }
    rows = [
        {
            "id": "deployment-1",
            "cluster_id": "cluster-1",
            "resource_type": "workload",
            "api_version": "apps/v1",
            "kind": "Deployment",
            "namespace": "shop",
            "name": "checkout",
            "uid": "deployment-uid",
            "status": "Ready",
            "health": "healthy",
            "labels": {"app": "checkout"},
            "binding_complete": True,
            "summary": {"selector": {"matchLabels": {"app": "checkout"}}},
            "observed_at": "2026-07-14T10:00:00Z",
        },
        {
            "id": "pod-1",
            "cluster_id": "cluster-1",
            "resource_type": "pod",
            "api_version": "v1",
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-1",
            "uid": "pod-uid",
            "status": "Running",
            "health": "healthy",
            "labels": {"app": "checkout"},
            "binding_complete": True,
            "summary": {
                "owner_kind": "Deployment",
                "owner_name": "checkout",
                "owner_uid": "deployment-uid",
                "owner_references_complete": True,
                "conditions": [{"type": "Ready", "status": "True"}],
                "restart_total": 0,
            },
            "observed_at": "2026-07-14T10:00:00Z",
        },
    ]
    detail = application_detail(
        _application(),
        bindings=[{"cluster_id": "cluster-1", "environment": "prod"}],
        runs=_runs(),
        inventory_rows=rows,
        inventory_context=context,
        incident_evidence={
            "complete": True,
            "open_count": 0,
            "items": [
                {
                    "id": "incident-1",
                    "title": "Checkout latency",
                    "status": "open",
                    "started_at": "2026-07-14T10:01:00Z",
                    "updated_at": "2026-07-14T10:02:00Z",
                }
            ],
        },
    )

    assert detail["topology"]["completeness"] == "exact"
    assert detail["topology"]["nodes"] == [
        {
            "id": "deployment-1",
            "cluster_id": "cluster-1",
            "resource_type": "workload",
            "kind": "Deployment",
            "namespace": "shop",
            "name": "checkout",
            "status": "Ready",
            "health": "healthy",
            "observed_at": "2026-07-14T10:00:00Z",
        },
        {
            "id": "pod-1",
            "cluster_id": "cluster-1",
            "resource_type": "pod",
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-1",
            "status": "Running",
            "health": "healthy",
            "observed_at": "2026-07-14T10:00:00Z",
        },
    ]
    assert detail["topology"]["edges"][0]["type"] == "owns"
    assert detail["topology"]["edges"][0]["evidence_type"] == "owner_reference"
    assert detail["history"]["completeness"] == "partial"
    assert detail["history"]["partial_reason_codes"] == ["bounded_workflow_history"]
    assert detail["history"]["entries"][0]["type"] == "incident"
    assert detail["source"] == {
        "availability": "available",
        "completeness": "exact",
        "conflict": "conflict",
        "repository_ref": "org/checkout",
        "default_branch": "main",
        "manifest_path": "deploy/checkout.yaml",
        "partial_reason_codes": [],
    }
    assert "secret" not in str(detail).casefold()


def test_unavailable_topology_does_not_claim_empty_relationships() -> None:
    detail = application_detail(
        _application(),
        bindings=[],
        runs=[],
        inventory_rows=[],
        inventory_context={"snapshot_revision": 0},
        incident_evidence={"complete": False, "open_count": None, "items": []},
    )

    assert detail["topology"] == {
        "availability": "unavailable",
        "completeness": "unavailable",
        "observed_at": None,
        "nodes": None,
        "edges": None,
        "partial_reason_codes": [],
    }
    assert detail["history"]["entries"] == []
    assert detail["history"]["partial_reason_codes"] == [
        "bounded_workflow_history",
        "incident_source_incomplete",
    ]


def test_topology_bounds_multicluster_evidence_without_orphaning_edges() -> None:
    rows = [
        {
            "id": f"pod-{index:03d}",
            "cluster_id": "cluster-a" if index < 100 else "cluster-b",
            "resource_type": "pod",
            "api_version": "v1",
            "kind": "Pod",
            "namespace": "shop",
            "name": f"checkout-{index:03d}",
            "uid": f"pod-{index:03d}",
            "status": "Running",
            "health": "healthy",
            "labels": {"app": "checkout"},
            "binding_complete": True,
            "summary": {},
            "observed_at": "2026-07-14T10:00:00Z",
        }
        for index in range(201)
    ]

    topology = topology_projection(
        rows,
        inventory_context={
            "snapshot_revision": 42,
            "resources_complete": True,
            "labels_complete": True,
            "application_bindings_complete": True,
        },
        application_id="app-1",
    )

    assert len(topology["nodes"]) == 200
    assert topology["edges"] == []
    assert topology["completeness"] == "partial"
    assert topology["partial_reason_codes"] == ["application_topology_node_budget_exceeded"]


def test_deployment_history_does_not_invent_gitops_change_identity() -> None:
    deployments = deployment_history_projection(_runs())

    assert deployments[0]["id"] == "run-1"
    assert deployments[0]["gitops_change_id"] is None
    assert deployments[0]["status"] == "succeeded"
