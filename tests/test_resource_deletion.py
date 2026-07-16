from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from domains.inventory.deletion import (
    get_resource_delete_preview,
    request_resource_delete,
)
from fastapi import HTTPException

from packages.config.constants import Command
from packages.contracts.auth import Actor
from packages.contracts.gateway.requests import ResourceDeleteRequest


def resource(
    inventory_key: str,
    *,
    kind: str,
    name: str,
    uid: str,
    resource_version: str,
    owner_uid: str | None = None,
) -> dict[str, object]:
    summary: dict[str, object] = {"owner_references_complete": True}
    if owner_uid is not None:
        summary["owner_uid"] = owner_uid
    return {
        "inventory_key": inventory_key,
        "snapshot_id": "snapshot-42",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload" if kind != "Pod" else "pod",
        "api_version": "apps/v1" if kind != "Pod" else "v1",
        "kind": kind,
        "namespace": "shop",
        "name": name,
        "uid": uid,
        "resource_version": resource_version,
        "summary": summary,
        "deleted_at": None,
    }


ROOT = resource(
    "resource-deployment-api",
    kind="Deployment",
    name="checkout-api",
    uid="deployment-uid-1",
    resource_version="42",
)
REPLICA_SET = resource(
    "resource-replicaset-api",
    kind="ReplicaSet",
    name="checkout-api-77f",
    uid="replicaset-uid-1",
    resource_version="17",
    owner_uid="deployment-uid-1",
)
POD = resource(
    "resource-pod-api",
    kind="Pod",
    name="checkout-api-77f-abc",
    uid="pod-uid-1",
    resource_version="9",
    owner_uid="replicaset-uid-1",
)


class DeletionDb:
    def __init__(self) -> None:
        self.resources = {item["inventory_key"]: dict(item) for item in (ROOT, REPLICA_SET, POD)}
        self.allowed = True
        self.connected = True
        self.source_complete = True
        self.truncated = False
        self.command: dict[str, object] | None = None
        self.command_id: str | None = None
        self.access_checks: list[tuple[str, str, str, str, str]] = []

    def get_inventory_resource_by_key(
        self,
        *,
        workspace_id: str,
        inventory_key: str,
    ) -> dict[str, object] | None:
        if workspace_id != "workspace-a":
            return None
        item = self.resources.get(inventory_key)
        return dict(item) if item is not None else None

    def read_inventory_cascade(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource: dict[str, object],
        limit: int,
    ) -> dict[str, object]:
        assert (workspace_id, cluster_id, limit) == ("workspace-a", "cluster-a", 200)
        assert resource["inventory_key"] == ROOT["inventory_key"]
        return {
            "snapshot_id": "snapshot-42",
            "resources_complete": self.source_complete,
            "truncated": self.truncated,
            "dependents": [dict(REPLICA_SET), dict(POD)],
        }

    def latest_inventory_snapshot(self, workspace_id: str, cluster_id: str) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return {
            "snapshot_id": "snapshot-42",
            "summary": {
                "summary": {
                    "resources_complete": self.source_complete,
                    "api_resource_discovery": {
                        "observed_at": "2026-07-17T00:00:00Z",
                        "completeness": "exact",
                        "reason_codes": [],
                        "resources": [
                            {
                                "group": "apps",
                                "version": "v1",
                                "api_version": "apps/v1",
                                "name": "deployments",
                                "singular_name": "deployment",
                                "kind": "Deployment",
                                "namespaced": True,
                                "is_crd": False,
                                "verbs": ["delete", "get", "list"],
                            },
                            {
                                "group": "apps",
                                "version": "v1",
                                "api_version": "apps/v1",
                                "name": "replicasets",
                                "singular_name": "replicaset",
                                "kind": "ReplicaSet",
                                "namespaced": True,
                                "is_crd": False,
                                "verbs": ["delete", "get", "list"],
                            },
                            {
                                "group": "",
                                "version": "v1",
                                "api_version": "v1",
                                "name": "pods",
                                "singular_name": "pod",
                                "kind": "Pod",
                                "namespaced": True,
                                "is_crd": False,
                                "verbs": ["delete", "get", "list"],
                            },
                        ],
                    },
                }
            },
        }

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        return self.allowed

    def list_cluster_agent_statuses(
        self, workspace_id: str, cluster_id: str
    ) -> list[dict[str, object]]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return (
            [
                {
                    "status": "connected",
                    "capabilities": [Command.KUBERNETES_RESOURCE_DELETE_CAPABILITY],
                }
            ]
            if self.connected
            else []
        )

    async def get_agent_command(
        self, command_id: str, workspace_id: str
    ) -> dict[str, object] | None:
        assert workspace_id == "workspace-a"
        return self.command if command_id == self.command_id else None


class Events:
    def __init__(self) -> None:
        self.bodies: list[object] = []

    async def accept_body(self, body: object, *, actor: Actor, **kwargs: object) -> SimpleNamespace:
        assert actor.user_id == "operator-a"
        self.bodies.append(body)
        return SimpleNamespace(
            event=SimpleNamespace(
                event_id=f"event-{len(self.bodies)}",
                correlation_id=f"correlation-{len(self.bodies)}",
            )
        )


class OperationEvents:
    def __init__(self) -> None:
        self.published: list[dict[str, object]] = []

    async def publish(self, **payload: object) -> None:
        self.published.append(payload)


def session() -> SimpleNamespace:
    return SimpleNamespace(
        workspace_id="workspace-a",
        user_id="operator-a",
        roles=("release_operator",),
    )


def test_cascade_preview_is_exact_bounded_and_revision_pinned() -> None:
    preview = get_resource_delete_preview(
        str(ROOT["inventory_key"]),
        session(),
        DeletionDb(),
    )

    assert preview.root.uid == "deployment-uid-1"
    assert preview.root.resource_version == "42"
    assert [item.uid for item in preview.dependents] == ["replicaset-uid-1", "pod-uid-1"]
    assert preview.revision.startswith("sha256:")
    assert preview.truncated is False
    assert preview.max_dependents == 200


@pytest.mark.parametrize("reason", ["incomplete", "truncated"])
def test_cascade_preview_fails_closed_without_complete_bounded_evidence(reason: str) -> None:
    db = DeletionDb()
    if reason == "incomplete":
        db.source_complete = False
    else:
        db.truncated = True

    with pytest.raises(HTTPException) as error:
        get_resource_delete_preview(str(ROOT["inventory_key"]), session(), db)

    assert error.value.status_code == 409


def test_delete_revalidates_preview_and_dispatches_exact_agent_contract() -> None:
    db = DeletionDb()
    preview = get_resource_delete_preview(str(ROOT["inventory_key"]), session(), db)
    events = Events()
    operation_events = OperationEvents()

    receipt = asyncio.run(
        request_resource_delete(
            str(ROOT["inventory_key"]),
            ResourceDeleteRequest(
                preview_revision=preview.revision,
                confirmation=True,
                reason="Delete the inspected resource and dependents",
                idempotency_key="resource-delete-001",
            ),
            session(),
            db,
            events,
            operation_events,
        )
    )

    assert receipt.status == "queued"
    command = events.bodies[0]
    assert command.action == Command.KUBERNETES_RESOURCE_DELETE_ACTION
    assert command.direct_execution is command.direct_execution_confirmed is True
    assert command.payload["resources"][0] == {
        "api_group": "apps",
        "version": "v1",
        "kind": "Deployment",
        "namespace": "shop",
        "name": "checkout-api",
        "uid": "deployment-uid-1",
        "resource_version": "42",
        "plural": "deployments",
    }
    assert command.payload["cascade"]["dependent_count"] == 2
    assert operation_events.published[0]["command_id"] == receipt.command_id


def test_delete_rejects_stale_preview_before_audit_acceptance() -> None:
    db = DeletionDb()
    preview = get_resource_delete_preview(str(ROOT["inventory_key"]), session(), db)
    db.resources[str(ROOT["inventory_key"])]["resource_version"] = "43"
    events = Events()

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            request_resource_delete(
                str(ROOT["inventory_key"]),
                ResourceDeleteRequest(
                    preview_revision=preview.revision,
                    confirmation=True,
                    reason="Delete the inspected resource and dependents",
                    idempotency_key="resource-delete-002",
                ),
                session(),
                db,
                events,
                OperationEvents(),
            )
        )

    assert error.value.status_code == 409
    assert events.bodies == []


def test_delete_requires_server_projected_agent_capability_and_rbac() -> None:
    db = DeletionDb()
    preview = get_resource_delete_preview(str(ROOT["inventory_key"]), session(), db)
    db.connected = False

    with pytest.raises(HTTPException) as error:
        asyncio.run(
            request_resource_delete(
                str(ROOT["inventory_key"]),
                ResourceDeleteRequest(
                    preview_revision=preview.revision,
                    confirmation=True,
                    reason="Delete the inspected resource and dependents",
                    idempotency_key="resource-delete-003",
                ),
                session(),
                db,
                Events(),
                OperationEvents(),
            )
        )

    assert error.value.status_code == 409
