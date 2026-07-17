"""명령 카탈로그(@command.action) 검증 — 존재 + 정책 메타데이터의 단일 출처."""

from __future__ import annotations

import pytest

from domains.command.actions import (
    CommandCatalog,
    allowed_command_actions,
    command_action_for_recovery,
    command_action_spec,
    registered_command_actions,
)
from packages.config.constants import Command, Sandbox
from packages.contracts.helm import (
    HELM_RELEASE_ARTIFACT_READ_ACTION,
    HELM_RELEASE_ARTIFACT_READ_CAPABILITY,
)
from packages.contracts.resource_files import (
    RESOURCE_FILE_ACTION,
    RESOURCE_FILE_AGENT_CAPABILITY,
)
from packages.contracts.service_access import (
    SERVICE_HTTP_REQUEST_ACTION,
    SERVICE_HTTP_REQUEST_AGENT_CAPABILITY,
)
from packages.contracts.target import TARGET_NAMESPACE


def test_builtin_actions_registered_with_policy_metadata() -> None:
    actions = registered_command_actions()

    assert {spec.action for spec in actions} >= {
        Command.DEFAULT_ACTION,
        Command.APPLY_MANIFEST_ACTION,
        Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
        Command.KUBERNETES_STATEFULSET_SCALE_ACTION,
        Command.KUBERNETES_STATEFULSET_RESTART_ACTION,
        Command.KUBERNETES_DAEMONSET_RESTART_ACTION,
        Command.KUBERNETES_NODE_CORDON_ACTION,
        Command.KUBERNETES_NODE_UNCORDON_ACTION,
        Command.KUBERNETES_NODE_DRAIN_ACTION,
        Command.KUBERNETES_POD_DEBUG_ACTION,
        Command.KUBERNETES_NODE_DEBUG_ACTION,
        Command.KUBERNETES_NODE_DEBUG_CLEANUP_ACTION,
        Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
        Command.KUBERNETES_CRONJOB_SUSPEND_ACTION,
        Command.KUBERNETES_CRONJOB_RESUME_ACTION,
        Command.KUBERNETES_RESOURCE_DELETE_ACTION,
        Command.KUBERNETES_DEPLOYMENT_ROLLBACK_ACTION,
        Command.KUBERNETES_STATEFULSET_ROLLBACK_ACTION,
        Command.KUBERNETES_DAEMONSET_ROLLBACK_ACTION,
        Command.GITOPS_RESOURCE_CONTROL_ACTION,
        HELM_RELEASE_ARTIFACT_READ_ACTION,
    }
    cronjob_actions = {
        Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
        Command.KUBERNETES_CRONJOB_SUSPEND_ACTION,
        Command.KUBERNETES_CRONJOB_RESUME_ACTION,
    }
    dynamic_workload_actions = {
        Command.KUBERNETES_STATEFULSET_SCALE_ACTION,
        Command.KUBERNETES_STATEFULSET_RESTART_ACTION,
        Command.KUBERNETES_DAEMONSET_RESTART_ACTION,
        Command.KUBERNETES_NODE_CORDON_ACTION,
        Command.KUBERNETES_NODE_UNCORDON_ACTION,
        Command.KUBERNETES_NODE_DRAIN_ACTION,
        Command.KUBERNETES_POD_DEBUG_ACTION,
        Command.KUBERNETES_NODE_DEBUG_ACTION,
        Command.KUBERNETES_NODE_DEBUG_CLEANUP_ACTION,
        Command.APPLY_MANIFEST_ACTION,
        Command.KUBERNETES_RESOURCE_DELETE_ACTION,
        Command.KUBERNETES_DEPLOYMENT_ROLLBACK_ACTION,
        Command.KUBERNETES_STATEFULSET_ROLLBACK_ACTION,
        Command.KUBERNETES_DAEMONSET_ROLLBACK_ACTION,
        Command.GITOPS_RESOURCE_CONTROL_ACTION,
        Command.TRAFFIC_SOURCE_SELECT_ACTION,
        Command.TRAFFIC_SOURCE_CONNECT_ACTION,
    }
    for spec in actions:
        if spec.action == Command.CLUSTER_AGENT_UNINSTALL_ACTION:
            expected = (TARGET_NAMESPACE,)
        elif spec.action in {
            SERVICE_HTTP_REQUEST_ACTION,
            HELM_RELEASE_ARTIFACT_READ_ACTION,
            RESOURCE_FILE_ACTION,
        }:
            expected = ()
        elif spec.action in cronjob_actions | dynamic_workload_actions:
            expected = ()
        elif spec.action == Command.DEFAULT_ACTION:
            expected = (Sandbox.NAMESPACE, "color-turf")
        else:
            expected = (Sandbox.NAMESPACE,)
        assert spec.allowed_namespaces == expected
    service = command_action_spec(SERVICE_HTTP_REQUEST_ACTION)
    assert service is not None
    assert service.read_only is True
    assert service.enforce_control_namespace is False
    assert service.required_agent_capability == SERVICE_HTTP_REQUEST_AGENT_CAPABILITY
    resource_files = command_action_spec(RESOURCE_FILE_ACTION)
    assert resource_files is not None
    assert resource_files.read_only is True
    assert resource_files.enforce_control_namespace is False
    assert resource_files.required_agent_capability == RESOURCE_FILE_AGENT_CAPABILITY
    helm_artifact = command_action_spec(HELM_RELEASE_ARTIFACT_READ_ACTION)
    assert helm_artifact is not None
    assert helm_artifact.allowed_namespaces == ()
    assert helm_artifact.read_only is True
    assert helm_artifact.enforce_control_namespace is False
    assert helm_artifact.required_agent_capability == HELM_RELEASE_ARTIFACT_READ_CAPABILITY
    for action in cronjob_actions:
        cronjob = command_action_spec(action)
        assert cronjob is not None
        assert cronjob.allowed_namespaces == ()
        assert cronjob.enforce_control_namespace is True
        assert cronjob.required_agent_capability == Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY
    for action in (
        Command.KUBERNETES_NODE_CORDON_ACTION,
        Command.KUBERNETES_NODE_UNCORDON_ACTION,
        Command.KUBERNETES_NODE_DRAIN_ACTION,
        Command.KUBERNETES_NODE_DEBUG_ACTION,
        Command.KUBERNETES_NODE_DEBUG_CLEANUP_ACTION,
    ):
        node = command_action_spec(action)
        assert node is not None
        assert node.enforce_control_namespace is False
        assert node.required_agent_capability == Command.KUBERNETES_NODE_CONTROL_CAPABILITY
    pod_debug = command_action_spec(Command.KUBERNETES_POD_DEBUG_ACTION)
    assert pod_debug is not None
    assert pod_debug.supports_cancel is True
    assert pod_debug.required_agent_capability == Command.KUBERNETES_DEBUG_CAPABILITY
    for action in (
        Command.KUBERNETES_DEPLOYMENT_ROLLBACK_ACTION,
        Command.KUBERNETES_STATEFULSET_ROLLBACK_ACTION,
        Command.KUBERNETES_DAEMONSET_ROLLBACK_ACTION,
    ):
        rollback = command_action_spec(action)
        assert rollback is not None
        assert rollback.supports_cancel is True
        assert rollback.required_agent_capability == Command.KUBERNETES_WORKLOAD_ROLLBACK_CAPABILITY
    gitops = command_action_spec(Command.GITOPS_RESOURCE_CONTROL_ACTION)
    assert gitops is not None
    assert gitops.allowed_namespaces == ()
    assert gitops.enforce_control_namespace is False
    assert gitops.required_agent_capability == Command.GITOPS_RESOURCE_CONTROL_CAPABILITY


def test_spec_lookup_and_namespace_policy() -> None:
    spec = command_action_spec(Command.DEFAULT_ACTION)

    assert spec is not None
    assert spec.allows_namespace(Sandbox.NAMESPACE)
    assert not spec.allows_namespace("kube-system")
    # rollout restart 는 비파괴 조치 — 승인 없이 자동 실행 가능해야 함
    assert spec.requires_approval is False
    assert spec.requires_approval_for(Sandbox.NAMESPACE) is False
    assert spec.requires_approval_for("color-turf") is True
    assert command_action_spec("nope") is None
    scale = command_action_spec(Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION)
    assert scale is not None
    assert scale.requires_approval is True


def test_recovery_alias_resolution() -> None:
    assert command_action_for_recovery("rollout_restart") == Command.DEFAULT_ACTION
    assert command_action_for_recovery("unknown") is None
    assert Command.DEFAULT_ACTION in allowed_command_actions()


def test_conflicting_action_registration_fails_fast() -> None:
    catalog = CommandCatalog()

    @catalog.action("x", allowed_namespaces=("a",))
    class First: ...

    with pytest.raises(ValueError, match="duplicate command action: x"):

        @catalog.action("x", allowed_namespaces=("b",))
        class Second: ...


def test_identical_redeclaration_is_idempotent() -> None:
    catalog = CommandCatalog()

    @catalog.action("x", allowed_namespaces=("a",))
    class First: ...

    @catalog.action("x", allowed_namespaces=("a",))
    class Reloaded: ...

    assert First.__command_spec__ == Reloaded.__command_spec__


def test_empty_allowed_namespaces_means_unrestricted() -> None:
    catalog = CommandCatalog()

    @catalog.action("y")
    class Unrestricted: ...

    assert Unrestricted.__command_spec__.allows_namespace("anywhere")
