from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from domains.service_access.router import (
    create_service_request,
    get_service_access_capabilities,
)
from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.service_access import (
    PORT_FORWARD_AGENT_CAPABILITY,
    SERVICE_HTTP_REQUEST_ACTION,
    SERVICE_HTTP_REQUEST_AGENT_CAPABILITY,
    SERVICE_REQUEST_MAX_ACTIVE_PER_CLUSTER,
    ServiceRequestCreateRequest,
)


def inventory_service(**overrides: object) -> dict[str, object]:
    return {
        "inventory_key": "inventory-service-1",
        "snapshot_id": "snapshot-1",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "resource_type": "service",
        "api_version": "v1",
        "kind": "Service",
        "namespace": "shop",
        "name": "checkout-api",
        "uid": "uid-service-1",
        "deleted_at": None,
        "summary": {
            "type": "ClusterIP",
            "cluster_ip": "10.96.0.10",
            "ports": [
                {"name": "https", "protocol": "TCP", "port": 443, "appProtocol": "https"},
                {"name": "dns", "protocol": "UDP", "port": 53},
                {"name": "http", "protocol": "TCP", "port": 80, "appProtocol": "http"},
            ],
        },
        **overrides,
    }


def inventory_pod(**overrides: object) -> dict[str, object]:
    return {
        "inventory_key": "inventory-pod-1",
        "snapshot_id": "snapshot-pod-1",
        "workspace_id": "workspace-1",
        "cluster_id": "cluster-1",
        "resource_type": "pod",
        "api_version": "v1",
        "kind": "Pod",
        "namespace": "shop",
        "name": "checkout-api-7d9f",
        "uid": "uid-pod-1",
        "resource_version": "42",
        "deleted_at": None,
        "summary": {
            "phase": "Running",
            "container_ports_complete": True,
            "containers": [
                {
                    "name": "app",
                    "ports": [
                        {"container_port": 8443, "name": "https", "protocol": "TCP"},
                        {"container_port": 5353, "name": "dns", "protocol": "UDP"},
                    ],
                },
                {
                    "name": "metrics",
                    "ports": [
                        {"container_port": 8443, "name": "metrics", "protocol": "TCP"},
                    ],
                },
            ],
        },
        **overrides,
    }


class ServiceAccessDb:
    def __init__(
        self,
        *,
        allowed: bool = True,
        active: int = 0,
        connected: bool = True,
        port_forward_supported: bool = False,
        resource: dict[str, object] | None = None,
    ) -> None:
        self.allowed = allowed
        self.active = active
        self.connected = connected
        self.port_forward_supported = port_forward_supported
        self.resource = resource or inventory_service()
        self.access_calls: list[tuple[str, str, str, str, str]] = []

    def user_has_resource_access(
        self,
        user_id: str,
        workspace_id: str,
        resource_type: str,
        resource_id: str,
        permission: str,
    ) -> bool:
        self.access_calls.append((user_id, workspace_id, resource_type, resource_id, permission))
        return self.allowed

    def get_inventory_resource_by_key(
        self, *, workspace_id: str, inventory_key: str
    ) -> dict[str, object] | None:
        if workspace_id != "workspace-1" or inventory_key != self.resource["inventory_key"]:
            return None
        return self.resource

    def get_inventory_resource_by_api_version(
        self,
        *,
        workspace_id: str,
        cluster_id: str,
        resource_type: str,
        api_version: str,
        kind: str,
        namespace: str | None,
        name: str,
    ) -> dict[str, object] | None:
        expected = (
            workspace_id,
            cluster_id,
            resource_type,
            api_version,
            kind,
            namespace,
            name,
        )
        actual = (
            "workspace-1",
            self.resource["cluster_id"],
            "service",
            self.resource["api_version"],
            self.resource["kind"],
            self.resource["namespace"],
            self.resource["name"],
        )
        return self.resource if expected == actual else None

    def list_cluster_agent_statuses(
        self, _workspace_id: str, _cluster_id: str
    ) -> list[dict[str, object]]:
        if not self.connected:
            return []
        capabilities = ["command_receiver", SERVICE_HTTP_REQUEST_AGENT_CAPABILITY]
        if self.port_forward_supported:
            capabilities.append(PORT_FORWARD_AGENT_CAPABILITY)
        return [
            {
                "status": "connected",
                "capabilities": capabilities,
            }
        ]

    async def count_active_agent_commands(
        self, _workspace_id: str, _cluster_id: str, _action: str
    ) -> int:
        return self.active


class CapturingEvents:
    def __init__(self) -> None:
        self.command: object | None = None


def current() -> SimpleNamespace:
    return SimpleNamespace(
        user_id="user-1",
        roles=("cluster_steward",),
        workspace_id="workspace-1",
    )


def exact_request(**overrides: object) -> ServiceRequestCreateRequest:
    return ServiceRequestCreateRequest(
        scope=ClusterScope(
            workspace_id=str(overrides.get("workspace_id", "workspace-1")),
            cluster_id="cluster-1",
            namespaces=("shop",),
        ),
        resource=ResourceRef(
            api_group="",
            version="v1",
            kind="Service",
            namespace="shop",
            name="checkout-api",
            uid=str(overrides.get("uid", "uid-service-1")),
        ),
        port=int(overrides.get("port", 443)),
        scheme="https",
        path="/ready",
        confirmation=True,
        reason="verify checkout readiness",
    )


def test_capabilities_bind_session_workspace_rbac_exact_resource_and_tcp_ports() -> None:
    db = ServiceAccessDb()

    response = asyncio.run(
        get_service_access_capabilities(
            resource="inventory-service-1",
            current=current(),
            db=db,
        )
    )

    assert response.scope.workspace_id == "workspace-1"
    assert response.resource.uid == "uid-service-1"
    assert [item.port for item in response.ports] == [80, 443]
    assert [item.default_scheme for item in response.ports] == ["http", "https"]
    assert response.service_request == "available"
    assert response.local_port_forward == "unavailable"
    assert response.local_port_forward_reason == "agent_port_forward_unavailable"
    assert db.access_calls[-1][-1] == "pod.exec"


def test_capabilities_report_agent_unavailability_without_inventing_a_browser_session() -> None:
    response = asyncio.run(
        get_service_access_capabilities(
            resource="inventory-service-1",
            current=current(),
            db=ServiceAccessDb(connected=False),
        )
    )

    assert response.service_request == "unavailable"
    assert response.service_request_reason == "service_request_agent_unavailable"
    assert response.local_port_forward == "unavailable"
    assert response.local_port_forward_reason == "agent_port_forward_unavailable"


def test_pod_capabilities_project_exact_scope_uid_and_only_observed_tcp_container_ports() -> None:
    db = ServiceAccessDb(resource=inventory_pod())

    response = asyncio.run(
        get_service_access_capabilities(
            resource="inventory-pod-1",
            current=current(),
            db=db,
        )
    )

    assert response.scope.namespaces == ("shop",)
    assert response.resource == ResourceRef(
        api_group="",
        version="v1",
        kind="Pod",
        namespace="shop",
        name="checkout-api-7d9f",
        uid="uid-pod-1",
    )
    assert [
        (item.container_name, item.name, item.port, item.protocol) for item in response.ports
    ] == [
        ("app", "https", 8443, "TCP"),
        ("metrics", "metrics", 8443, "TCP"),
    ]
    assert response.port_discovery == "complete"
    assert response.port_discovery_reason is None
    assert response.service_request == "unavailable"
    assert response.local_port_forward == "unavailable"
    assert response.local_port_forward_reason == "agent_port_forward_unavailable"


@pytest.mark.parametrize(
    ("summary", "supported", "discovery", "forward", "reason"),
    [
        (
            {"phase": "Running", "container_ports_complete": True, "containers": []},
            True,
            "unavailable",
            "unavailable",
            "port_forward_no_tcp_ports",
        ),
        (
            {
                "phase": "Running",
                "container_ports_complete": False,
                "containers": [
                    {
                        "name": "app",
                        "ports": [{"container_port": 8080, "name": "http", "protocol": "TCP"}],
                    }
                ],
            },
            True,
            "partial",
            "desktop_required",
            "desktop_agent_port_forward_required",
        ),
        (
            inventory_pod()["summary"],
            False,
            "complete",
            "unavailable",
            "agent_port_forward_unavailable",
        ),
    ],
)
def test_pod_capabilities_fail_closed_for_empty_partial_or_unsupported_observations(
    summary: object,
    supported: bool,
    discovery: str,
    forward: str,
    reason: str,
) -> None:
    response = asyncio.run(
        get_service_access_capabilities(
            resource="inventory-pod-1",
            current=current(),
            db=ServiceAccessDb(
                resource=inventory_pod(summary=summary),
                port_forward_supported=supported,
            ),
        )
    )

    assert response.port_discovery == discovery
    assert response.local_port_forward == forward
    assert response.local_port_forward_reason == reason


def test_pod_capabilities_reject_a_stale_inventory_identity() -> None:
    with pytest.raises(HTTPException) as failure:
        asyncio.run(
            get_service_access_capabilities(
                resource="stale-inventory-pod-1",
                current=current(),
                db=ServiceAccessDb(resource=inventory_pod()),
            )
        )

    assert failure.value.status_code == 404


def test_capabilities_fail_closed_on_rbac() -> None:
    with pytest.raises(HTTPException) as failure:
        asyncio.run(
            get_service_access_capabilities(
                resource="inventory-service-1",
                current=current(),
                db=ServiceAccessDb(allowed=False),
            )
        )
    assert failure.value.status_code == 403


def test_create_request_queues_one_bounded_audited_read_command(monkeypatch) -> None:
    events = CapturingEvents()

    async def fake_accept(_events, command, *, actor, max_active_per_action):
        events.command = command
        assert actor.user_id == "user-1"
        assert max_active_per_action == SERVICE_REQUEST_MAX_ACTIVE_PER_CLUSTER
        accepted = SimpleNamespace(
            event=SimpleNamespace(event_id="evt-service-1", correlation_id="corr-service-1")
        )
        return accepted, None

    monkeypatch.setattr(
        "domains.service_access.router.accept_command_with_receipt_stage",
        fake_accept,
    )

    response = asyncio.run(
        create_service_request(
            payload=exact_request(),
            current=current(),
            db=ServiceAccessDb(),
            events=events,
            operation_events=SimpleNamespace(),
        )
    )

    assert response.audit_event_id == response.event_id == "evt-service-1"
    assert response.correlation_id == "corr-service-1"
    command = events.command
    assert command is not None
    assert command.action == SERVICE_HTTP_REQUEST_ACTION
    assert command.payload["resource"]["uid"] == "uid-service-1"
    assert command.payload["port"] == 443
    assert command.direct_execution is False


@pytest.mark.parametrize(
    ("db", "payload", "status"),
    [
        (
            ServiceAccessDb(active=SERVICE_REQUEST_MAX_ACTIVE_PER_CLUSTER),
            exact_request(),
            429,
        ),
        (ServiceAccessDb(), exact_request(uid="stale-uid"), 409),
        (ServiceAccessDb(), exact_request(port=8080), 422),
        (
            ServiceAccessDb(),
            exact_request(workspace_id="other-workspace"),
            403,
        ),
    ],
)
def test_create_request_rejects_unbounded_stale_or_cross_workspace_sessions(
    db: ServiceAccessDb,
    payload: ServiceRequestCreateRequest,
    status: int,
) -> None:
    with pytest.raises(HTTPException) as failure:
        asyncio.run(
            create_service_request(
                payload=payload,
                current=current(),
                db=db,
                events=CapturingEvents(),
                operation_events=SimpleNamespace(),
            )
        )
    assert failure.value.status_code == status
