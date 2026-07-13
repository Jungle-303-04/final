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
            summary={
                "selector": {
                    "matchLabels": {"app": "checkout"},
                    "matchExpressions": [{"key": "tier", "operator": "In", "values": ["api"]}],
                }
            },
        ),
        _item(
            inventory_key="replicaset",
            resource_type="workload",
            kind="ReplicaSet",
            name="checkout-rs",
            namespace="shop",
            labels={"app": "checkout"},
            summary={
                "owner_kind": "Deployment",
                "owner_name": "checkout",
                "owner_uid": "uid-deployment",
                "owner_references_complete": True,
            },
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
                "owner_uid": "uid-replicaset",
                "owner_references_complete": True,
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
            summary={"selector": {"app": "checkout"}},
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
        ("deployment", "pod", "selects", "selector_match"),
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

    assert all(edge["to_node_id"] != "same-name-other-namespace" for edge in graph["edges"])
    assert not any(
        edge["from_node_id"] == "deployment" and edge["to_node_id"] == "expression-mismatch"
        for edge in graph["edges"]
    )
    assert graph["relation_completeness"] == "partial"
    assert set(graph["partial_reason_codes"]) >= {
        "graph_node_budget_exceeded",
        "source_resources_incomplete",
        "source_labels_incomplete",
    }
    assert all(node["identity"]["cluster_id"] == "cluster-a" for node in graph["nodes"])


def test_graph_builder_treats_missing_selector_labels_as_unknown_not_match() -> None:
    items = _graph_items()
    items[2]["resource"]["labels"] = {"app": "checkout"}

    graph = build_resource_graph(
        items,
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=False,
        truncated=False,
    )

    assert not any(
        edge["from_node_id"] == "deployment" and edge["to_node_id"] == "pod"
        for edge in graph["edges"]
    )
    assert "selector_evidence_incomplete" in graph["partial_reason_codes"]


def test_graph_builder_honors_service_flat_label_names_and_evidence_time() -> None:
    items = _graph_items()
    items[4]["resource"]["summary"]["selector"] = {"matchLabels": "yes"}
    items[2]["resource"]["labels"] = {"matchLabels": "yes"}
    items[4]["resource"]["observed_at"] = "2026-07-13T14:10:00Z"
    items[2]["resource"]["observed_at"] = "2026-07-13T14:20:00Z"

    graph = build_resource_graph(
        items,
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
    )

    edge = next(
        edge
        for edge in graph["edges"]
        if edge["from_node_id"] == "service" and edge["to_node_id"] == "pod"
    )
    assert edge["evidence"]["observed_at"] == "2026-07-13T14:20:00Z"


def test_graph_builder_enforces_node_budget_and_owner_uid() -> None:
    mismatched = _graph_items()
    mismatched[1]["resource"]["summary"]["owner_uid"] = "uid-recreated-owner"
    mismatch_graph = build_resource_graph(
        mismatched,
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
    )
    assert not any(
        edge["from_node_id"] == "deployment" and edge["to_node_id"] == "replicaset"
        for edge in mismatch_graph["edges"]
    )

    bounded = build_resource_graph(
        _graph_items(),
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
        node_limit=2,
    )
    node_ids = {node["node_id"] for node in bounded["nodes"]}
    assert bounded["node_count"] == 2
    assert bounded["omitted_node_count"] == 4
    assert bounded["truncated"] is True
    assert all(
        edge["from_node_id"] in node_ids and edge["to_node_id"] in node_ids
        for edge in bounded["edges"]
    )


def test_graph_revision_is_scoped_to_visible_authorization() -> None:
    first = build_resource_graph(
        _graph_items(),
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
        authorization_revision="auth-a",
    )
    second = build_resource_graph(
        _graph_items(),
        snapshot_revision=42,
        filter_fingerprint="filter-a",
        source_complete=True,
        labels_complete=True,
        truncated=False,
        authorization_revision="auth-b",
    )

    assert first["graph_revision"] != second["graph_revision"]
