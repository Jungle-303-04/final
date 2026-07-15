from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.identity.dependencies import require_session
from packages.contracts.gateway.responses import ResourceCapabilitiesResponse
from packages.runtime.dependencies import get_db


def deployment_resource() -> dict[str, object]:
    return {
        "inventory_key": "resource-deployment-api",
        "snapshot_id": "snapshot-42",
        "workspace_id": "workspace-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "kind": "Deployment",
        "namespace": "sandbox",
        "name": "checkout-api",
    }


def pod_resource() -> dict[str, object]:
    return {
        **deployment_resource(),
        "inventory_key": "resource-pod-checkout-api-1",
        "resource_type": "pod",
        "kind": "Pod",
        "name": "checkout-api-1",
    }


class ResourceCapabilitiesDb:
    def __init__(
        self,
        *,
        inventory_permitted: bool = True,
        deploy_permitted: bool = True,
        pod_exec_permitted: bool = True,
        command_supported: bool = True,
        pod_exec_supported: bool = True,
        management: bool = False,
        resource: dict[str, object] | None = None,
    ) -> None:
        self.inventory_permitted = inventory_permitted
        self.deploy_permitted = deploy_permitted
        self.pod_exec_permitted = pod_exec_permitted
        self.command_supported = command_supported
        self.pod_exec_supported = pod_exec_supported
        self.management = management
        self.resource = deployment_resource() if resource is None else resource
        self.lookups: list[tuple[str, str]] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []

    def get_inventory_resource_by_key(
        self,
        *,
        workspace_id: str,
        inventory_key: str,
    ) -> dict[str, object] | None:
        self.lookups.append((workspace_id, inventory_key))
        if workspace_id != "workspace-a":
            return None
        if self.resource is None or inventory_key != self.resource["inventory_key"]:
            return None
        return dict(self.resource)

    def can_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_checks.append((user_id, workspace_id, resource_type, resource_id, permission))
        if permission == "inventory.read":
            return self.inventory_permitted
        if permission == "deploy.run":
            return self.deploy_permitted
        if permission == "pod.exec":
            return self.pod_exec_permitted
        return False

    def list_cluster_agent_statuses(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> list[dict[str, object]]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        capabilities = ["collector"]
        if self.command_supported:
            capabilities.append("command_receiver")
        if self.pod_exec_supported:
            capabilities.append("pod_exec_stream")
        return [{"status": "connected", "capabilities": capabilities}]

    def get_cluster_registration(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        role = "management" if self.management else "target"
        return {"settings": {"cluster_role": role}}

    def get_cluster_policy(
        self,
        workspace_id: str,
        cluster_id: str,
    ) -> dict[str, object]:
        assert (workspace_id, cluster_id) == ("workspace-a", "cluster-a")
        return {"cluster_role": "target"}


def client(db: ResourceCapabilitiesDb) -> TestClient:
    module = importlib.import_module("domains.inventory.router")
    app = FastAPI()
    app.include_router(module.router)
    app.dependency_overrides[require_session] = lambda: SimpleNamespace(
        user_id="user-a",
        workspace_id="workspace-a",
        roles=("user",),
    )
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)


def test_capabilities_returns_only_real_authorized_deployment_actions() -> None:
    db = ResourceCapabilitiesDb()
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == {
        "resource_id": "resource-deployment-api",
        "snapshot_id": "snapshot-42",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "kind": "Deployment",
        "namespace": "sandbox",
        "name": "checkout-api",
    }
    assert body["capabilities"] == [
        {
            "capability_id": "deployment.restart",
            "method": "POST",
            "path": "/clusters/cluster-a/namespaces/sandbox/deployments/checkout-api/restart",
        },
        {
            "capability_id": "deployment.scale",
            "method": "POST",
            "path": "/clusters/cluster-a/namespaces/sandbox/deployments/checkout-api/scale",
        },
    ]
    assert len(body["revision"]) == 64
    assert db.lookups == [("workspace-a", "resource-deployment-api")]
    assert [check[-1] for check in db.access_checks] == ["inventory.read", "deploy.run"]


def test_capabilities_are_server_owned_execution_descriptors() -> None:
    response = client(ResourceCapabilitiesDb()).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 200
    restart, scale = response.json()["capabilities"]
    assert restart["label"] == "Restart"
    assert restart["confirmation_required"] is True
    assert restart["execution"] == "command"
    assert restart["realtime"] is True
    assert restart["input_schema"] == []
    assert scale["input_schema"] == [
        {
            "key": "replicas",
            "label": "Replicas",
            "type": "integer",
            "required": True,
            "minimum": 0,
            "maximum": 100,
            "default": 1,
        }
    ]


def test_capabilities_include_management_cluster_actions_for_confirmed_direct_execution() -> None:
    response = client(ResourceCapabilitiesDb(management=True)).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 200
    assert [item["capability_id"] for item in response.json()["capabilities"]] == [
        "deployment.restart",
        "deployment.scale",
    ]


@pytest.mark.parametrize(
    "db",
    [
        ResourceCapabilitiesDb(deploy_permitted=False),
        ResourceCapabilitiesDb(command_supported=False),
        ResourceCapabilitiesDb(resource={**deployment_resource(), "namespace": "kube-system"}),
        ResourceCapabilitiesDb(
            resource={
                **deployment_resource(),
                "resource_type": "service",
                "kind": "Service",
            }
        ),
    ],
    ids=[
        "permission-denied",
        "agent-unsupported",
        "namespace-policy",
        "not-applicable",
    ],
)
def test_capabilities_hides_denied_unsupported_or_inapplicable_actions(
    db: ResourceCapabilitiesDb,
) -> None:
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 200
    assert response.json()["capabilities"] == []


def test_capabilities_returns_pod_exec_only_for_exact_authorized_supported_pod() -> None:
    db = ResourceCapabilitiesDb(resource=pod_resource())
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-pod-checkout-api-1"},
    )

    assert response.status_code == 200
    assert response.json()["capabilities"] == [
        {
            "capability_id": "pod.exec",
            "method": "WEBSOCKET",
            "path": "/live/terminal",
        }
    ]
    assert [check[-1] for check in db.access_checks] == ["inventory.read", "pod.exec"]


@pytest.mark.parametrize(
    "db",
    [
        ResourceCapabilitiesDb(resource=pod_resource(), pod_exec_permitted=False),
        ResourceCapabilitiesDb(resource=pod_resource(), pod_exec_supported=False),
        ResourceCapabilitiesDb(
            resource={**pod_resource(), "namespace": "kube-system"},
        ),
    ],
    ids=["permission-denied", "agent-unsupported", "namespace-policy"],
)
def test_capabilities_hides_pod_exec_when_any_safety_gate_fails(
    db: ResourceCapabilitiesDb,
) -> None:
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-pod-checkout-api-1"},
    )

    assert response.status_code == 200
    assert response.json()["capabilities"] == []


def test_capabilities_requires_inventory_access_before_returning_decisions() -> None:
    db = ResourceCapabilitiesDb(inventory_permitted=False)
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 403
    assert [check[-1] for check in db.access_checks] == ["inventory.read"]


def test_capabilities_lookup_is_workspace_scoped_and_missing_is_404() -> None:
    db = ResourceCapabilitiesDb(resource={**deployment_resource(), "inventory_key": "other"})
    response = client(db).get(
        "/capabilities",
        params={"resource": "resource-deployment-api"},
    )

    assert response.status_code == 404
    assert db.lookups == [("workspace-a", "resource-deployment-api")]
    assert db.access_checks == []


def test_capabilities_revision_changes_when_effective_permission_changes() -> None:
    allowed = client(ResourceCapabilitiesDb()).get(
        "/capabilities", params={"resource": "resource-deployment-api"}
    )
    denied = client(ResourceCapabilitiesDb(deploy_permitted=False)).get(
        "/capabilities", params={"resource": "resource-deployment-api"}
    )

    assert allowed.json()["revision"] != denied.json()["revision"]


def test_capabilities_response_is_strict_unique_and_sorted() -> None:
    subject = {
        "resource_id": "resource-a",
        "snapshot_id": "snapshot-a",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "kind": "Deployment",
        "namespace": "sandbox",
        "name": "api",
    }
    action = {
        "capability_id": "deployment.restart",
        "method": "POST",
        "path": "/restart",
    }
    with pytest.raises(ValidationError):
        ResourceCapabilitiesResponse.model_validate(
            {
                "subject": subject,
                "revision": "a" * 64,
                "capabilities": [action, action],
            }
        )
    with pytest.raises(ValidationError):
        ResourceCapabilitiesResponse.model_validate(
            {
                "subject": subject,
                "revision": "a" * 64,
                "capabilities": [
                    {**action, "capability_id": "deployment.scale", "path": "/scale"},
                    action,
                ],
            }
        )
    with pytest.raises(ValidationError):
        ResourceCapabilitiesResponse.model_validate(
            {
                "subject": subject,
                "revision": "a" * 64,
                "capabilities": [action],
                "unexpected": True,
            }
        )
