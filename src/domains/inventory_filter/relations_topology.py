"""Allowlisted BQ-075 projection for the Resources relations view."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

JsonObject = dict[str, Any]


def build_relations_topology(graph: Mapping[str, Any]) -> JsonObject:
    """Narrow the evidence-backed resource graph to the public BQ-075 shape."""
    nodes = []
    for raw_node in graph.get("nodes") or []:
        node = _mapping(raw_node)
        identity = _mapping(node.get("identity"))
        nodes.append(
            {
                "id": str(node.get("node_id") or ""),
                "kind": str(identity.get("kind") or ""),
                "name": str(identity.get("name") or ""),
                "status": str(node.get("status") or ""),
            }
        )

    edges = []
    for raw_edge in graph.get("edges") or []:
        edge = _mapping(raw_edge)
        edges.append(
            {
                "from": str(edge.get("from_node_id") or ""),
                "to": str(edge.get("to_node_id") or ""),
                "type": str(edge.get("kind") or ""),
            }
        )
    return {"nodes": nodes, "edges": edges}


def _mapping(value: object) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}
