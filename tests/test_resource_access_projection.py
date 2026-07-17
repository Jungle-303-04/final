from __future__ import annotations

import pytest

from domains.resource_access.projection import (
    ResourceAccessUnavailable,
    namespace_access_projection,
    resource_access_projection,
    role_access_projection,
    subject_access_projection,
)


def exact_access_snapshot() -> dict[str, object]:
    return {
        "completeness": "exact",
        "observed_at": "2026-07-17T00:00:00+00:00",
        "reason_codes": [],
        "roles": [
            {
                "kind": "Role",
                "namespace": "shop",
                "name": "reader",
                "rules": [{"verbs": ["get", "list"], "apiGroups": [""], "resources": ["pods"]}],
            }
        ],
        "cluster_roles": [
            {
                "kind": "ClusterRole",
                "namespace": "",
                "name": "view",
                "rules": [{"verbs": ["get"], "apiGroups": ["apps"], "resources": ["deployments"]}],
            }
        ],
        "role_bindings": [
            {
                "kind": "RoleBinding",
                "namespace": "shop",
                "name": "reader-binding",
                "roleRef": {"kind": "Role", "name": "reader"},
                "subjects": [{"kind": "ServiceAccount", "namespace": "shop", "name": "checkout"}],
            }
        ],
        "cluster_role_bindings": [
            {
                "kind": "ClusterRoleBinding",
                "namespace": "",
                "name": "authenticated-view",
                "roleRef": {"kind": "ClusterRole", "name": "view"},
                "subjects": [{"kind": "Group", "namespace": "", "name": "system:authenticated"}],
            },
            {
                "kind": "ClusterRoleBinding",
                "namespace": "",
                "name": "shop-view",
                "roleRef": {"kind": "ClusterRole", "name": "view"},
                "subjects": [{"kind": "ServiceAccount", "namespace": "shop", "name": "checkout"}],
            },
        ],
        "service_accounts": [
            {"namespace": "shop", "name": "checkout"},
            {"namespace": "shop", "name": "default"},
        ],
        "pod_subjects": [
            {
                "uid": "pod-checkout-7d9",
                "namespace": "shop",
                "name": "checkout-7d9",
                "service_account_name": "checkout",
            },
        ],
    }


def test_service_account_projection_reuses_direct_and_implicit_group_bindings() -> None:
    result = subject_access_projection(
        exact_access_snapshot(),
        kind="ServiceAccount",
        namespace="shop",
        name="checkout",
    )

    assert result.subject.model_dump() == {
        "kind": "ServiceAccount",
        "namespace": "shop",
        "name": "checkout",
    }
    assert [item.binding.name for item in result.direct] == [
        "reader-binding",
        "shop-view",
    ]
    assert [item.group_name for item in result.inherited_from_groups] == [
        "system:authenticated",
    ]
    assert result.used_by_pods[0].name == "checkout-7d9"
    assert result.truncated is False
    assert {tuple(rule.verbs) for rule in result.flat} == {("get", "list"), ("get",)}


def test_role_and_namespace_projections_share_one_inverse_index() -> None:
    snapshot = exact_access_snapshot()

    role = role_access_projection(
        snapshot,
        kind="ClusterRole",
        namespace=None,
        name="view",
    )
    namespace = namespace_access_projection(snapshot, namespace="shop")

    assert [binding.binding.name for binding in role.bindings] == [
        "authenticated-view",
        "shop-view",
    ]
    assert [binding.binding.name for binding in namespace.role_bindings] == [
        "reader-binding",
    ]
    assert [
        binding.binding.name for binding in namespace.cluster_role_bindings_with_local_subject
    ] == ["shop-view"]
    assert namespace.service_account_count == 2


def test_resource_projection_resolves_pod_service_account_without_name_guessing() -> None:
    result = resource_access_projection(
        exact_access_snapshot(),
        {
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-7d9",
            "uid": "pod-checkout-7d9",
            "summary": {"service_account_name": "checkout"},
        },
    )

    assert result is not None
    assert result.type == "subject"
    assert result.subject.name == "checkout"


def test_pod_projection_uses_same_uid_access_cut_instead_of_stale_inventory_summary() -> None:
    snapshot = exact_access_snapshot()
    snapshot["service_accounts"] = [
        {"namespace": "shop", "name": "checkout"},
        {"namespace": "shop", "name": "current"},
    ]
    snapshot["pod_subjects"] = [
        {
            "uid": "pod-current",
            "namespace": "shop",
            "name": "checkout-7d9",
            "service_account_name": "current",
        }
    ]

    result = resource_access_projection(
        snapshot,
        {
            "kind": "Pod",
            "namespace": "shop",
            "name": "checkout-7d9",
            "uid": "pod-current",
            "summary": {"service_account_name": "stale"},
        },
    )

    assert result is not None
    assert result.type == "subject"
    assert result.subject.name == "current"


def test_pod_projection_fails_closed_for_same_name_recreated_uid() -> None:
    with pytest.raises(ResourceAccessUnavailable):
        resource_access_projection(
            exact_access_snapshot(),
            {
                "kind": "Pod",
                "namespace": "shop",
                "name": "checkout-7d9",
                "uid": "pod-recreated",
                "summary": {"service_account_name": "checkout"},
            },
        )


def test_partial_access_snapshot_fails_closed() -> None:
    snapshot = {**exact_access_snapshot(), "completeness": "partial"}

    with pytest.raises(ResourceAccessUnavailable):
        subject_access_projection(
            snapshot,
            kind="ServiceAccount",
            namespace="shop",
            name="checkout",
        )
