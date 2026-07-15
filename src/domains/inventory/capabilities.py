"""BQ-061 — exact inventory resource의 실행 가능한 action capability 판정."""

from __future__ import annotations

import hashlib
import json
from typing import Any
from urllib.parse import quote

from fastapi import HTTPException

from domains.command.actions import command_action_spec
from domains.identity.dependencies import require_cluster_access
from domains.target.management_guard import (
    cluster_role_from_policy,
    is_management_registration,
    is_management_role,
)
from packages.config.constants import Command
from packages.config.control import control_namespace_allowed
from packages.config.terminal import pod_exec_namespace_allowed
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.responses import (
    ResourceActionCapability,
    ResourceCapabilitiesResponse,
    ResourceCapabilitySubject,
)
from packages.contracts.identity import Permission

COMMAND_RECEIVER_CAPABILITY = "command_receiver"
POD_EXEC_STREAM_CAPABILITY = "pod_exec_stream"
CONNECTED_AGENT_STATUS = "connected"
DEPLOYMENT_KIND = "deployment"
POD_KIND = "pod"
WORKLOAD_RESOURCE_TYPE = "workload"
POD_RESOURCE_TYPE = "pod"


def resource_capabilities_response(
    db: Any,
    *,
    workspace_id: str,
    current: Any,
    resource: dict[str, Any],
) -> ResourceCapabilitiesResponse:
    """실제 route가 수용할 조건을 모두 만족하는 action만 반환한다."""
    subject = _subject(resource)
    deployment_applicable = _deployment_action_applicable(subject)
    pod_exec_applicable = _pod_exec_applicable(subject)
    deploy_permitted = deployment_applicable and _has_cluster_permission(
        db,
        current=current,
        workspace_id=workspace_id,
        cluster_id=subject.cluster_id,
        permission=Permission.DEPLOY_RUN.value,
    )
    pod_exec_permitted = pod_exec_applicable and _has_cluster_permission(
        db,
        current=current,
        workspace_id=workspace_id,
        cluster_id=subject.cluster_id,
        permission=Permission.POD_EXEC.value,
    )
    command_supported = deployment_applicable and _agent_supports_capability(
        db, workspace_id, subject.cluster_id, COMMAND_RECEIVER_CAPABILITY
    )
    pod_exec_supported = pod_exec_applicable and _agent_supports_capability(
        db, workspace_id, subject.cluster_id, POD_EXEC_STREAM_CAPABILITY
    )
    management = (deployment_applicable or pod_exec_applicable) and _is_management_cluster(
        db, workspace_id, subject.cluster_id
    )

    capabilities: list[ResourceActionCapability] = []
    if deploy_permitted and command_supported and not management and deployment_applicable:
        capabilities.extend(_deployment_capabilities(subject))
    if pod_exec_permitted and pod_exec_supported and not management and pod_exec_applicable:
        capabilities.append(_pod_exec_capability())
    capabilities.sort(key=lambda item: item.capability_id)

    revision = _revision(
        workspace_id=workspace_id,
        current=current,
        subject=subject,
        deploy_permitted=deploy_permitted,
        pod_exec_permitted=pod_exec_permitted,
        command_supported=command_supported,
        pod_exec_supported=pod_exec_supported,
        management=management,
        deployment_applicable=deployment_applicable,
        pod_exec_applicable=pod_exec_applicable,
        capability_ids=[item.capability_id for item in capabilities],
    )
    return ResourceCapabilitiesResponse(
        subject=subject,
        revision=revision,
        capabilities=capabilities,
    )


def _subject(resource: dict[str, Any]) -> ResourceCapabilitySubject:
    return ResourceCapabilitySubject(
        resource_id=str(resource["inventory_key"]),
        snapshot_id=str(resource["snapshot_id"]),
        cluster_id=str(resource["cluster_id"]),
        resource_type=str(resource["resource_type"]).strip().lower(),
        kind=str(resource["kind"]),
        namespace=(str(resource["namespace"]) if resource.get("namespace") is not None else None),
        name=str(resource["name"]),
    )


def _has_cluster_permission(
    db: Any,
    *,
    current: Any,
    workspace_id: str,
    cluster_id: str,
    permission: str,
) -> bool:
    try:
        require_cluster_access(db, current, workspace_id, cluster_id, permission)
    except HTTPException as exc:
        if exc.status_code == 403:
            return False
        raise
    return True


def _agent_supports_capability(
    db: Any, workspace_id: str, cluster_id: str, capability: str
) -> bool:
    statuses_reader = getattr(db, "list_cluster_agent_statuses", None)
    if not callable(statuses_reader):
        return False
    statuses = statuses_reader(workspace_id, cluster_id)
    return any(
        str(item.get("status") or "") == CONNECTED_AGENT_STATUS
        and capability in tuple(item.get("capabilities") or ())
        for item in statuses
        if isinstance(item, dict)
    )


def _is_management_cluster(db: Any, workspace_id: str, cluster_id: str) -> bool:
    registration_reader = getattr(db, "get_cluster_registration", None)
    registration = (
        registration_reader(workspace_id, cluster_id) if callable(registration_reader) else None
    )
    policy_reader = getattr(db, "get_cluster_policy", None)
    policy = policy_reader(workspace_id, cluster_id) if callable(policy_reader) else None
    return is_management_registration(registration) or is_management_role(
        cluster_role_from_policy(policy)
    )


def _deployment_action_applicable(subject: ResourceCapabilitySubject) -> bool:
    if (
        subject.resource_type != WORKLOAD_RESOURCE_TYPE
        or subject.kind.strip().lower() != DEPLOYMENT_KIND
        or subject.namespace is None
    ):
        return False
    if not control_namespace_allowed(subject.namespace):
        return False
    return all(
        spec is not None and spec.allows_namespace(subject.namespace)
        for spec in (
            command_action_spec(Command.DEFAULT_ACTION),
            command_action_spec(Command.KUBERNETES_DEPLOYMENT_SCALE_ACTION),
        )
    )


def _pod_exec_applicable(subject: ResourceCapabilitySubject) -> bool:
    return (
        subject.resource_type == POD_RESOURCE_TYPE
        and subject.kind.strip().lower() == POD_KIND
        and subject.namespace is not None
        and pod_exec_namespace_allowed(subject.namespace)
    )


def _deployment_capabilities(
    subject: ResourceCapabilitySubject,
) -> list[ResourceActionCapability]:
    assert subject.namespace is not None
    values = {
        "cluster_id": quote(subject.cluster_id, safe=""),
        "namespace": quote(subject.namespace, safe=""),
        "deployment": quote(subject.name, safe=""),
    }
    return [
        ResourceActionCapability(
            capability_id="deployment.restart",
            path=gateway_routes.CLUSTER_DEPLOYMENT_RESTART_PATH.format(**values),
        ),
        ResourceActionCapability(
            capability_id="deployment.scale",
            path=gateway_routes.CLUSTER_DEPLOYMENT_SCALE_PATH.format(**values),
        ),
    ]


def _pod_exec_capability() -> ResourceActionCapability:
    return ResourceActionCapability(
        capability_id="pod.exec",
        method="WEBSOCKET",
        path="/live/terminal",
    )


def _revision(
    *,
    workspace_id: str,
    current: Any,
    subject: ResourceCapabilitySubject,
    deploy_permitted: bool,
    pod_exec_permitted: bool,
    command_supported: bool,
    pod_exec_supported: bool,
    management: bool,
    deployment_applicable: bool,
    pod_exec_applicable: bool,
    capability_ids: list[str],
) -> str:
    payload = {
        "workspace_id": workspace_id,
        "actor_id": str(getattr(current, "user_id", "")),
        "roles": sorted(set(str(role) for role in (getattr(current, "roles", ()) or ()))),
        "subject": subject.model_dump(),
        "deploy_permitted": deploy_permitted,
        "pod_exec_permitted": pod_exec_permitted,
        "command_supported": command_supported,
        "pod_exec_supported": pod_exec_supported,
        "management": management,
        "deployment_applicable": deployment_applicable,
        "pod_exec_applicable": pod_exec_applicable,
        "capability_ids": capability_ids,
    }
    encoded = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(encoded.encode()).hexdigest()
