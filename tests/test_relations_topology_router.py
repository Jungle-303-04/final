from __future__ import annotations

import importlib
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from domains.identity.dependencies import require_session
from packages.contracts.gateway.responses import RelationsTopologyResponse
from packages.runtime.dependencies import get_db


class RelationsTopologyDb:
    def __init__(self, *, clusters: set[str], latest_revision: int = 42) -> None:
        self.clusters = clusters
        self.latest_revision = latest_revision
        self.data_calls: list[tuple[str, dict[str, Any]]] = []

    def accessible_resource_ids(
        self,
        _user_id: str,
        _workspace_id: str,
        resource_type: str,
        _permission: str,
    ) -> set[str]:
        if resource_type == "cluster":
            return set(self.clusters)
        if resource_type == "application":
            return {"app-a"}
        return set()

    def filter_snapshot_context(
        self,
        workspace_id: str,
        allowed_cluster_ids: set[str],
        *,
        at_revision: int | None = None,
    ) -> dict[str, Any]:
        self.data_calls.append(
            (
                "snapshot",
                {
                    "workspace_id": workspace_id,
                    "allowed_cluster_ids": set(allowed_cluster_ids),
                    "at_revision": at_revision,
                },
            )
        )
        revision = (
            self.latest_revision if at_revision is None else min(self.latest_revision, at_revision)
        )
        return {
            "snapshot_revision": revision,
            "observed_at": "2026-07-14T05:00:00Z" if revision else None,
            "labels_complete": True,
            "resources_complete": True,
            "application_bindings_complete": True,
            "partial_reason_codes": [],
        }

    def list_filtered_resources(self, **kwargs: Any) -> dict[str, Any]:
        self.data_calls.append(("resources", dict(kwargs)))
        cluster_id = next(iter(kwargs["allowed_cluster_ids"]))

        def item(
            inventory_key: str,
            resource_type: str,
            kind: str,
            name: str,
            summary: dict[str, Any],
        ) -> dict[str, Any]:
            return {
                "resource": {
                    "inventory_key": inventory_key,
                    "cluster_id": cluster_id,
                    "resource_type": resource_type,
                    "api_version": "apps/v1" if resource_type == "workload" else "v1",
                    "kind": kind,
                    "namespace": "shop",
                    "name": name,
                    "uid": f"uid-{inventory_key}",
                    "status": "Ready" if resource_type == "workload" else "Running",
                    "health": "healthy",
                    "labels": {"app": "checkout"},
                    "summary": summary,
                    "observed_at": "2026-07-14T05:00:00Z",
                },
                "cluster": {"cluster_id": cluster_id, "name": "prod", "provider": "eks"},
                "application_ids": ["app-a"],
                "application_binding_completeness": "exact",
            }

        return {
            "items": [
                item("deployment-a", "workload", "Deployment", "checkout", {}),
                item(
                    "pod-a",
                    "pod",
                    "Pod",
                    "checkout-a",
                    {
                        "owner_kind": "Deployment",
                        "owner_name": "checkout",
                        "owner_uid": "uid-deployment-a",
                        "owner_references_complete": True,
                        "secret": "must-not-leak",
                    },
                ),
            ],
            "filtered_count": 2,
            "unfiltered_count": 2,
            "has_more": False,
            "next_position": None,
        }


def _client(db: RelationsTopologyDb) -> TestClient:
    module = importlib.import_module("domains.inventory_filter.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_relations_topology_requires_one_authorized_cluster() -> None:
    db = RelationsTopologyDb(clusters={"cluster-a", "cluster-b"})
    client = _client(db)

    assert client.get("/topology", params={"view": "relations"}).status_code == 422
    assert (
        client.get(
            "/topology",
            params={"view": "relations", "clusters": "cluster-a,cluster-b"},
        ).status_code
        == 422
    )
    forbidden = client.get(
        "/topology",
        params={"view": "relations", "clusters": "cluster-secret"},
    )
    assert forbidden.status_code == 404
    assert "cluster-secret" not in forbidden.text
    forbidden_application = client.get(
        "/topology",
        params={
            "view": "relations",
            "clusters": "cluster-a",
            "applications": "app-secret",
        },
    )
    assert forbidden_application.status_code == 404
    assert "app-secret" not in forbidden_application.text
    assert db.data_calls == []


def test_relations_topology_openapi_declares_exact_strict_wire_contract() -> None:
    schema = _client(RelationsTopologyDb(clusters={"cluster-a"})).app.openapi()
    response_schema = schema["paths"]["/topology"]["get"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]

    assert {item["$ref"] for item in response_schema["anyOf"]} == {
        "#/components/schemas/PhysicalTopologyResponse",
        "#/components/schemas/RelationsTopologyResponse",
    }
    relation_schema = schema["components"]["schemas"]["RelationsTopologyResponse"]
    edge_schema = schema["components"]["schemas"]["ResourceGraphEdge"]
    assert {
        "view",
        "availability",
        "refresh_after_seconds",
        "nodes",
        "edges",
        "snapshot",
        "relation_completeness",
    }.issubset(relation_schema["properties"])
    assert relation_schema["additionalProperties"] is False
    assert set(edge_schema["properties"]) == {
        "edge_id",
        "from_node_id",
        "to_node_id",
        "kind",
        "plane",
        "direction",
        "state",
        "evidence",
    }
    assert edge_schema["properties"]["kind"]["enum"] == [
        "owns",
        "runs_on",
        "selects",
        "routes_to",
    ]


def test_relations_topology_uses_authorized_filtered_pinned_snapshot() -> None:
    db = RelationsTopologyDb(clusters={"cluster-a", "cluster-b"})
    response = _client(db).get(
        "/topology",
        params={
            "view": "relations",
            "clusters": "cluster-a",
            "namespaces": "cluster-a/shop",
            "applications": "app-a",
            "resources.types": "workload,pod",
            "labels": "app=checkout",
            "resources.q": "checkout",
            "snapshot_revision": 42,
            "workspace_id": "workspace-spoof",
        },
    )

    assert response.status_code == 200
    body = RelationsTopologyResponse.model_validate(response.json())
    assert body.availability == "available"
    assert body.refresh_after_seconds == 5
    assert [(node.node_id, node.identity.kind, node.identity.name) for node in body.nodes] == [
        ("deployment-a", "Deployment", "checkout"),
        ("pod-a", "Pod", "checkout-a"),
    ]
    assert body.edges[0].from_node_id == "deployment-a"
    assert body.edges[0].to_node_id == "pod-a"
    assert body.edges[0].kind == "owns"
    assert body.edges[0].evidence.type == "owner_reference"
    assert "secret" not in response.text.casefold()

    global_call, pinned_call, cluster_call, resource_call = db.data_calls
    assert global_call[1]["workspace_id"] == "workspace-a"
    assert global_call[1]["allowed_cluster_ids"] == {"cluster-a", "cluster-b"}
    assert pinned_call[1]["at_revision"] == 42
    assert cluster_call[1]["allowed_cluster_ids"] == {"cluster-a"}
    assert cluster_call[1]["at_revision"] == 42
    assert resource_call[1]["workspace_id"] == "workspace-a"
    assert resource_call[1]["allowed_cluster_ids"] == {"cluster-a"}
    assert resource_call[1]["allowed_application_ids"] == {"app-a"}
    assert resource_call[1]["snapshot_revision"] == 42
    assert resource_call[1]["filters"].resource_types == ("pod", "workload")
    assert resource_call[1]["filters"].labels == (("app", "checkout"),)
    assert resource_call[1]["filters"].query == "checkout"
    assert resource_call[1]["graph_priority"] is True


def test_relations_topology_rejects_unavailable_or_future_snapshot_before_rows() -> None:
    unavailable = RelationsTopologyDb(clusters={"cluster-a"}, latest_revision=0)
    unavailable_response = _client(unavailable).get(
        "/topology",
        params={"view": "relations", "clusters": "cluster-a"},
    )
    assert unavailable_response.status_code == 200
    unavailable_body = RelationsTopologyResponse.model_validate(unavailable_response.json())
    assert unavailable_body.availability == "unavailable"
    assert unavailable_body.nodes == []
    assert unavailable_body.edges == []
    assert "topology_projection_unavailable" in unavailable_body.partial_reason_codes
    assert [kind for kind, _call in unavailable.data_calls] == ["snapshot", "snapshot"]

    future = RelationsTopologyDb(clusters={"cluster-a"})
    future_response = _client(future).get(
        "/topology",
        params={"view": "relations", "clusters": "cluster-a", "snapshot_revision": 99},
    )
    assert future_response.status_code == 422
    assert [kind for kind, _call in future.data_calls] == ["snapshot"]


def test_relations_topology_rejects_revision_not_present_in_global_snapshot_cut() -> None:
    class GapDb(RelationsTopologyDb):
        def filter_snapshot_context(
            self,
            workspace_id: str,
            allowed_cluster_ids: set[str],
            *,
            at_revision: int | None = None,
        ) -> dict[str, Any]:
            result = super().filter_snapshot_context(
                workspace_id,
                allowed_cluster_ids,
                at_revision=at_revision,
            )
            if at_revision == 41:
                result["snapshot_revision"] = 40
            return result

    db = GapDb(clusters={"cluster-a"})
    response = _client(db).get(
        "/topology",
        params={"view": "relations", "clusters": "cluster-a", "snapshot_revision": 41},
    )

    assert response.status_code == 422
    assert [kind for kind, _call in db.data_calls] == ["snapshot", "snapshot"]
