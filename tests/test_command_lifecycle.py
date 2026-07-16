from __future__ import annotations

import pytest

from domains.command.lifecycle import (
    command_impact_identity,
    command_terminal_event_kind,
    command_transition_allowed,
)


def test_cancellation_and_retry_transitions_are_server_owned() -> None:
    assert command_transition_allowed("queued", "cancelled")
    assert command_transition_allowed("running", "cancel_requested")
    assert command_transition_allowed("cancel_requested", "cancelling")
    assert command_transition_allowed("cancelling", "cancelled")
    assert command_transition_allowed("failed", "queued")
    assert not command_transition_allowed("completed", "queued")
    assert not command_transition_allowed("cancelled", "queued")


def test_retryable_attempt_failure_does_not_close_the_command_sse() -> None:
    assert command_terminal_event_kind("failed", final=False) == "progress"
    assert command_terminal_event_kind("failed", final=True) == "failed"
    assert command_terminal_event_kind("cancelled", final=True) == "cancelled"
    with pytest.raises(ValueError):
        command_terminal_event_kind("running", final=True)


def test_impact_identity_is_stable_and_changes_for_target_or_impact() -> None:
    original = command_impact_identity(
        cluster_id="cluster-a",
        action="k8s.apps.v1.deployments.scale",
        namespace="sandbox",
        diff={"resource": "deployment/api", "replicas": 2},
        payload={"replicas": 2, "name": "api"},
    )
    assert original == command_impact_identity(
        cluster_id="cluster-a",
        action="k8s.apps.v1.deployments.scale",
        namespace="sandbox",
        diff={"replicas": 2, "resource": "deployment/api"},
        payload={"name": "api", "replicas": 2},
    )
    assert original != command_impact_identity(
        cluster_id="cluster-a",
        action="k8s.apps.v1.deployments.scale",
        namespace="sandbox",
        diff={"resource": "deployment/api", "replicas": 3},
        payload={"replicas": 3, "name": "api"},
    )
