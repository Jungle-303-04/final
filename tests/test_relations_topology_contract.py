from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from pydantic import ValidationError

from domains.inventory_filter.relations_topology import build_relations_topology
from packages.contracts.gateway.responses import RelationsTopologyResponse


def _payload() -> dict[str, object]:
    return {
        "nodes": [
            {"id": "deployment-a", "kind": "Deployment", "name": "checkout", "status": "Ready"},
            {"id": "pod-a", "kind": "Pod", "name": "checkout-a", "status": "Running"},
        ],
        "edges": [{"from": "deployment-a", "to": "pod-a", "type": "owns"}],
    }


def test_relations_topology_contract_is_exact_and_aliases_wire_fields() -> None:
    response = RelationsTopologyResponse.model_validate(_payload())

    assert response.edges[0].from_node_id == "deployment-a"
    assert response.edges[0].to_node_id == "pod-a"
    assert set(response.model_dump(by_alias=True)) == {"nodes", "edges"}
    assert set(response.model_dump(by_alias=True)["nodes"][0]) == {
        "id",
        "kind",
        "name",
        "status",
    }
    assert set(response.model_dump(by_alias=True)["edges"][0]) == {"from", "to", "type"}


@pytest.mark.parametrize(
    "mutation",
    [
        lambda payload: payload.update({"snapshot": {"revision": 42}}),
        lambda payload: payload["nodes"][0].update({"summary": {"secret": "no"}}),
        lambda payload: payload["edges"][0].update({"type": "guessed_from_name"}),
        lambda payload: payload["edges"][0].update({"to": "missing-node"}),
    ],
)
def test_relations_topology_contract_rejects_extra_guessed_or_dangling_data(
    mutation: Callable[[dict[str, Any]], None],
) -> None:
    payload = _payload()
    mutation(payload)

    with pytest.raises(ValidationError):
        RelationsTopologyResponse.model_validate(payload)


def test_relations_projection_only_keeps_allowlisted_evidence_backed_fields() -> None:
    projected = build_relations_topology(
        {
            "nodes": [
                {
                    "node_id": "pod-a",
                    "identity": {"kind": "Pod", "name": "checkout-a", "uid": "private"},
                    "status": "Running",
                    "health": "healthy",
                    "summary": {"token": "must-not-leak"},
                }
            ],
            "edges": [],
            "snapshot": {"revision": 42},
        }
    )

    assert projected == {
        "nodes": [{"id": "pod-a", "kind": "Pod", "name": "checkout-a", "status": "Running"}],
        "edges": [],
    }
