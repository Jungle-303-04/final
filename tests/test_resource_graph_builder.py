from __future__ import annotations

from typing import Any

from domains.inventory_filter.graph import build_resource_graph


def _item(
    *,
    inventory_key: str,
    resource_type: str,
    kind: str,
    name: str,
    namespace: str | None,
    labels: dict[str, str] | None = None,
    summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "resource": {
            "inventory_key": inventory_key,
            "snapshot_id": "snapshot-a",
            "workspace_id": "workspace-a",
            "cluster_id": "cluster-a",
            "resource_type": resource_type,
            "api_version": "v1" if resource_type != "workload" else "apps/v1",
            "kind": kind,
            "namespace": namespace,
            "name": name,
            "uid": f"uid-{inventory_key}",
            "resource_version": "1",
            "status": "Ready",
            "health": "healthy",
            "labels": labels or {},
            "annotations": {},
            "summary": summary or {},
            "observed_at": "2026-07-13T14:00:00Z",
            "first_seen_at": "2026-07-13T13:00:00Z",
            "last_seen_at": "2026-07-13T14:00:00Z",
            "deleted_at": None,
            "created_at": "2026-07-13T13:00:00Z",
            "updated_at": "2026-07-13T14:00:00Z",
        },
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "application_ids": [],
        "application_binding_completeness": "exact",
    }


def _graph_items() -> list[dict[str, Any]]:
    return [
        _item(
            inventory_key="deployment",
            resource_type="workload",
            kind="Deployment",
            name="checkout",
            namespace="shop",
            labels={"app": "checkout"},
        ),
        _item(
            inventory_key="replicaset",
            resource_type="workload",
            kind="ReplicaSet",
            name="checkout-rs",
            namespace="shop",
            labels={"app": "checkout"},
            summary={"owner_kind": "Deployment", "owner_name": "checkout"},
        ),
        _item(
            inventory_key="pod",
            resource_type="pod",
            kind="Pod",
            name="checkout-1",
            namespace="shop",
            labels={"app": "checkout", "tier": "api"},
            summary={
                "owner_kind": "ReplicaSet",
                "owner_name": "checkout-rs",
                "node_name": "node-a",
            },
        ),
        _item(
            inventory_key="node",
            resource_type="node",
            kind="Node",
            name="node-a",
            namespace=None,
        ),
        _item(
            inventory_key="service",
            resource_type="service",
            kind="Service",
            name="checkout",
            namespace="shop",
            summary={
                "selector": {
                    "matchLabels": {"app": "checkout"},
                    "matchExpressions": [{"key": "tier", "operator": "In", "values": ["api"]}],
                }
            },
        ),
        _item(
            inventory_key="endpoint",
            resource_type="endpoint",
            kind="EndpointSlice",
            name="checkout-abc",
            namespace="shop",
            summary={"service_name": "checkout"},
        ),
    ]


def test_graph_builder_emits_only_evidence_backed_deterministic_edges() -> None:
    first = build_resource_graph(
        _graph_items(),
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
    )
    second = build_resource_graph(
        list(reversed(_graph_items())),
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
    )

    edges = {
        (edge["from_node_id"], edge["to_node_id"], edge["kind"], edge["evidence"]["type"])
        for edge in first["edges"]
    }
    assert edges == {
        ("deployment", "replicaset", "owns", "owner_reference"),
        ("replicaset", "pod", "owns", "owner_reference"),
        ("pod", "node", "runs_on", "node_assignment"),
        ("service", "pod", "selects", "selector_match"),
        ("service", "endpoint", "routes_to", "service_name_label"),
    }
    assert first["graph_revision"] == second["graph_revision"]
    assert first["nodes"] == second["nodes"]
    assert first["edges"] == second["edges"]
    assert first["relation_completeness"] == "exact"


def test_graph_builder_never_guesses_cross_namespace_or_incomplete_relations() -> None:
    items = _graph_items()
    items[2]["resource"]["labels"]["tier"] = "api"
    items.append(
        _item(
            inventory_key="same-name-other-namespace",
            resource_type="pod",
            kind="Pod",
            name="checkout",
            namespace="other",
            labels={"app": "checkout", "tier": "api"},
        )
    )
    items.append(
        _item(
            inventory_key="expression-mismatch",
            resource_type="pod",
            kind="Pod",
            name="checkout-worker",
            namespace="shop",
            labels={"app": "checkout", "tier": "worker"},
        )
    )
    graph = build_resource_graph(
        items,
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=False,
        labels_complete=False,
        truncated=True,
    )

    assert all(
        edge["to_node_id"] not in {"same-name-other-namespace", "expression-mismatch"}
        for edge in graph["edges"]
    )
    assert graph["relation_completeness"] == "partial"
    assert set(graph["partial_reason_codes"]) >= {
        "graph_node_budget_exceeded",
        "source_resources_incomplete",
        "source_labels_incomplete",
    }
    assert all(node["identity"]["cluster_id"] == "cluster-a" for node in graph["nodes"])
