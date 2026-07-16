from __future__ import annotations

import pytest
from pydantic import ValidationError

from packages.contracts.parity import (
    CapabilitySet,
    ClusterScope,
    CommandReceipt,
    CommandRequest,
    OperationEvent,
    ResourceRef,
)


def test_parity_contract_preserves_canonical_scope_resource_and_direct_receipt() -> None:
    scope = ClusterScope(
        workspace_id="workspace-1",
        cluster_id="cluster-1",
        namespaces=["payments", "default", "payments"],
        freshness="live",
    )
    resource = ResourceRef(
        api_group="apps",
        version="v1",
        kind="Deployment",
        namespace="payments",
        name="checkout",
        uid="uid-1",
    )
    capabilities = CapabilitySet(
        scope=scope,
        resource=resource,
        revision="cap-1",
        actions=["deployment.scale", "deployment.restart"],
    )
    request = CommandRequest(
        scope=scope,
        resource=resource,
        action="deployment.scale",
        diff={"replicas": {"before": 2, "after": 3}},
        confirmation=True,
        reason="scale checkout",
    )
    receipt = CommandReceipt(
        accepted=True,
        command_id="cmd-1",
        event_id="evt-command-1",
        audit_event_id="evt-command-1",
        correlation_id="corr-command-1",
        status="queued",
    )
    event = OperationEvent(
        command_id=receipt.command_id,
        sequence=3,
        kind="progress",
        payload={"message": "agent leased command"},
    )

    assert scope.namespaces == ("default", "payments")
    assert capabilities.actions == ("deployment.restart", "deployment.scale")
    assert request.confirmation is True
    assert event.command_id == receipt.command_id
    # audit worker projection의 PK는 접수 시점에 존재하지 않는다. receipt는 실제
    # source event를 가리키며, audit_log.id를 추측해서 채우지 않는다.
    assert receipt.audit_event_id == receipt.event_id
    assert receipt.audit_id is None


def test_receipt_rejects_audit_event_that_is_not_the_accepted_event() -> None:
    with pytest.raises(ValidationError, match="audit_event_id"):
        CommandReceipt(
            command_id="cmd-1",
            event_id="evt-command-1",
            audit_event_id="evt-other",
            correlation_id="corr-command-1",
            status="queued",
        )


def test_direct_command_requires_confirmation_and_capabilities_are_unique() -> None:
    scope = ClusterScope(workspace_id="workspace-1", cluster_id="cluster-1")
    resource = ResourceRef(kind="Pod", namespace="default", name="api", uid="uid-1")

    with pytest.raises(ValidationError, match="confirmation"):
        CommandRequest(
            scope=scope,
            resource=resource,
            action="pod.exec",
            diff={},
            confirmation=False,
            reason="open shell",
        )
    with pytest.raises(ValidationError, match="unique"):
        CapabilitySet(
            scope=scope,
            resource=resource,
            revision="cap-1",
            actions=["pod.exec", "pod.exec"],
        )
