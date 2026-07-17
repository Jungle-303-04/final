from __future__ import annotations

from domains.gitops_filter.query import (
    gitops_filter_fingerprint,
    parse_gitops_filters,
    selected_facet_values,
    without_facet_axis,
)


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-b,cluster-a",
        "namespaces": "cluster-a/shop",
        "applications": "app-b,app-a",
        "environments": "Production,staging",
        "approvals": "Pending,approved",
        "change_types": "Image,config",
        "labels": "team=checkout",
        "query": " Checkout ",
    }
    values.update(overrides)
    return parse_gitops_filters(**values)


def test_gitops_filters_normalize_common_and_surface_axes() -> None:
    filters = _filters()

    assert filters.clusters == ("cluster-a", "cluster-b")
    assert filters.applications == ("app-a", "app-b")
    assert filters.environments == ("production", "staging")
    assert filters.approvals == ("approved", "pending")
    assert filters.change_types == ("config", "image")
    assert filters.labels == (("team", "checkout"),)
    assert filters.query == "Checkout"


def test_gitops_fingerprint_and_facet_removal_cover_surface_axes() -> None:
    baseline = _filters()

    assert gitops_filter_fingerprint(_filters(approvals="rejected")) != (
        gitops_filter_fingerprint(baseline)
    )
    without_approval = without_facet_axis(baseline, "approval")
    assert without_approval.approvals == ()
    assert without_approval.environments == baseline.environments
    assert selected_facet_values(baseline, "change_type") == ("config", "image")


def test_gitops_surface_axes_reject_control_characters() -> None:
    try:
        _filters(approvals="pending\nsecret")
    except ValueError as exc:
        assert "unsafe control characters" in str(exc)
    else:
        raise AssertionError("unsafe GitOps filter value must fail closed")
