from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import (
    FilteredInventoryResourceListResponse,
    GlobalFilterFacetsResponse,
    LabelFacetPageResponse,
    ResourceFilterFacetPageResponse,
)


def _snapshot() -> dict[str, object]:
    return {
        "snapshot_revision": 42,
        "authorization_revision": "auth-revision-1",
        "filter_fingerprint": "filter-fingerprint-1",
        "observed_at": "2026-07-13T20:20:00Z",
        "stale": False,
        "partial_reason_codes": [],
    }


def _resource() -> dict[str, object]:
    return {
        "inventory_key": "cluster-a:apps/v1:Deployment:shop:checkout",
        "snapshot_id": "snapshot-42",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "api_version": "apps/v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout",
        "status": "Ready",
        "health": "healthy",
        "labels": {"team": "checkout"},
        "annotations": {},
        "summary": {"ready_replicas": 3},
    }


def test_inventory_filter_route_constants_are_additive_and_canonical() -> None:
    assert routes.RESOURCES_FILTER_FACETS_PATH == "/resources/filter-facets"
    assert routes.FILTERED_RESOURCES_PATH == "/resources"
    assert routes.RESOURCE_LABEL_FACETS_PATH == "/resources/label-facets"
    assert routes.FILTER_FACETS_PATH == "/filter-facets"


def test_global_filter_facets_model_count_completeness_without_false_zero() -> None:
    response = GlobalFilterFacetsResponse.model_validate(
        {
            "clusters": [
                {
                    "id": "cluster-a",
                    "label": "prod-eks",
                    "count": 18,
                    "count_completeness": "exact",
                }
            ],
            "namespaces": [
                {
                    "id": "cluster-a/shop",
                    "label": "shop",
                    "cluster_id": "cluster-a",
                    "count": 4,
                    "count_completeness": "partial",
                }
            ],
            "applications": [],
            "resource_types": [
                {
                    "id": "pod",
                    "label": "Pod",
                    "count": 12,
                    "count_completeness": "exact",
                }
            ],
            "labels": [
                {
                    "key": "team",
                    "value": "checkout",
                    "count": None,
                    "count_completeness": "unavailable",
                }
            ],
            "resources": [
                {
                    "id": "deployment:shop/checkout",
                    "label": "checkout",
                    "kind": "Deployment",
                    "count": 1,
                    "count_completeness": "exact",
                }
            ],
        }
    )

    assert response.namespaces[0].cluster_id == "cluster-a"
    assert response.namespaces[0].count_completeness == "partial"
    assert response.labels[0].count is None
    assert response.resource_types[0].id == "pod"
    assert response.resources[0].kind == "Deployment"


def test_structural_facet_page_models_each_axis_and_selection_resolution() -> None:
    response = ResourceFilterFacetPageResponse.model_validate(
        {
            "axis": "namespaces",
            "items": [
                {
                    "axis": "cluster",
                    "value": "cluster-a",
                    "cluster_id": "cluster-a",
                    "name": "prod-eks",
                    "provider": "eks",
                    "availability": "available",
                },
                {
                    "axis": "namespace",
                    "value": "cluster-a/shop",
                    "cluster_id": "cluster-a",
                    "namespace": "shop",
                    "availability": "available",
                },
                {
                    "axis": "application",
                    "value": "app-checkout",
                    "application_id": "app-checkout",
                    "name": "checkout",
                    "environment": "production",
                    "availability": "available",
                },
            ],
            "selected_resolutions": [
                {
                    "axis": "namespace",
                    "value": "cluster-a/restricted",
                    "status": "restricted",
                    "display_label": None,
                }
            ],
            "next_cursor": "opaque-cursor",
            "has_more": True,
            "snapshot": _snapshot(),
        }
    )

    assert response.items[0].axis == "cluster"
    assert response.items[1].value == "cluster-a/shop"
    assert response.items[2].application_id == "app-checkout"
    assert response.selected_resolutions[0].status == "restricted"


def test_filtered_resource_page_reuses_strict_resource_and_exposes_counts() -> None:
    response = FilteredInventoryResourceListResponse.model_validate(
        {
            "items": [
                {
                    "resource": _resource(),
                    "cluster": {
                        "cluster_id": "cluster-a",
                        "name": "prod-eks",
                        "provider": "eks",
                    },
                    "application_ids": ["app-checkout"],
                    "application_binding_completeness": "exact",
                }
            ],
            "next_cursor": None,
            "has_more": False,
            "counts": {
                "filtered_count": 18,
                "unfiltered_count": 92,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "snapshot": _snapshot(),
        }
    )

    assert response.items[0].resource.name == "checkout"
    assert response.items[0].cluster.cluster_id == "cluster-a"
    assert response.counts.filtered_count == 18

    raw_resource = _resource() | {"raw": {"data": "must-not-cross-the-contract"}}
    with pytest.raises(ValidationError):
        FilteredInventoryResourceListResponse.model_validate(
            {
                "items": [
                    {
                        "resource": raw_resource,
                        "cluster": {
                            "cluster_id": "cluster-a",
                            "name": "prod-eks",
                            "provider": "eks",
                        },
                        "application_ids": [],
                        "application_binding_completeness": "unavailable",
                    }
                ],
                "next_cursor": None,
                "has_more": False,
                "counts": {
                    "filtered_count": None,
                    "unfiltered_count": None,
                    "filtered_count_completeness": "unavailable",
                    "unfiltered_count_completeness": "unavailable",
                },
                "snapshot": _snapshot(),
            }
        )


def test_filtered_resource_metric_evidence_rejects_cross_snapshot_or_uid_join() -> None:
    resource = {
        **_resource(),
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "uid": "uid-checkout",
        "summary": {"phase": "Running"},
    }
    metrics = {
        "kind": "pod",
        "resource_uid": "uid-checkout",
        "source_snapshot_id": "snapshot-42",
        "observed_at": "2026-07-17T01:00:00Z",
        "measurement_window": "30s",
        "cpu_mcores": 250,
        "memory_mib": 192,
        "cpu_request_mcores": 150,
        "cpu_limit_mcores": 600,
        "memory_request_mib": 192,
        "memory_limit_mib": 384,
        "completeness": "exact",
        "reason_codes": [],
    }

    def payload(candidate: dict[str, object]) -> dict[str, object]:
        return {
            "items": [
                {
                    "resource": resource,
                    "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
                    "application_ids": [],
                    "application_binding_completeness": "exact",
                    "metrics": candidate,
                }
            ],
            "next_cursor": None,
            "has_more": False,
            "counts": {
                "filtered_count": 1,
                "unfiltered_count": 1,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "snapshot": _snapshot(),
        }

    parsed = FilteredInventoryResourceListResponse.model_validate(payload(metrics))
    assert parsed.items[0].metrics.cpu_limit_mcores == 600

    with pytest.raises(ValidationError):
        FilteredInventoryResourceListResponse.model_validate(
            payload({**metrics, "resource_uid": "uid-other"})
        )
    with pytest.raises(ValidationError):
        FilteredInventoryResourceListResponse.model_validate(
            payload({**metrics, "source_snapshot_id": "snapshot-other"})
        )


def test_label_facet_page_models_and_counts_selected_labels() -> None:
    response = LabelFacetPageResponse.model_validate(
        {
            "surface": "resources",
            "items": [
                {
                    "key": "team",
                    "value": "checkout",
                    "selector": "team=checkout",
                    "match_count": 18,
                    "count_completeness": "exact",
                }
            ],
            "selected_resolutions": [
                {
                    "key": "environment",
                    "value": "staging",
                    "selector": "environment=staging",
                    "status": "zero",
                },
                {
                    "key": "secret.example/key",
                    "value": "redacted",
                    "selector": "secret.example/key=redacted",
                    "status": "restricted",
                },
            ],
            "next_cursor": None,
            "has_more": False,
            "counts": {
                "filtered_count": 18,
                "unfiltered_count": 92,
                "filtered_count_completeness": "exact",
                "unfiltered_count_completeness": "exact",
            },
            "snapshot": _snapshot(),
        }
    )

    assert response.items[0].selector == "team=checkout"
    assert response.selected_resolutions[0].status == "zero"
    assert response.selected_resolutions[1].status == "restricted"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("filtered_count", -1),
        ("unfiltered_count", -1),
    ],
)
def test_filter_counts_reject_negative_values(field: str, value: int) -> None:
    counts = {
        "filtered_count": 1,
        "unfiltered_count": 1,
        "filtered_count_completeness": "exact",
        "unfiltered_count_completeness": "exact",
    }
    counts[field] = value

    with pytest.raises(ValidationError):
        LabelFacetPageResponse.model_validate(
            {
                "surface": "resources",
                "items": [],
                "selected_resolutions": [],
                "next_cursor": None,
                "has_more": False,
                "counts": counts,
                "snapshot": _snapshot(),
            }
        )
