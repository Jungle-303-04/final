from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import (
    ApplicationFilterFacetPageResponse,
    ApplicationFilterItem,
    ApplicationFilterResultsResponse,
)


def _item() -> dict[str, object]:
    return {
        "application_id": "app-checkout",
        "display_name": "checkout",
        "repository_ids": ["repo-shop"],
        "cluster_ids": ["cluster-a"],
        "namespace_refs": ["cluster-a/shop"],
        "environments": ["production"],
        "lifecycle_status": "active",
        "pending_promotion": True,
        "binding_count": 1,
        "updated_at": "2026-07-14T00:30:00Z",
        "binding_completeness": "partial",
        "label_projection_completeness": "unavailable",
    }


def _counts() -> dict[str, object]:
    return {
        "filtered_count": 1,
        "unfiltered_count": 4,
        "filtered_count_completeness": "partial",
        "unfiltered_count_completeness": "partial",
    }


def _snapshot() -> dict[str, object]:
    return {
        "snapshot_revision": 0,
        "authorization_revision": "auth-applications-1",
        "filter_fingerprint": "applications-filter-1",
        "observed_at": "2026-07-14T00:30:00Z",
        "stale": False,
        "partial_reason_codes": ["mutable_application_projection"],
    }


def _capabilities() -> list[dict[str, object]]:
    return [
        {
            "axis": "applications",
            "availability": "available",
            "reason_code": None,
            "source_semantics": "authorized_application_record",
        },
        {
            "axis": "clusters",
            "availability": "partial",
            "reason_code": "derived_deployment_binding_identity",
            "source_semantics": "authorized_deployment_binding",
        },
        {
            "axis": "labels",
            "availability": "unavailable",
            "reason_code": "application_label_projection_unavailable",
            "source_semantics": "application_resource_snapshot",
        },
    ]


def test_application_filter_routes_are_additive_and_preserve_legacy_list() -> None:
    assert routes.APPLICATIONS_PATH == "/applications"
    assert routes.APPLICATION_FILTER_RESULTS_PATH == "/applications/filter-results"
    assert routes.APPLICATION_FILTER_FACETS_PATH == "/applications/filter-facets"
    assert routes.APPLICATION_LABEL_FACETS_PATH == "/applications/label-facets"


def test_application_filter_item_is_provider_neutral_and_strict() -> None:
    item = ApplicationFilterItem.model_validate(_item())

    assert item.application_id == "app-checkout"
    assert item.pending_promotion is True
    assert item.binding_completeness == "partial"

    with pytest.raises(ValidationError):
        ApplicationFilterItem.model_validate(
            _item()
            | {
                "metadata": {"credential_ref": "secret"},
                "provider_payload": {"token": "must-not-cross-contract"},
            }
        )


def test_application_filter_response_exposes_counts_capabilities_and_completeness() -> None:
    response = ApplicationFilterResultsResponse.model_validate(
        {
            "items": [_item()],
            "next_cursor": None,
            "has_more": False,
            "counts": _counts(),
            "snapshot": _snapshot(),
            "facets": [],
            "capabilities": _capabilities(),
            "selected_labels": [
                {
                    "key": "team",
                    "value": "checkout",
                    "selector": "team=checkout",
                    "status": "unavailable",
                }
            ],
        }
    )

    assert response.counts.filtered_count == 1
    assert response.snapshot.partial_reason_codes == ["mutable_application_projection"]
    labels = next(item for item in response.capabilities if item.axis == "labels")
    assert labels.availability == "unavailable"
    assert response.selected_labels[0].status == "unavailable"


def test_application_facet_rejects_count_for_unavailable_axis() -> None:
    with pytest.raises(ValidationError):
        ApplicationFilterFacetPageResponse.model_validate(
            {
                "surface": "applications",
                "axis": "environment",
                "items": [
                    {
                        "axis": "environment",
                        "value": "production",
                        "label": "production",
                        "match_count": 1,
                        "count_completeness": "unavailable",
                        "availability": "unavailable",
                    }
                ],
                "selected_resolutions": [],
                "next_cursor": None,
                "has_more": False,
                "counts": _counts(),
                "snapshot": _snapshot(),
                "capabilities": _capabilities(),
            }
        )
