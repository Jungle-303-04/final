from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import (
    GitOpsFilterItem,
    GitOpsFilterResultsResponse,
)


def _item() -> dict[str, object]:
    return {
        "change_id": "run-1",
        "application_id": "app-1",
        "repository_id": "repo-1",
        "binding_id": "binding-1",
        "cluster_id": "cluster-1",
        "namespace": "shop",
        "environment": "production",
        "revision": "abc123",
        "status": "waiting_for_approval",
        "current_step": "approval",
        "approval_status": "pending",
        "change_type": None,
        "summary": "checkout rollout",
        "updated_at": "2026-07-14T03:00:00Z",
        "change_type_completeness": "unavailable",
        "label_projection_completeness": "unavailable",
    }


def _counts() -> dict[str, object]:
    return {
        "filtered_count": 1,
        "unfiltered_count": 1,
        "filtered_count_completeness": "partial",
        "unfiltered_count_completeness": "partial",
    }


def _snapshot() -> dict[str, object]:
    return {
        "snapshot_revision": 0,
        "authorization_revision": "auth-1",
        "filter_fingerprint": "filter-1",
        "observed_at": "2026-07-14T03:00:00Z",
        "stale": False,
        "partial_reason_codes": ["mutable_gitops_projection"],
    }


def test_gitops_filter_routes_are_additive() -> None:
    assert routes.GITOPS_FILTER_RESULTS_PATH == "/gitops/filter-results"
    assert routes.GITOPS_FILTER_FACETS_PATH == "/gitops/filter-facets"


def test_gitops_item_is_provider_neutral_and_strict() -> None:
    item = GitOpsFilterItem.model_validate(_item())

    assert item.change_id == "run-1"
    assert item.approval_status == "pending"

    with pytest.raises(ValidationError):
        GitOpsFilterItem.model_validate(
            _item()
            | {
                "credential_ref": "secret",
                "provider_payload": {"token": "must-not-cross-contract"},
            }
        )


def test_gitops_response_exposes_unavailable_change_type_and_labels() -> None:
    response = GitOpsFilterResultsResponse.model_validate(
        {
            "items": [_item()],
            "next_cursor": None,
            "has_more": False,
            "counts": _counts(),
            "snapshot": _snapshot(),
            "facets": [],
            "capabilities": [
                {
                    "axis": "approval",
                    "availability": "available",
                    "reason_code": None,
                    "source_semantics": "latest_workflow_approval",
                },
                {
                    "axis": "change_type",
                    "availability": "unavailable",
                    "reason_code": "gitops_change_type_projection_unavailable",
                    "source_semantics": "workflow_diff_projection",
                },
                {
                    "axis": "labels",
                    "availability": "unavailable",
                    "reason_code": "gitops_label_projection_unavailable",
                    "source_semantics": "desired_manifest_resource_snapshot",
                },
            ],
            "selected_labels": [],
        }
    )

    assert response.items[0].change_type is None
    assert next(cap for cap in response.capabilities if cap.axis == "change_type").availability == (
        "unavailable"
    )
