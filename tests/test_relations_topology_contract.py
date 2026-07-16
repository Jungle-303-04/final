from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from pydantic import ValidationError

from packages.contracts.gateway.responses import RelationsTopologyResponse


def _payload() -> dict[str, object]:
    return {
        "view": "relations",
        "availability": "available",
        "refresh_after_seconds": 5,
        "graph_revision": "graph-abc",
        "cluster_projection_revision": 42,
        "cluster": {"cluster_id": "cluster-a", "name": "prod", "provider": "eks"},
        "nodes": [
            {
                "node_id": "deployment-a",
                "category": "workload",
                "identity": {
                    "version": "v1",
                    "cluster_id": "cluster-a",
                    "resource_type": "workload",
                    "api_version": "apps/v1",
                    "kind": "Deployment",
                    "namespace": "shop",
                    "name": "checkout",
                    "uid": "uid-deployment-a",
                },
                "status": "Ready",
                "health": "healthy",
                "observed_at": "2026-07-14T05:00:00Z",
                "deleted_at": None,
                "application_ids": ["app-a"],
                "application_binding_completeness": "exact",
            },
            {
                "node_id": "pod-a",
                "category": "pod",
                "identity": {
                    "version": "v1",
                    "cluster_id": "cluster-a",
                    "resource_type": "pod",
                    "api_version": "v1",
                    "kind": "Pod",
                    "namespace": "shop",
                    "name": "checkout-a",
                    "uid": "uid-pod-a",
                },
                "status": "Running",
                "health": "healthy",
                "observed_at": "2026-07-14T05:00:00Z",
                "deleted_at": None,
                "application_ids": ["app-a"],
                "application_binding_completeness": "exact",
            },
        ],
        "edges": [
            {
                "edge_id": "edge-a",
                "from_node_id": "deployment-a",
                "to_node_id": "pod-a",
                "kind": "owns",
                "plane": "ownership",
                "direction": "directed",
                "state": "active",
                "evidence": {
                    "type": "owner_reference",
                    "authority": "authoritative",
                    "observed_at": "2026-07-14T05:00:00Z",
                },
            }
        ],
        "root_node_ids": ["deployment-a"],
        "counts": {
            "filtered_count": 2,
            "unfiltered_count": 2,
            "filtered_count_completeness": "exact",
            "unfiltered_count_completeness": "exact",
        },
        "node_count": 2,
        "edge_count": 1,
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
            "observed_at": "2026-07-14T05:00:00Z",
            "stale": False,
            "partial_reason_codes": [],
        },
    }


def test_relations_topology_contract_keeps_graph_evidence_and_freshness() -> None:
    response = RelationsTopologyResponse.model_validate(_payload())

    assert response.view == "relations"
    assert response.availability == "available"
    assert response.refresh_after_seconds == 5
    assert response.nodes[0].identity.kind == "Deployment"
    assert response.edges[0].evidence.type == "owner_reference"
    assert response.snapshot.authorization_revision == "auth-a"


@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload.update({"unexpected": True}),
        lambda payload: payload["edges"][0].update({"to_node_id": "missing-node"}),
        lambda payload: payload["edges"][0].update({"kind": "guessed_from_name"}),
        lambda payload: payload.update({"availability": "unavailable"}),
    ],
)
def test_relations_topology_contract_rejects_guessed_or_unavailable_evidence(
    mutation: Callable[[dict[str, Any]], None],
) -> None:
    payload = _payload()
    mutation(payload)

    with pytest.raises(ValidationError):
        RelationsTopologyResponse.model_validate(payload)


def test_unavailable_relations_topology_cannot_claim_graph_records() -> None:
    payload = _payload()
    payload.update(
        {
            "availability": "unavailable",
            "relation_completeness": "unavailable",
            "nodes": [],
            "edges": [],
            "root_node_ids": [],
            "node_count": 0,
            "edge_count": 0,
            "counts": {
                "filtered_count": None,
                "unfiltered_count": None,
                "filtered_count_completeness": "unavailable",
                "unfiltered_count_completeness": "unavailable",
            },
            "partial_reason_codes": ["topology_projection_unavailable"],
        }
    )

    response = RelationsTopologyResponse.model_validate(payload)

    assert response.availability == "unavailable"
    assert response.nodes == []
