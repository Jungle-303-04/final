from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.parity import ClusterScope, ResourceRef
from packages.contracts.service_access import (
    AGENT_PORT_FORWARD_DESKTOP_REASON,
    AGENT_PORT_FORWARD_UNAVAILABLE_REASON,
    LocalPortForwardRequest,
    ServiceAccessCapabilities,
    ServiceHttpRequestCommandPayload,
    ServicePort,
    ServiceRequestCreateRequest,
    ServiceRequestResult,
)


def service_ref(**overrides: object) -> ResourceRef:
    return ResourceRef(
        api_group=str(overrides.get("api_group", "")),
        version=str(overrides.get("version", "v1")),
        kind=str(overrides.get("kind", "Service")),
        namespace=overrides.get("namespace", "shop"),
        name=str(overrides.get("name", "checkout-api")),
        uid=str(overrides.get("uid", "uid-service-1")),
    )


def scope(**overrides: object) -> ClusterScope:
    return ClusterScope(
        workspace_id=str(overrides.get("workspace_id", "workspace-1")),
        cluster_id=str(overrides.get("cluster_id", "cluster-1")),
        namespaces=tuple(overrides.get("namespaces", ("shop",))),
    )


def test_service_request_contract_binds_exact_core_v1_service_and_relative_path() -> None:
    request = ServiceRequestCreateRequest(
        scope=scope(),
        resource=service_ref(),
        port=8443,
        scheme="https",
        path="/ready?verbose=1",
        confirmation=True,
        reason="verify the selected service endpoint",
    )

    assert request.resource.uid == "uid-service-1"
    assert request.path == "/ready?verbose=1"

    for invalid_path in ("ready", "//example.test/", "https://example.test/", "/ok#fragment"):
        with pytest.raises(ValidationError):
            ServiceRequestCreateRequest(
                scope=scope(),
                resource=service_ref(),
                port=80,
                path=invalid_path,
                confirmation=True,
                reason="test",
            )


@pytest.mark.parametrize(
    "resource",
    [
        service_ref(kind="Pod"),
        service_ref(api_group="apps"),
        service_ref(version="v2"),
        service_ref(namespace=None),
    ],
)
def test_service_request_rejects_non_service_or_non_namespaced_identity(
    resource: ResourceRef,
) -> None:
    with pytest.raises(ValidationError):
        ServiceRequestCreateRequest(
            scope=scope(),
            resource=resource,
            port=80,
            confirmation=True,
            reason="test",
        )


def test_service_access_capabilities_default_to_no_agent_tunnel_and_validate_future_transport() -> (
    None
):
    capabilities = ServiceAccessCapabilities(
        scope=scope(),
        resource=service_ref(),
        revision="a" * 64,
        service_request="available",
        ports=(
            ServicePort(port=80, name="http", default_scheme="http"),
            ServicePort(port=443, name="https", default_scheme="https"),
        ),
    )

    assert capabilities.local_port_forward == "unavailable"
    assert capabilities.local_port_forward_reason == AGENT_PORT_FORWARD_UNAVAILABLE_REASON

    enabled = capabilities.model_copy(
        update={
            "local_port_forward": "desktop_required",
            "local_port_forward_reason": AGENT_PORT_FORWARD_DESKTOP_REASON,
        }
    )
    ServiceAccessCapabilities.model_validate(enabled.model_dump())

    with pytest.raises(ValidationError):
        ServiceAccessCapabilities(
            scope=scope(),
            resource=service_ref(),
            revision="a" * 64,
            service_request="available",
            ports=(
                ServicePort(port=443, name="https", default_scheme="https"),
                ServicePort(port=80, name="http", default_scheme="http"),
            ),
        )


def test_pod_port_capabilities_preserve_container_identity_and_fail_closed_without_tcp_ports() -> (
    None
):
    pod = service_ref(kind="Pod", name="checkout-api-7d9f", uid="uid-pod-1")
    capabilities = ServiceAccessCapabilities(
        scope=scope(),
        resource=pod,
        revision="b" * 64,
        service_request="unavailable",
        service_request_reason="pod_service_request_unsupported",
        local_port_forward="desktop_required",
        local_port_forward_reason=AGENT_PORT_FORWARD_DESKTOP_REASON,
        port_discovery="complete",
        ports=(
            ServicePort(
                container_name="app",
                port=8080,
                name="http",
                protocol="TCP",
                default_scheme="http",
            ),
        ),
    )

    assert capabilities.ports[0].container_name == "app"

    unavailable = ServiceAccessCapabilities(
        scope=scope(),
        resource=pod,
        revision="c" * 64,
        service_request="unavailable",
        service_request_reason="pod_service_request_unsupported",
        local_port_forward="unavailable",
        local_port_forward_reason="port_forward_no_tcp_ports",
        port_discovery="unavailable",
        port_discovery_reason="port_forward_no_tcp_ports",
        ports=(),
    )
    assert unavailable.local_port_forward == "unavailable"

    with pytest.raises(ValidationError):
        ServiceAccessCapabilities(
            scope=scope(namespaces=("other",)),
            resource=pod,
            revision="d" * 64,
            service_request="unavailable",
            service_request_reason="pod_service_request_unsupported",
            local_port_forward="desktop_required",
            local_port_forward_reason=AGENT_PORT_FORWARD_DESKTOP_REASON,
            port_discovery="complete",
            ports=capabilities.ports,
        )


def test_service_http_command_payload_does_not_accept_browser_scope_or_confirmation_fields() -> (
    None
):
    payload = ServiceHttpRequestCommandPayload(
        resource=service_ref(),
        port=80,
        scheme="http",
        path="/metrics",
    )
    assert payload.model_dump()["resource"]["uid"] == "uid-service-1"

    with pytest.raises(ValidationError):
        ServiceHttpRequestCommandPayload.model_validate(
            {
                **payload.model_dump(),
                "scope": scope().model_dump(),
                "confirmation": True,
            }
        )


def test_local_forward_contract_validates_port_address_and_namespace_without_claiming_execution() -> (
    None
):
    request = LocalPortForwardRequest(
        scope=scope(),
        resource=service_ref(),
        remote_port=8080,
        local_port=18080,
        listen_address="127.0.0.1",
        confirmation=True,
    )
    assert request.local_port == 18080

    with pytest.raises(ValidationError):
        LocalPortForwardRequest(
            scope=scope(),
            resource=service_ref(),
            remote_port=8080,
            local_port=0,
            listen_address="localhost",
            confirmation=True,
        )


def test_service_result_bounds_headers_and_body_bytes() -> None:
    result = ServiceRequestResult(
        status=200,
        status_text="OK",
        duration_ms=12,
        headers={"content-type": "application/json"},
        body='{"ok":true}',
        body_bytes=11,
    )
    assert result.truncated is False

    with pytest.raises(ValidationError):
        ServiceRequestResult(
            status=200,
            duration_ms=1,
            headers={},
            body="x" * (512 * 1024 + 1),
            body_bytes=512 * 1024,
        )
