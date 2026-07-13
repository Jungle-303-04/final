from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.gateway import routes
from packages.contracts.gateway.responses import ResourceGraphSnapshotResponse


def _payload() -> dict[str, object]:
    return {
        "graph_revision": "graph-abc",
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "nodes": [
            {
                "node_id": "inventory-a",
                "category": "workload",
                "identity": {
                    "version": "v1",
                    "cluster_id": "cluster-a",
                    "resource_type": "workload",
                    "api_version": "apps/v1",
                    "kind": "Deployment",
                    "namespace": "shop",
                    "name": "checkout",
                },
                "status": "Ready",
                "health": "healthy",
                "observed_at": "2026-07-13T14:00:00Z",
                "deleted_at": None,
                "application_ids": ["app-a"],
                "application_binding_completeness": "exact",
            }
        ],
        "edges": [],
        "root_node_ids": ["inventory-a"],
        "counts": {
            "filtered_count": 1,
            "unfiltered_count": 1,
            "filtered_count_completeness": "exact",
            "unfiltered_count_completeness": "exact",
        },
        "node_count": 1,
        "edge_count": 0,
        "omitted_node_count": 0,
        "omitted_edge_count": 0,
        "node_limit": 200,
        "edge_limit": 1000,
        "truncated": False,
        "relation_completeness": "exact",
        "partial_reason_codes": [],
        "snapshot": {
            "snapshot_revision": 42,
            "authorization_revision": "auth-a",
            "filter_fingerprint": "filter-a",
            "observed_at": "2026-07-13T14:00:00Z",
            "stale": False,
            "partial_reason_codes": [],
        },
    }


def test_resource_graph_response_has_stable_identity_and_honest_budget_fields() -> None:
    response = ResourceGraphSnapshotResponse.model_validate(_payload())

    assert routes.RESOURCES_GRAPH_PATH == "/resources/graph"
    assert response.nodes[0].node_id == "inventory-a"
    assert response.nodes[0].identity.version == "v1"
    assert response.nodes[0].identity.cluster_id == "cluster-a"
    assert response.omitted_node_count == 0
    assert response.relation_completeness == "exact"
    assert response.model_dump_json().find("annotations") == -1
    assert response.model_dump_json().find("summary") == -1


def test_resource_graph_contract_rejects_unknown_or_cross_cluster_edge_shape() -> None:
    payload = _payload()
    payload["unexpected"] = True
    with pytest.raises(ValidationError):
        ResourceGraphSnapshotResponse.model_validate(payload)

    payload = _payload()
    payload["edges"] = [
        {
            "edge_id": "edge-a",
            "from_node_id": "inventory-a",
            "to_node_id": "inventory-b",
            "kind": "guessed_from_name",
            "plane": "ownership",
            "direction": "directed",
            "evidence": {
                "type": "owner_reference",
                "authority": "authoritative",
                "observed_at": "2026-07-13T14:00:00Z",
            },
        }
    ]
    with pytest.raises(ValidationError):
        ResourceGraphSnapshotResponse.model_validate(payload)
