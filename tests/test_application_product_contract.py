from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import (
    ApplicationDeploymentHistoryResponse,
    ApplicationDriftResponse,
    ApplicationProductDetailResponse,
    ApplicationProductListResponse,
)


def _card() -> dict[str, object]:
    return {
        "id": "app-1",
        "name": "checkout-api",
        "environments": ["prod"],
        "lifecycle_status": "active",
        "repository_ref": "org/checkout",
        "default_branch": "main",
        "manifest_path": "deploy/checkout.yaml",
        "health": {"status": "healthy", "ready_pods": 2, "total_pods": 2, "restarts": 0},
        "runtime_readiness": {
            "completeness": "exact",
            "status": "healthy",
            "ready_pods": 2,
            "total_pods": 2,
            "restarts": 0,
        },
        "current_deployment": {
            "version": "v2.4.1",
            "image": "ghcr.io/org/checkout:v2.4.1@sha256:abc",
            "image_digest": "sha256:abc",
            "git_sha": "abc123",
            "deployed_at": "2026-07-14T10:00:00Z",
            "deployed_by": "user-1",
        },
        "delivery": {
            "availability": "available",
            "status": "succeeded",
            "workflow_run_id": "run-1",
            "observed_at": "2026-07-14T10:00:00Z",
        },
        "batch_runtime": {
            "availability": "unavailable",
            "completeness": "unavailable",
            "status": None,
            "active_runs": None,
            "failed_runs": None,
            "succeeded_runs": None,
        },
        "has_drift": False,
        "drift_summary": None,
        "resource_counts": [{"kind": "Deployment", "count": 1}, {"kind": "Pod", "count": 2}],
        "resource_counts_completeness": "exact",
        "open_incidents": 0,
    }


def _detail_evidence() -> dict[str, object]:
    return {
        "topology": {
            "availability": "available",
            "completeness": "exact",
            "observed_at": "2026-07-14T10:00:00Z",
            "nodes": [
                {
                    "id": "workload-a",
                    "cluster_id": "cluster-a",
                    "resource_type": "workload",
                    "kind": "Deployment",
                    "namespace": "shop",
                    "name": "checkout",
                    "status": "Ready",
                    "health": "healthy",
                    "observed_at": "2026-07-14T10:00:00Z",
                },
                {
                    "id": "pod-a",
                    "cluster_id": "cluster-a",
                    "resource_type": "pod",
                    "kind": "Pod",
                    "namespace": "shop",
                    "name": "checkout-a",
                    "status": "Running",
                    "health": "healthy",
                    "observed_at": "2026-07-14T10:00:00Z",
                },
            ],
            "edges": [
                {
                    "id": "edge-a",
                    "from_id": "workload-a",
                    "to_id": "pod-a",
                    "type": "owns",
                    "evidence_type": "owner_reference",
                    "authority": "authoritative",
                    "observed_at": "2026-07-14T10:00:00Z",
                }
            ],
            "partial_reason_codes": [],
        },
        "history": {
            "availability": "available",
            "completeness": "partial",
            "entries": [
                {
                    "id": "delivery:run-1",
                    "type": "delivery",
                    "status": "succeeded",
                    "summary": "checkout deployed",
                    "occurred_at": "2026-07-14T10:00:00Z",
                    "workflow_run_id": "run-1",
                    "gitops_change_id": None,
                }
            ],
            "partial_reason_codes": ["bounded_workflow_history"],
        },
        "source": {
            "availability": "available",
            "completeness": "exact",
            "conflict": "unknown",
            "repository_ref": "org/checkout",
            "default_branch": "main",
            "manifest_path": "deploy/checkout.yaml",
            "partial_reason_codes": [],
        },
    }


def test_application_product_contracts_are_strict_and_provider_neutral() -> None:
    response = ApplicationProductListResponse.model_validate({"applications": [_card()]})

    assert routes.APPLICATION_DRIFT_PATH == "/applications/{application_id}/drift"
    assert response.applications[0].health.ready_pods == 2
    assert response.applications[0].delivery.workflow_run_id == "run-1"
    with pytest.raises(ValidationError):
        ApplicationProductListResponse.model_validate(
            {
                "applications": [
                    _card()
                    | {
                        "metadata": {"credential_ref": "secret"},
                        "provider_payload": {"token": "must-not-cross-contract"},
                    }
                ]
            }
        )


def test_application_detail_requires_honest_completeness_and_bounded_activity() -> None:
    detail = ApplicationProductDetailResponse.model_validate(
        {
            "application": _card()
            | {
                "endpoints": [],
                "endpoints_completeness": "exact",
                "recent_incidents": [],
                "recent_activity": [],
                **_detail_evidence(),
            }
        }
    )
    assert detail.application.endpoints == []

    with pytest.raises(ValidationError):
        ApplicationProductDetailResponse.model_validate(
            {
                "application": _card()
                | {
                    "endpoints": [],
                    "endpoints_completeness": "unavailable",
                    "recent_incidents": [],
                    "recent_activity": [],
                    **_detail_evidence(),
                }
            }
        )


def test_application_runtime_delivery_and_batch_contracts_require_honest_availability() -> None:
    invalid_cards = [
        _card()
        | {
            "runtime_readiness": {
                "completeness": "unavailable",
                "status": "healthy",
                "ready_pods": 1,
                "total_pods": 1,
                "restarts": 0,
            }
        },
        _card()
        | {
            "delivery": {
                "availability": "unavailable",
                "status": "failed",
                "workflow_run_id": "run-2",
                "observed_at": None,
            }
        },
        _card()
        | {
            "batch_runtime": {
                "availability": "available",
                "completeness": "unavailable",
                "status": None,
                "active_runs": None,
                "failed_runs": None,
                "succeeded_runs": None,
            }
        },
    ]

    for card in invalid_cards:
        with pytest.raises(ValidationError):
            ApplicationProductListResponse.model_validate({"applications": [card]})


def test_application_detail_topology_history_and_source_require_authorized_evidence() -> None:
    detail = _card() | {
        "endpoints": [],
        "endpoints_completeness": "exact",
        "recent_incidents": [],
        "recent_activity": [],
        **_detail_evidence(),
    }
    invalid_details = [
        detail
        | {
            "topology": detail["topology"]
            | {"edges": [detail["topology"]["edges"][0] | {"to_id": "missing"}]}
        },
        detail
        | {
            "history": detail["history"]
            | {"entries": [detail["history"]["entries"][0] | {"workflow_run_id": None}]}
        },
        detail | {"source": detail["source"] | {"availability": "unavailable"}},
    ]

    for invalid_detail in invalid_details:
        with pytest.raises(ValidationError):
            ApplicationProductDetailResponse.model_validate({"application": invalid_detail})


def test_deployment_and_drift_contracts_reject_raw_or_complex_values() -> None:
    history = ApplicationDeploymentHistoryResponse.model_validate(
        {
            "deployments": [
                {
                    "id": "run-1",
                    "environment": "prod",
                    "cluster_id": "cluster-1",
                    "git_sha": "abc123",
                    "version": None,
                    "deployed_at": None,
                    "deployed_by": None,
                    "status": "succeeded",
                    "gitops_change_id": None,
                }
            ]
        }
    )
    assert history.deployments[0].status == "succeeded"

    drift = ApplicationDriftResponse.model_validate(
        {
            "status": "drifted",
            "summary": "1 field differs",
            "differences": [
                {
                    "resource": "deployment/checkout",
                    "field_path": "spec.replicas",
                    "old_value": 3,
                    "new_value": 1,
                    "value_redacted": False,
                    "changed_by": None,
                    "changed_at": None,
                }
            ],
            "observed_at": "2026-07-14T10:00:00Z",
        }
    )
    assert drift.differences[0].new_value == 1

    with pytest.raises(ValidationError):
        ApplicationDriftResponse.model_validate(
            {
                "status": "drifted",
                "summary": "1 field differs",
                "differences": [
                    {
                        "resource": "deployment/checkout",
                        "field_path": "spec.template.spec.containers.env",
                        "old_value": {"TOKEN": "secret"},
                        "new_value": None,
                        "value_redacted": False,
                        "changed_by": None,
                        "changed_at": None,
                    }
                ],
                "observed_at": None,
            }
        )
