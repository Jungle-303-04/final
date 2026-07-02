from __future__ import annotations

from domains.gitops.diffing import (
    apply_field_policy,
    build_adoption_required_changes,
    compare_managed_fields,
    extract_declared_field_paths,
    extract_managed_fields,
    snapshot_from_kubernetes_object,
    summarize_status,
)


def test_managed_deployment_fields_ignore_runtime_metadata() -> None:
    obj = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": {
            "name": "checkout-api",
            "namespace": "sandbox",
            "resourceVersion": "123",
            "managedFields": [{"manager": "kube-controller-manager"}],
        },
        "spec": {
            "replicas": 2,
            "template": {
                "spec": {
                    "containers": [
                        {
                            "name": "app",
                            "image": "checkout-api:v1",
                            "resources": {"requests": {"cpu": "100m"}},
                        }
                    ]
                }
            },
        },
        "status": {"readyReplicas": 2},
    }

    fields = extract_managed_fields(obj)

    assert fields == {
        "spec.replicas": 2,
        "spec.template.spec.containers[name=app].image": "checkout-api:v1",
        "spec.template.spec.containers[name=app].resources": {"requests": {"cpu": "100m"}},
    }


def test_field_level_3way_classifies_intended_change() -> None:
    changes = compare_managed_fields(
        old_desired={"spec.replicas": 2},
        live={"spec.replicas": 2},
        new_desired={"spec.replicas": 3},
    )

    assert summarize_status(changes) == "intended_change"
    assert changes[0]["classification"] == "intended_change"
    assert changes[0]["before"] == 2
    assert changes[0]["after"] == 3


def test_field_level_3way_classifies_drift() -> None:
    changes = compare_managed_fields(
        old_desired={"spec.replicas": 2},
        live={"spec.replicas": 5},
        new_desired={"spec.replicas": 2},
    )

    assert summarize_status(changes) == "drift"
    assert changes[0]["classification"] == "drift"


def test_field_level_3way_classifies_conflict() -> None:
    changes = compare_managed_fields(
        old_desired={"spec.template.spec.containers[name=app].image": "checkout-api:v1"},
        live={"spec.template.spec.containers[name=app].image": "checkout-api:hotfix"},
        new_desired={"spec.template.spec.containers[name=app].image": "checkout-api:v2"},
    )

    assert summarize_status(changes) == "review_required"
    assert changes[0]["classification"] == "conflict_or_manual_change"


def test_field_policy_keeps_approved_fields_and_drops_ignored_fields() -> None:
    fields = {
        "spec.replicas": 3,
        "spec.template.spec.containers[name=app].image": "checkout-api:v2",
        "spec.template.spec.containers[name=app].resources": {"limits": {"cpu": "500m"}},
    }

    filtered = apply_field_policy(
        fields,
        managed_fields={
            "spec.replicas",
            "spec.template.spec.containers[name=app].image",
        },
        ignored_fields={"spec.replicas"},
    )

    assert filtered == {"spec.template.spec.containers[name=app].image": "checkout-api:v2"}


def test_empty_managed_field_allowlist_manages_nothing() -> None:
    fields = {
        "spec.replicas": 3,
        "spec.template.spec.containers[name=app].image": "checkout-api:v2",
    }

    assert apply_field_policy(fields, managed_fields=[]) == {}


def test_compare_managed_fields_respects_user_field_policy() -> None:
    changes = compare_managed_fields(
        old_desired={
            "spec.replicas": 2,
            "spec.template.spec.containers[name=app].image": "checkout-api:v1",
        },
        live={
            "spec.replicas": 5,
            "spec.template.spec.containers[name=app].image": "checkout-api:v1",
        },
        new_desired={
            "spec.replicas": 2,
            "spec.template.spec.containers[name=app].image": "checkout-api:v2",
        },
        managed_fields={"spec.template.spec.containers[name=app].image"},
        ignored_fields={"spec.replicas"},
    )

    assert summarize_status(changes) == "intended_change"
    assert [change["field_path"] for change in changes] == [
        "spec.template.spec.containers[name=app].image"
    ]


def test_unknown_declared_fields_become_adoption_changes() -> None:
    changes = build_adoption_required_changes(
        live={"spec.replicas": 3},
        new_desired={"spec.replicas": 3},
        unknown_fields={"spec.replicas"},
    )

    assert summarize_status(changes) == "adoption_required"
    assert changes[0]["classification"] == "adoption_required"
    assert changes[0]["old_desired"] == "<missing>"


def test_declared_field_paths_come_from_policy_relevant_yaml_fields() -> None:
    paths = extract_declared_field_paths(
        {
            "apiVersion": "apps/v1",
            "kind": "Deployment",
            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
            "spec": {
                "replicas": 2,
                "template": {
                    "spec": {
                        "containers": [
                            {
                                "name": "app",
                                "image": "checkout-api:v1",
                                "resources": {"requests": {"cpu": "100m"}},
                            }
                        ]
                    }
                },
            },
            "status": {"readyReplicas": 2},
        }
    )

    assert paths == [
        "spec.replicas",
        "spec.template.spec.containers[name=app].image",
        "spec.template.spec.containers[name=app].resources",
    ]


def test_snapshot_from_service_keeps_only_service_policy_fields() -> None:
    snapshot = snapshot_from_kubernetes_object(
        {
            "apiVersion": "v1",
            "kind": "Service",
            "metadata": {"name": "checkout-api", "namespace": "sandbox"},
            "spec": {
                "type": "ClusterIP",
                "clusterIP": "10.0.0.1",
                "selector": {"app": "checkout-api"},
                "ports": [{"port": 80, "targetPort": 8080}],
            },
            "status": {"loadBalancer": {}},
        },
        source="test",
    )

    assert snapshot.resource == "service/checkout-api"
    assert snapshot.fields == {
        "spec.type": "ClusterIP",
        "spec.selector": {"app": "checkout-api"},
        "spec.ports": [{"port": 80, "targetPort": 8080}],
    }
