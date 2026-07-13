from __future__ import annotations

from domains.application_filter.query import (
    application_filter_fingerprint,
    parse_application_filters,
    selected_facet_values,
    without_facet_axis,
)


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-b,cluster-a,cluster-b",
        "namespaces": "cluster-b/default,cluster-a/shop",
        "applications": "app-b,app-a",
        "environments": "Production,staging,production",
        "statuses": "Active,paused",
        "pending_promotion": "true",
        "labels": "team=checkout,tier=api",
        "query": " Checkout ",
    }
    values.update(overrides)
    return parse_application_filters(**values)


def test_application_filters_normalize_common_and_surface_axes() -> None:
    filters = _filters()

    assert filters.clusters == ("cluster-a", "cluster-b")
    assert filters.namespaces == (("cluster-a", "shop"), ("cluster-b", "default"))
    assert filters.applications == ("app-a", "app-b")
    assert filters.environments == ("production", "staging")
    assert filters.statuses == ("active", "paused")
    assert filters.pending_promotion is True
    assert filters.labels == (("team", "checkout"), ("tier", "api"))
    assert filters.query == "Checkout"


def test_application_filter_fingerprint_covers_surface_axes() -> None:
    baseline = application_filter_fingerprint(_filters())

    assert application_filter_fingerprint(_filters(statuses="failed")) != baseline
    assert application_filter_fingerprint(_filters(pending_promotion="false")) != baseline


def test_application_facet_removes_only_requested_axis() -> None:
    filters = _filters()
    without_environment = without_facet_axis(filters, "environment")

    assert without_environment.environments == ()
    assert without_environment.statuses == filters.statuses
    assert without_environment.pending_promotion is True
    assert selected_facet_values(filters, "pending_promotion") == ("true",)


def test_application_pending_promotion_rejects_non_boolean_value() -> None:
    try:
        _filters(pending_promotion="sometimes")
    except ValueError as exc:
        assert "pending promotion" in str(exc)
    else:
        raise AssertionError("invalid pending promotion must fail closed")
