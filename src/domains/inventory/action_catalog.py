"""Declarative resource-action catalog used by capability discovery and execution.

The catalog is the only place that binds a resource shape to its permission,
agent capability, command transport, UI input fields, and gateway route.  Web
clients consume the resulting descriptor and never repeat an action list.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal
from urllib.parse import quote

from domains.command.actions import command_action_spec
from packages.config.constants import Command
from packages.config.control import control_namespace_allowed
from packages.config.terminal import pod_exec_namespace_allowed
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import MAX_DEPLOYMENT_REPLICAS
from packages.contracts.gateway.responses import (
    ResourceActionCapability,
    ResourceCapabilityInput,
    ResourceCapabilitySubject,
)
from packages.contracts.identity import Permission

NamespacePolicy = Literal["control", "terminal"]
ExecutionTransport = Literal["command", "terminal"]
ResourceState = Literal["always", "cronjob-running", "cronjob-suspended"]


@dataclass(frozen=True)
class ResourceActionDefinition:
    capability_id: str
    label: str
    description: str
    execution: ExecutionTransport
    method: Literal["POST", "WEBSOCKET"]
    path_template: str
    resource_type: str
    kind: str
    permission: str
    agent_capability: str
    namespace_policy: NamespacePolicy
    command_action: str | None = None
    inputs: tuple[ResourceCapabilityInput, ...] = ()
    resource_state: ResourceState = "always"

    def applies_to(
        self,
        subject: ResourceCapabilitySubject,
        resource: Mapping[str, Any],
    ) -> bool:
        if subject.resource_type.casefold() != self.resource_type:
            return False
        if subject.kind.casefold() != self.kind or subject.namespace is None:
            return False
        if self.namespace_policy == "control":
            allowed_namespace = control_namespace_allowed(subject.namespace)
        else:
            allowed_namespace = pod_exec_namespace_allowed(subject.namespace)
        if not allowed_namespace:
            return False
        if not _resource_state_matches(self.resource_state, resource):
            return False
        return self.command_action is None or _command_action_allows(
            self.command_action, subject.namespace
        )

    def render(self, subject: ResourceCapabilitySubject) -> ResourceActionCapability:
        values = {
            "cluster_id": quote(subject.cluster_id, safe=""),
            "namespace": quote(subject.namespace or "", safe=""),
            "deployment": quote(subject.name, safe=""),
            "cronjob": quote(subject.name, safe=""),
        }
        return ResourceActionCapability(
            capability_id=self.capability_id,
            label=self.label,
            description=self.description,
            execution=self.execution,
            confirmation_required=True,
            realtime=True,
            input_schema=list(self.inputs),
            method=self.method,
            path=self.path_template.format(**values),
        )


def _command_action_allows(action: str, namespace: str) -> bool:
    spec = command_action_spec(action)
    return spec is not None and spec.allows_namespace(namespace)


RESOURCE_ACTIONS: tuple[ResourceActionDefinition, ...] = (
    ResourceActionDefinition(
        capability_id="deployment.restart",
        label="Restart",
        description="Restart this deployment and stream the operation result.",
        execution="command",
        method="POST",
        path_template=gateway_routes.CLUSTER_DEPLOYMENT_RESTART_PATH,
        resource_type="workload",
        kind="deployment",
        permission=Permission.DEPLOY_RUN.value,
        agent_capability="command_receiver",
        namespace_policy="control",
        command_action=Command.DEFAULT_ACTION,
    ),
    ResourceActionDefinition(
        capability_id="deployment.scale",
        label="Scale",
        description="Change the desired replica count and stream the operation result.",
        execution="command",
        method="POST",
        path_template=gateway_routes.CLUSTER_DEPLOYMENT_SCALE_PATH,
        resource_type="workload",
        kind="deployment",
        permission=Permission.DEPLOY_RUN.value,
        agent_capability="command_receiver",
        namespace_policy="control",
        command_action=Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION,
        inputs=(
            ResourceCapabilityInput(
                key="replicas",
                label="Replicas",
                type="integer",
                required=True,
                minimum=0,
                maximum=MAX_DEPLOYMENT_REPLICAS,
                default=1,
            ),
        ),
    ),
    ResourceActionDefinition(
        capability_id="pod.exec",
        label="Terminal",
        description="Open an audited terminal session and stream its output.",
        execution="terminal",
        method="WEBSOCKET",
        path_template="/live/terminal",
        resource_type="pod",
        kind="pod",
        permission=Permission.POD_EXEC.value,
        agent_capability="pod_exec_stream",
        namespace_policy="terminal",
    ),
    ResourceActionDefinition(
        capability_id="cronjob.resume",
        label="Resume",
        description="Resume this CronJob and stream the operation result.",
        execution="command",
        method="POST",
        path_template=gateway_routes.CLUSTER_CRONJOB_RESUME_PATH,
        resource_type="workload",
        kind="cronjob",
        permission=Permission.DEPLOY_RUN.value,
        agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
        namespace_policy="control",
        command_action=Command.KUBERNETES_CRONJOB_RESUME_ACTION,
        resource_state="cronjob-suspended",
    ),
    ResourceActionDefinition(
        capability_id="cronjob.suspend",
        label="Suspend",
        description="Suspend this CronJob and stream the operation result.",
        execution="command",
        method="POST",
        path_template=gateway_routes.CLUSTER_CRONJOB_SUSPEND_PATH,
        resource_type="workload",
        kind="cronjob",
        permission=Permission.DEPLOY_RUN.value,
        agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
        namespace_policy="control",
        command_action=Command.KUBERNETES_CRONJOB_SUSPEND_ACTION,
        resource_state="cronjob-running",
    ),
    ResourceActionDefinition(
        capability_id="cronjob.trigger",
        label="Trigger",
        description="Create one Job from this CronJob and stream the operation result.",
        execution="command",
        method="POST",
        path_template=gateway_routes.CLUSTER_CRONJOB_TRIGGER_PATH,
        resource_type="workload",
        kind="cronjob",
        permission=Permission.DEPLOY_RUN.value,
        agent_capability=Command.KUBERNETES_CRONJOB_CONTROL_CAPABILITY,
        namespace_policy="control",
        command_action=Command.KUBERNETES_CRONJOB_TRIGGER_ACTION,
    ),
)


def applicable_resource_actions(
    subject: ResourceCapabilitySubject,
    resource: Mapping[str, Any],
) -> tuple[ResourceActionDefinition, ...]:
    """Return only catalog definitions whose immutable resource policy applies."""
    return tuple(
        definition for definition in RESOURCE_ACTIONS if definition.applies_to(subject, resource)
    )


def _resource_state_matches(state: ResourceState, resource: Mapping[str, Any]) -> bool:
    if state == "always":
        return True
    raw = resource.get("raw")
    raw_object = raw if isinstance(raw, Mapping) else {}
    spec = raw_object.get("spec")
    spec_object = spec if isinstance(spec, Mapping) else {}
    suspended = spec_object.get("suspend")
    if not isinstance(suspended, bool):
        return False
    return suspended if state == "cronjob-suspended" else not suspended
