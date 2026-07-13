from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import (
    IssueFilterFacetPageResponse,
    IssueFilterItem,
    IssueFilterResultsResponse,
)


def _counts() -> dict[str, object]:
    return {
        "filtered_count": 1,
        "unfiltered_count": 7,
        "filtered_count_completeness": "partial",
        "unfiltered_count_completeness": "partial",
    }


def _snapshot() -> dict[str, object]:
    return {
        "snapshot_revision": 43,
        "authorization_revision": "auth-revision-7",
        "filter_fingerprint": "issues-filter-fingerprint",
        "observed_at": "2026-07-13T23:40:00Z",
        "stale": False,
        "partial_reason_codes": ["mutable_timeline_projection"],
    }


def _capabilities() -> list[dict[str, object]]:
    return [
        {
            "axis": "clusters",
            "availability": "available",
            "reason_code": None,
            "source_semantics": "incident_event_cluster",
        },
        {
            "axis": "severity",
            "availability": "partial",
            "reason_code": "legacy_rows_may_omit_severity",
            "source_semantics": "incident_event_severity",
        },
        {
            "axis": "environment",
            "availability": "unavailable",
            "reason_code": "event_time_environment_not_projected",
            "source_semantics": "incident_event_time_snapshot",
        },
        {
            "axis": "applications",
            "availability": "unavailable",
            "reason_code": "event_time_application_binding_not_projected",
            "source_semantics": "incident_event_time_snapshot",
        },
        {
            "axis": "labels",
            "availability": "unavailable",
            "reason_code": "event_time_resource_labels_not_projected",
            "source_semantics": "incident_event_time_evidence_resource_snapshot",
        },
    ]


def _facets() -> list[dict[str, object]]:
    return [
        {
            "axis": "clusters",
            "value": "cluster-a",
            "label": "prod-eks",
            "match_count": 1,
            "count_completeness": "partial",
            "availability": "available",
        },
        {
            "axis": "namespaces",
            "value": "cluster-a/shop",
            "label": "shop",
            "match_count": 1,
            "count_completeness": "partial",
            "availability": "available",
        },
        {
            "axis": "applications",
            "value": "app-checkout",
            "label": "checkout",
            "match_count": None,
            "count_completeness": "unavailable",
            "availability": "unavailable",
        },
        {
            "axis": "severity",
            "value": "critical",
            "label": "Critical",
            "match_count": 1,
            "count_completeness": "partial",
            "availability": "available",
        },
        {
            "axis": "status",
            "value": "open",
            "label": "Open",
            "match_count": 1,
            "count_completeness": "partial",
            "availability": "available",
        },
        {
            "axis": "environment",
            "value": "production",
            "label": "Production",
            "match_count": None,
            "count_completeness": "unavailable",
            "availability": "unavailable",
        },
    ]


def _issue() -> dict[str, object]:
    return {
        "issue_id": "issue:cluster-a:incident-42",
        "detail_id": "incident-42",
        "correlation_id": "correlation-42",
        "cluster_id": "cluster-a",
        "namespace": "shop",
        "resource_kind": "Deployment",
        "resource_name": "checkout",
        "symptom": "CrashLoopBackOff",
        "severity": "critical",
        "issue_state": "open",
        "current_subject": "incidents.detected",
        "pipeline_status": "followup_required",
        "environment": None,
        "environment_completeness": "unavailable",
        "application_ids": [],
        "application_binding_completeness": "unavailable",
        "label_projection_completeness": "unavailable",
        "root_cause": None,
        "confidence": None,
        "updated_at": "2026-07-13T23:40:00Z",
    }


def test_issue_filter_routes_are_additive_and_preserve_dashboard_timeline() -> None:
    assert routes.DASHBOARD_RCA_TIMELINE_PATH == "/dashboard/rca/timeline"
    assert routes.ISSUES_FILTER_RESULTS_PATH == "/issues"
    assert routes.ISSUES_FILTER_FACETS_PATH == "/issues/filter-facets"
    assert routes.ISSUES_LABEL_FACETS_PATH == "/issues/label-facets"


def test_issue_filter_item_separates_list_and_detail_identity() -> None:
    item = IssueFilterItem.model_validate(_issue())

    assert item.issue_id == "issue:cluster-a:incident-42"
    assert item.detail_id == "incident-42"
    assert item.issue_id != item.detail_id
    assert item.cluster_id == "cluster-a"
    assert item.issue_state == "open"
    assert item.pipeline_status == "followup_required"

    issue_without_detail = _issue() | {"detail_id": None}
    assert IssueFilterItem.model_validate(issue_without_detail).detail_id is None


def test_issue_filter_results_are_strict_and_expose_honest_completeness() -> None:
    response = IssueFilterResultsResponse.model_validate(
        {
            "items": [_issue()],
            "next_cursor": "opaque-issues-cursor",
            "has_more": True,
            "counts": _counts(),
            "snapshot": _snapshot(),
            "facets": _facets(),
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
    assert response.counts.filtered_count_completeness == "partial"
    assert response.snapshot.partial_reason_codes == ["mutable_timeline_projection"]
    assert {facet.axis for facet in response.facets} == {
        "clusters",
        "namespaces",
        "applications",
        "severity",
        "status",
        "environment",
    }
    labels = next(capability for capability in response.capabilities if capability.axis == "labels")
    assert labels.availability == "unavailable"
    assert labels.reason_code == "event_time_resource_labels_not_projected"
    assert response.selected_labels[0].status == "unavailable"

    raw_issue = _issue() | {"payload": {"secret": "must-not-cross-the-contract"}}
    with pytest.raises(ValidationError):
        IssueFilterResultsResponse.model_validate(
            {
                "items": [raw_issue],
                "next_cursor": None,
                "has_more": False,
                "counts": _counts(),
                "snapshot": _snapshot(),
                "facets": [],
                "capabilities": _capabilities(),
                "selected_labels": [],
            }
        )


def test_issue_filter_facets_reuse_capability_and_unavailable_semantics() -> None:
    response = IssueFilterFacetPageResponse.model_validate(
        {
            "surface": "issues",
            "axis": "applications",
            "items": [_facets()[2]],
            "selected_resolutions": [
                {
                    "axis": "application",
                    "value": "app-checkout",
                    "status": "unavailable",
                    "display_label": None,
                }
            ],
            "next_cursor": None,
            "has_more": False,
            "counts": _counts(),
            "snapshot": _snapshot(),
            "capabilities": _capabilities(),
        }
    )

    assert response.items[0].axis == "applications"
    assert response.items[0].match_count is None
    assert response.items[0].count_completeness == "unavailable"
    assert response.items[0].availability == "unavailable"
    assert response.selected_resolutions[0].status == "unavailable"
    application_capability = next(
        capability for capability in response.capabilities if capability.axis == "applications"
    )
    assert application_capability.reason_code == "event_time_application_binding_not_projected"

    capability_without_reason = _capabilities()
    capability_without_reason[-1] = {
        **capability_without_reason[-1],
        "reason_code": None,
    }
    with pytest.raises(ValidationError):
        IssueFilterResultsResponse.model_validate(
            {
                "items": [],
                "next_cursor": None,
                "has_more": False,
                "counts": _counts(),
                "snapshot": _snapshot(),
                "facets": [],
                "capabilities": capability_without_reason,
                "selected_labels": [],
            }
        )
