from __future__ import annotations

from domains.issue_filter.query import (
    issue_filter_fingerprint,
    parse_issue_filters,
    selected_facet_values,
    without_facet_axis,
)


def _filters(**overrides: str | None):
    values: dict[str, str | None] = {
        "clusters": "cluster-b,cluster-a",
        "namespaces": "cluster-a/shop",
        "applications": "app-b,app-a",
        "severities": "Critical,warning",
        "statuses": "Open,acknowledged",
        "environments": "Production,staging",
        "labels": "team=checkout",
        "query": " Checkout ",
    }
    values.update(overrides)
    return parse_issue_filters(**values)


def test_issue_filters_normalize_common_and_surface_axes() -> None:
    filters = _filters()

    assert filters.clusters == ("cluster-a", "cluster-b")
    assert filters.applications == ("app-a", "app-b")
    assert filters.severities == ("critical", "warning")
    assert filters.statuses == ("acknowledged", "open")
    assert filters.environments == ("production", "staging")
    assert filters.labels == (("team", "checkout"),)
    assert filters.query == "Checkout"


def test_issue_fingerprint_and_facet_removal_cover_surface_axes() -> None:
    baseline = _filters()

    assert issue_filter_fingerprint(_filters(statuses="closed")) != issue_filter_fingerprint(
        baseline
    )
    without_status = without_facet_axis(baseline, "status")
    assert without_status.statuses == ()
    assert without_status.severities == baseline.severities
    assert selected_facet_values(baseline, "environment") == ("production", "staging")


def test_issue_surface_axes_reject_control_characters() -> None:
    try:
        _filters(statuses="open\nsecret")
    except ValueError as exc:
        assert "unsafe control characters" in str(exc)
    else:
        raise AssertionError("unsafe issue filter value must fail closed")
