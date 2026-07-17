from __future__ import annotations

from packages.contracts.kubernetes_discovery import normalize_api_resource_discovery


def test_discovery_normalizes_primary_resources_and_exact_crd_identity() -> None:
    observation = normalize_api_resource_discovery(
        documents=[
            {
                "groupVersion": "v1",
                "resources": [
                    {
                        "name": "pods/log",
                        "namespaced": True,
                        "kind": "Pod",
                        "verbs": ["get"],
                    },
                    {
                        "name": "pods",
                        "namespaced": True,
                        "kind": "Pod",
                        "verbs": ["watch", "list", "get", "list"],
                    },
                ],
            },
            {
                "groupVersion": "stable.example.com/v1",
                "resources": [
                    {
                        "name": "crontabs",
                        "singularName": "crontab",
                        "namespaced": True,
                        "kind": "CronTab",
                        "verbs": ["patch", "get", "delete", "list"],
                    }
                ],
            },
        ],
        custom_resource_definitions=[
            {
                "spec": {
                    "group": "stable.example.com",
                    "names": {"kind": "CronTab", "plural": "crontabs"},
                    "scope": "Namespaced",
                    "versions": [{"name": "v1", "served": True}],
                }
            }
        ],
        observed_at="2026-07-16T12:00:00+00:00",
    )

    assert observation.model_dump(mode="json") == {
        "observed_at": "2026-07-16T12:00:00Z",
        "completeness": "exact",
        "reason_codes": [],
        "resources": [
            {
                "group": "",
                "version": "v1",
                "api_version": "v1",
                "name": "pods",
                "singular_name": "",
                "kind": "Pod",
                "namespaced": True,
                "is_crd": False,
                "verbs": ["get", "list", "watch"],
            },
            {
                "group": "stable.example.com",
                "version": "v1",
                "api_version": "stable.example.com/v1",
                "name": "crontabs",
                "singular_name": "crontab",
                "kind": "CronTab",
                "namespaced": True,
                "is_crd": True,
                "verbs": ["delete", "get", "list", "patch"],
            },
        ],
    }


def test_discovery_keeps_crd_identity_unknown_when_crd_listing_is_unavailable() -> None:
    observation = normalize_api_resource_discovery(
        documents=[
            {
                "groupVersion": "stable.example.com/v1",
                "resources": [
                    {
                        "name": "crontabs",
                        "namespaced": True,
                        "kind": "CronTab",
                        "verbs": ["get", "list"],
                    }
                ],
            }
        ],
        custom_resource_definitions=None,
        observed_at="2026-07-16T12:00:00Z",
        reason_codes=["crd_discovery_forbidden"],
    )

    assert observation.completeness == "partial"
    assert observation.reason_codes == ["crd_discovery_forbidden"]
    assert observation.resources[0].is_crd is None


def test_discovery_deduplicates_group_versions_and_discloses_partial_failures() -> None:
    observation = normalize_api_resource_discovery(
        documents=[
            {
                "groupVersion": "apps/v1",
                "resources": [
                    {
                        "name": "deployments",
                        "namespaced": True,
                        "kind": "Deployment",
                        "verbs": ["get", "list"],
                    }
                ],
            },
            {
                "groupVersion": "apps/v1",
                "resources": [
                    {
                        "name": "deployments",
                        "namespaced": True,
                        "kind": "Deployment",
                        "verbs": ["watch", "get"],
                    }
                ],
            },
        ],
        custom_resource_definitions=[],
        observed_at="2026-07-16T12:00:00Z",
        reason_codes=["group_version_failed:metrics.k8s.io/v1beta1"],
        truncated=True,
    )

    assert observation.completeness == "partial"
    assert observation.reason_codes == [
        "catalog_truncated",
        "group_version_failed:metrics.k8s.io/v1beta1",
    ]
    assert len(observation.resources) == 1
    assert observation.resources[0].verbs == ["get", "list", "watch"]
