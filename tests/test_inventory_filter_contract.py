from __future__ import annotations

import pytest

from domains.inventory_filter.cursor import (
    CursorScope,
    FilterCursorCodec,
    authorization_revision,
)
from domains.inventory_filter.query import parse_resource_filters


def test_filter_parser_preserves_exact_namespace_pairs_and_label_and_semantics() -> None:
    filters = parse_resource_filters(
        clusters="tenant/eu/prod,cluster-b,cluster-b",
        namespaces="tenant/eu/prod/shop,cluster-b/default",
        applications="app-b,app-a",
        resource_types="Pod,workload",
        health="degraded,healthy",
        labels="team=checkout,tier=critical,team=payments,empty=",
        query=" api ",
        include_deleted=False,
    )

    assert filters.clusters == ("cluster-b", "tenant/eu/prod")
    assert filters.namespaces == (
        ("cluster-b", "default"),
        ("tenant/eu/prod", "shop"),
    )
    assert filters.applications == ("app-a", "app-b")
    assert filters.resource_types == ("pod", "workload")
    assert filters.health == ("degraded", "healthy")
    assert filters.labels == (
        ("empty", ""),
        ("team", "checkout"),
        ("team", "payments"),
        ("tier", "critical"),
    )
    assert filters.query == "api"


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("namespaces", "missing-slash"),
        ("namespaces", "/default"),
        ("labels", "missing-equals"),
        ("labels", "=missing-key"),
        ("clusters", "cluster-a,,cluster-b"),
    ],
)
def test_filter_parser_rejects_ambiguous_or_empty_tokens(field: str, value: str) -> None:
    kwargs = {
        "clusters": None,
        "namespaces": None,
        "applications": None,
        "resource_types": None,
        "health": None,
        "labels": None,
        "query": None,
        "include_deleted": False,
    }
    kwargs[field] = value

    with pytest.raises(ValueError):
        parse_resource_filters(**kwargs)


@pytest.mark.parametrize(
    "selector",
    (
        "UPPER.example.com/team=checkout",
        "bad_prefix_/team=checkout",
        "team/=checkout",
        "team=contains spaces",
        "team=value/with/slash",
        f"{'x' * 64}=checkout",
        f"team={'x' * 64}",
    ),
)
def test_filter_parser_rejects_non_kubernetes_label_selectors(selector: str) -> None:
    with pytest.raises(ValueError, match="label selector"):
        parse_resource_filters(
            clusters=None,
            namespaces=None,
            applications=None,
            resource_types=None,
            health=None,
            labels=selector,
            query=None,
            include_deleted=False,
        )


def test_filter_cursor_is_signed_and_bound_to_auth_filter_surface_and_snapshot() -> None:
    codec = FilterCursorCodec("cursor-test-secret-32-bytes-minimum!!", now=lambda: 1_000)
    scope = CursorScope(
        workspace_id="workspace-a",
        user_id="user-a",
        authorization_revision="auth-1",
        surface="resources",
        filter_fingerprint="filter-1",
        snapshot_revision=42,
        facet_query=None,
    )
    token = codec.encode(scope, position={"inventory_key": "resource-1"})

    assert "resource-1" not in token
    assert codec.decode(token, expected=scope).position == {"inventory_key": "resource-1"}

    payload, signature = token.split(".", 1)
    tampered = f"{payload[:-1]}A.{signature}"
    with pytest.raises(ValueError, match="cursor is invalid"):
        codec.decode(tampered, expected=scope)

    with pytest.raises(ValueError, match="cursor scope changed"):
        codec.decode(
            token,
            expected=CursorScope(
                workspace_id="workspace-a",
                user_id="user-a",
                authorization_revision="auth-2",
                surface="resources",
                filter_fingerprint="filter-1",
                snapshot_revision=42,
                facet_query=None,
            ),
        )


def test_authorization_revision_is_order_independent_and_principal_bound() -> None:
    first = authorization_revision(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("observer", "user"),
        allowed_cluster_ids={"cluster-b", "cluster-a"},
        allowed_application_ids={"app-b", "app-a"},
    )
    second = authorization_revision(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user", "observer"),
        allowed_cluster_ids={"cluster-a", "cluster-b"},
        allowed_application_ids={"app-a", "app-b"},
    )

    assert first == second
    assert first != authorization_revision(
        user_id="user-b",
        workspace_id="workspace-a",
        roles=("user", "observer"),
        allowed_cluster_ids={"cluster-a", "cluster-b"},
        allowed_application_ids={"app-a", "app-b"},
    )
