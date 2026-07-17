from __future__ import annotations

import importlib
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from domains.identity.dependencies import require_session
from packages.config.constants import Command
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


def cronjob_resource() -> dict[str, object]:
    return {
        **deployment_resource(),
        "inventory_key": "resource-cronjob-nightly",
        "kind": "CronJob",
        "name": "nightly",
        "raw": {"spec": {"suspend": False}},
    }


def workload_resource(kind: str, name: str) -> dict[str, object]:
    return {
        **deployment_resource(),
        "inventory_key": f"resource-{kind.casefold()}-{name}",
        "kind": kind,
        "name": name,
    }


def node_resource(*, cordoned: bool) -> dict[str, object]:
    return {
        **deployment_resource(),
        "inventory_key": "resource-node-worker-a",
        "resource_type": "node",
        "kind": "Node",
        "namespace": None,
        "name": "worker-a",
        "raw": {"spec": {"unschedulable": cordoned}},
    }


class ResourceCapabilitiesDb:
    def __init__(
        self,
        *,
        inventory_permitted: bool = True,
        deploy_permitted: bool = True,
        pod_exec_permitted: bool = True,
        command_supported: bool = True,
        cronjob_supported: bool = True,
        pod_exec_supported: bool = True,
        node_control_supported: bool = True,
        delete_supported: bool = False,
        workload_rollback_supported: bool = False,
        management: bool = False,
        resource: dict[str, object] | None = None,
    ) -> None:
        self.inventory_permitted = inventory_permitted
        self.deploy_permitted = deploy_permitted
        self.pod_exec_permitted = pod_exec_permitted
        self.command_supported = command_supported
        self.cronjob_supported = cronjob_supported
        self.pod_exec_supported = pod_exec_supported
        self.node_control_supported = node_control_supported
        self.delete_supported = delete_supported
        self.workload_rollback_supported = workload_rollback_supported
        self.management = management
        self.resource = deployment_resource() if resource is None else resource
        self.lookups: list[tuple[str, str]] = []
        self.access_checks: list[tuple[str, str, str, str, str]] = []
        self.revision_rows: list[dict[str, object]] = []

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
        if self.cronjob_supported:
            capabilities.append("cronjob_control.v1")
        if self.pod_exec_supported:
            capabilities.append("pod_exec_stream")
        if self.node_control_supported:
            capabilities.append("node_control.v1")
        if self.delete_supported:
            capabilities.append(Command.KUBERNETES_RESOURCE_DELETE_CAPABILITY)
        if self.workload_rollback_supported:
            capabilities.append(Command.KUBERNETES_WORKLOAD_ROLLBACK_CAPABILITY)
        return [{"status": "connected", "capabilities": capabilities}]

    def list_inventory_resources(self, **_kwargs: object) -> list[dict[str, object]]:
        return [dict(row) for row in self.revision_rows]

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
            "label": "Restart",
            "description": "Restart this deployment and stream the operation result.",
            "execution": "command",
            "confirmation_required": True,
            "realtime": True,
            "input_schema": [],
            "method": "POST",
            "path": "/clusters/cluster-a/namespaces/sandbox/deployments/checkout-api/restart",
            "request_context": "simple",
            "result_intent": "refresh-resource",
        },
        {
            "capability_id": "deployment.scale",
            "label": "Scale",
            "description": "Change the desired replica count and stream the operation result.",
            "execution": "command",
            "confirmation_required": True,
            "realtime": True,
            "input_schema": [
                {
                    "key": "replicas",
                    "label": "Replicas",
                    "type": "integer",
                    "required": True,
                    "minimum": 0,
                    "maximum": 100,
                    "default": 1,
                    "prefill_result_key": None,
                }
            ],
            "method": "POST",
            "path": "/clusters/cluster-a/namespaces/sandbox/deployments/checkout-api/scale",
            "request_context": "simple",
            "result_intent": "refresh-resource",
        },
    ]
    assert len(body["revision"]) == 64
    assert db.lookups == [("workspace-a", "resource-deployment-api")]
    assert [check[-1] for check in db.access_checks] == ["inventory.read", "deploy.run"]


def test_capabilities_projects_delete_only_with_exact_cas_and_agent_support() -> None:
    exact_resource = {
        **deployment_resource(),
        "uid": "deployment-uid-1",
        "resource_version": "42",
        "deleted_at": None,
    }
    response = client(ResourceCapabilitiesDb(resource=exact_resource, delete_supported=True)).get(
        "/capabilities", params={"resource": exact_resource["inventory_key"]}
    )

    assert response.status_code == 200
    delete = next(
        item
        for item in response.json()["capabilities"]
        if item["capability_id"] == "resource.delete"
    )
    assert delete["path"] == "/resource-deletions/resource-deployment-api"
    assert delete["confirmation_required"] is True
    assert delete["realtime"] is True

    unavailable = client(ResourceCapabilitiesDb(resource=exact_resource)).get(
        "/capabilities", params={"resource": exact_resource["inventory_key"]}
    )
    assert all(
        item["capability_id"] != "resource.delete" for item in unavailable.json()["capabilities"]
    )


def test_capabilities_projects_rollback_only_from_complete_exact_revision_evidence() -> None:
    current_template = {"spec": {"containers": [{"name": "api", "image": "checkout:v2"}]}}
    resource = {
        **deployment_resource(),
        "api_version": "apps/v1",
        "uid": "deployment-uid-1",
        "resource_version": "42",
        "raw": {
            "pod_template": current_template,
            "revision_history_complete": True,
            "revision_history_count": 2,
        },
    }
    db = ResourceCapabilitiesDb(
        resource=resource,
        workload_rollback_supported=True,
    )
    db.revision_rows = [
        {
            "inventory_key": f"revision-{number}",
            "snapshot_id": "snapshot-42",
            "cluster_id": "cluster-a",
            "resource_type": "workload_revision",
            "api_version": "apps/v1",
            "kind": "ReplicaSet",
            "namespace": "sandbox",
            "name": f"checkout-api-r{number}",
            "uid": f"revision-uid-{number}",
            "resource_version": str(number),
            "raw": {
                "owner_kind": "Deployment",
                "owner_name": "checkout-api",
                "owner_uid": "deployment-uid-1",
                "revision": str(number),
                "template": template,
            },
        }
        for number, template in (
            (1, {"spec": {"containers": [{"name": "api", "image": "checkout:v1"}]}}),
            (2, current_template),
        )
    ]

    response = client(db).get("/capabilities", params={"resource": resource["inventory_key"]})

    assert response.status_code == 200
    rollback = next(
        item
        for item in response.json()["capabilities"]
        if item["capability_id"] == "workload.rollback"
    )
    assert rollback["path"] == "/resource-rollbacks/resource-deployment-api"
    assert rollback["realtime"] is True


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
            "prefill_result_key": None,
        }
    ]


@pytest.mark.parametrize(
    ("kind", "name", "capability_ids"),
    [
        ("StatefulSet", "checkout-db", ["statefulset.restart", "statefulset.scale"]),
        ("DaemonSet", "node-agent", ["daemonset.restart"]),
    ],
)
def test_workload_capabilities_reuse_server_owned_command_handoff(
    kind: str,
    name: str,
    capability_ids: list[str],
) -> None:
    resource = workload_resource(kind, name)
    response = client(ResourceCapabilitiesDb(resource=resource)).get(
        "/capabilities",
        params={"resource": resource["inventory_key"]},
    )

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    assert [item["capability_id"] for item in capabilities] == capability_ids
    assert all(item["execution"] == "command" for item in capabilities)
    assert all(item["confirmation_required"] is True for item in capabilities)
    assert all(item["realtime"] is True for item in capabilities)
    assert all(
        item["path"].startswith(
            f"/clusters/cluster-a/namespaces/sandbox/workloads/{kind.casefold()}/{name}/"
        )
        for item in capabilities
    )


@pytest.mark.parametrize(
    ("cordoned", "capability_id", "path_suffix"),
    [
        (False, "node.cordon", "/cordon"),
        (True, "node.uncordon", "/uncordon"),
    ],
)
def test_node_capability_is_derived_from_observed_scheduling_state(
    cordoned: bool,
    capability_id: str,
    path_suffix: str,
) -> None:
    resource = node_resource(cordoned=cordoned)
    response = client(ResourceCapabilitiesDb(resource=resource)).get(
        "/capabilities",
        params={"resource": resource["inventory_key"]},
    )

    assert response.status_code == 200
    capabilities = response.json()["capabilities"]
    by_id = {item["capability_id"]: item for item in capabilities}
    assert set(by_id) == {
        capability_id,
        "node.drain",
        "node.debug",
        "node.debug.cleanup",
    }
    assert by_id[capability_id]["path"] == (f"/clusters/cluster-a/nodes/worker-a{path_suffix}")
    assert by_id["node.drain"]["path"].endswith("/nodes/worker-a/drain")
    assert by_id["node.drain"]["request_context"] == "exact-resource"
    assert by_id["node.drain"]["result_intent"] == "resource-summary"
    assert by_id["node.debug"]["request_context"] == "exact-resource"
    assert by_id["node.debug"]["result_intent"] == "terminal-session"
    assert by_id["node.debug.cleanup"]["request_context"] == "exact-resource"
    assert by_id["node.debug.cleanup"]["result_intent"] == "refresh-resource"
    assert {
        item["key"]: item["prefill_result_key"]
        for item in by_id["node.debug.cleanup"]["input_schema"]
    } == {
        "namespace": "namespace",
        "session_id": "session_id",
    }
    assert by_id["node.drain"]["input_schema"][0]["key"] == "timeout_seconds"
    assert by_id["node.drain"]["input_schema"][-2:] == [
        {
            "key": "force",
            "label": "Evict unmanaged Pods",
            "type": "boolean",
            "required": True,
            "minimum": None,
            "maximum": None,
            "default": False,
            "prefill_result_key": None,
        },
        {
            "key": "delete_empty_dir_data",
            "label": "Evict Pods using emptyDir",
            "type": "boolean",
            "required": True,
            "minimum": None,
            "maximum": None,
            "default": False,
            "prefill_result_key": None,
        },
    ]
    assert all(item["realtime"] is True for item in capabilities)


def test_node_capability_is_hidden_without_agent_node_control_capability() -> None:
    resource = node_resource(cordoned=False)
    response = client(
        ResourceCapabilitiesDb(
            resource=resource,
            node_control_supported=False,
        )
    ).get("/capabilities", params={"resource": resource["inventory_key"]})

    assert response.status_code == 200
    assert response.json()["capabilities"] == []


def test_capabilities_expose_exact_cronjob_actions_only_with_permission_and_agent_support() -> None:
    response = client(ResourceCapabilitiesDb(resource=cronjob_resource())).get(
        "/capabilities",
        params={"resource": "resource-cronjob-nightly"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["subject"] == {
        "resource_id": "resource-cronjob-nightly",
        "snapshot_id": "snapshot-42",
        "cluster_id": "cluster-a",
        "resource_type": "workload",
        "kind": "CronJob",
        "namespace": "sandbox",
        "name": "nightly",
    }
    assert [item["capability_id"] for item in body["capabilities"]] == [
        "cronjob.suspend",
        "cronjob.trigger",
    ]
    assert [item["path"] for item in body["capabilities"]] == [
        "/clusters/cluster-a/namespaces/sandbox/cronjobs/nightly/suspend",
        "/clusters/cluster-a/namespaces/sandbox/cronjobs/nightly/trigger",
    ]
    assert all(item["confirmation_required"] is True for item in body["capabilities"])
    assert all(item["realtime"] is True for item in body["capabilities"])

    unsupported = client(
        ResourceCapabilitiesDb(resource=cronjob_resource(), cronjob_supported=False)
    ).get("/capabilities", params={"resource": "resource-cronjob-nightly"})
    forbidden = client(
        ResourceCapabilitiesDb(resource=cronjob_resource(), deploy_permitted=False)
    ).get("/capabilities", params={"resource": "resource-cronjob-nightly"})

    assert unsupported.status_code == 200
    assert unsupported.json()["capabilities"] == []
    assert forbidden.status_code == 200
    assert forbidden.json()["capabilities"] == []


def test_capabilities_switch_cronjob_schedule_action_from_observed_state() -> None:
    suspended_resource = cronjob_resource()
    suspended_resource["raw"] = {"spec": {"suspend": True}}
    response = client(ResourceCapabilitiesDb(resource=suspended_resource)).get(
        "/capabilities",
        params={"resource": "resource-cronjob-nightly"},
    )

    assert response.status_code == 200
    assert [item["capability_id"] for item in response.json()["capabilities"]] == [
        "cronjob.resume",
        "cronjob.trigger",
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


def test_capabilities_include_management_node_actions_only_with_agent_safety_capability() -> None:
    allowed = client(
        ResourceCapabilitiesDb(
            management=True,
            resource=node_resource(cordoned=False),
        )
    ).get("/capabilities", params={"resource": "resource-node-worker-a"})
    unsupported = client(
        ResourceCapabilitiesDb(
            management=True,
            node_control_supported=False,
            resource=node_resource(cordoned=False),
        )
    ).get("/capabilities", params={"resource": "resource-node-worker-a"})

    assert allowed.status_code == 200
    assert {item["capability_id"] for item in allowed.json()["capabilities"]} == {
        "node.cordon",
        "node.drain",
        "node.debug",
        "node.debug.cleanup",
    }
    assert unsupported.status_code == 200
    assert unsupported.json()["capabilities"] == []


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
            "label": "Terminal",
            "description": "Open an audited terminal session and stream its output.",
            "execution": "terminal",
            "confirmation_required": True,
            "realtime": True,
            "input_schema": [],
            "method": "WEBSOCKET",
            "path": "/live/terminal",
            "request_context": "simple",
            "result_intent": "refresh-resource",
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


def test_capabilities_rejects_a_broad_namespace_only_query() -> None:
    db = ResourceCapabilitiesDb()

    response = client(db).get(
        "/capabilities",
        params={"namespace": "sandbox"},
    )

    assert response.status_code == 422
    assert db.lookups == []
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
