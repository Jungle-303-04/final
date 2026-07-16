"""Target agent uninstall contract.

The management plane has no inbound route to a target cluster.  Disconnect is
therefore a two-phase operation: an online agent can remove its own runtime
after acknowledging the command, while an operator command remains the safe
fallback for offline agents and the final self-authorizing RBAC pair.

Every resource below is an exact name emitted by ``target_install_manifest``.
Namespaces and sample/user workloads are deliberately outside this allowlist.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Any

from domains.command.policy import (
    DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS,
    DEFAULT_COMMAND_LEASE_SECONDS,
    DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
    DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
)
from packages.config.constants import Command, CommandStatus, RiskLevel
from packages.contracts.event_bus.interfaces import JsonObject
from packages.contracts.target import SANDBOX_NAMESPACE, TARGET_NAMESPACE

UNINSTALL_CONTRACT_VERSION = 1
UNINSTALL_PRIORITY = 1_000


@dataclass(frozen=True)
class NamespacedCleanupResource:
    api_group: str
    version: str
    namespace: str
    resource: str
    name: str


@dataclass(frozen=True)
class ClusterCleanupResource:
    api_group: str
    version: str
    resource: str
    name: str


PRE_ACK_NAMESPACED_CLEANUP = (
    NamespacedCleanupResource(
        "apps", "v1", TARGET_NAMESPACE, "daemonsets", "optional-node-collector"
    ),
    NamespacedCleanupResource(
        "core", "v1", TARGET_NAMESPACE, "configmaps", "target-runtime-config"
    ),
    NamespacedCleanupResource("core", "v1", TARGET_NAMESPACE, "configmaps", "target-agent-policy"),
    NamespacedCleanupResource("core", "v1", TARGET_NAMESPACE, "secrets", "target-runtime-secret"),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        TARGET_NAMESPACE,
        "rolebindings",
        "cluster-agent-self-manage",
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        TARGET_NAMESPACE,
        "rolebindings",
        "cluster-agent-target-manage",
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io", "v1", TARGET_NAMESPACE, "roles", "cluster-agent-self-manage"
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io", "v1", TARGET_NAMESPACE, "roles", "cluster-agent-target-manage"
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        SANDBOX_NAMESPACE,
        "rolebindings",
        "cluster-agent-sandbox-write",
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        SANDBOX_NAMESPACE,
        "rolebindings",
        "cluster-agent-catalog-install",
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io", "v1", SANDBOX_NAMESPACE, "roles", "cluster-agent-sandbox-write"
    ),
    NamespacedCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        SANDBOX_NAMESPACE,
        "roles",
        "cluster-agent-catalog-install",
    ),
)
PRE_ACK_CLUSTER_CLEANUP = (
    ClusterCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        "clusterrolebindings",
        "cluster-agent-node-control",
    ),
    ClusterCleanupResource(
        "rbac.authorization.k8s.io",
        "v1",
        "clusterroles",
        "cluster-agent-node-control",
    ),
    ClusterCleanupResource(
        "rbac.authorization.k8s.io", "v1", "clusterrolebindings", "cluster-agent-read"
    ),
    ClusterCleanupResource("rbac.authorization.k8s.io", "v1", "clusterroles", "cluster-agent-read"),
    ClusterCleanupResource("scheduling.k8s.io", "v1", "priorityclasses", "gitops-control-critical"),
    ClusterCleanupResource("scheduling.k8s.io", "v1", "priorityclasses", "gitops-demo-fast"),
)
FINAL_AGENT_DEPLOYMENT = NamespacedCleanupResource(
    "apps", "v1", TARGET_NAMESPACE, "deployments", "cluster-agent"
)

TARGET_NAMESPACED_RESOURCES = (
    "deployment/cluster-agent",
    "daemonset/optional-node-collector",
    "configmap/target-runtime-config",
    "configmap/target-agent-policy",
    "secret/target-runtime-secret",
    "serviceaccount/cluster-agent",
    "role/cluster-agent-self-manage",
    "role/cluster-agent-target-manage",
    "rolebinding/cluster-agent-self-manage",
    "rolebinding/cluster-agent-target-manage",
)
SANDBOX_RBAC_RESOURCES = (
    "role/cluster-agent-sandbox-write",
    "role/cluster-agent-catalog-install",
    "rolebinding/cluster-agent-sandbox-write",
    "rolebinding/cluster-agent-catalog-install",
)
CLUSTER_SCOPED_RESOURCES = (
    "clusterrolebinding/cluster-agent-node-control",
    "clusterrolebinding/cluster-agent-read",
    "clusterrolebinding/cluster-agent-uninstall",
    "clusterrole/cluster-agent-node-control",
    "clusterrole/cluster-agent-read",
    "clusterrole/cluster-agent-uninstall",
    "priorityclass/gitops-control-critical",
    "priorityclass/gitops-demo-fast",
)

# A running service account cannot reliably delete the binding that grants the
# deletion and then delete the role behind it.  Those inert objects are always
# included in the operator fallback instead of pretending self-cleanup is total.
SELF_CLEANUP_RESIDUALS = (
    f"{TARGET_NAMESPACE}:serviceaccount/cluster-agent",
    "cluster:clusterrolebinding/cluster-agent-uninstall",
    "cluster:clusterrole/cluster-agent-uninstall",
)


def target_uninstall_resources() -> list[str]:
    return [
        *(f"{TARGET_NAMESPACE}:{item}" for item in TARGET_NAMESPACED_RESOURCES),
        *(f"{SANDBOX_NAMESPACE}:{item}" for item in SANDBOX_RBAC_RESOURCES),
        *(f"cluster:{item}" for item in CLUSTER_SCOPED_RESOURCES),
    ]


def target_uninstall_command() -> str:
    """Render one idempotent command that deletes only Opsia-owned names."""

    target = " ".join(TARGET_NAMESPACED_RESOURCES)
    sandbox = " ".join(SANDBOX_RBAC_RESOURCES)
    cluster = " ".join(CLUSTER_SCOPED_RESOURCES)
    return " && ".join(
        (
            f"kubectl delete -n {TARGET_NAMESPACE} {target} --ignore-not-found --wait=true",
            f"kubectl delete -n {SANDBOX_NAMESPACE} {sandbox} --ignore-not-found --wait=true",
            f"kubectl delete {cluster} --ignore-not-found --wait=true",
        )
    )


@dataclass(frozen=True)
class QueuedAgentUninstall:
    command_id: str
    correlation_id: str
    inserted: bool


def agent_uninstall_plan(
    *, cluster_id: str, workspace_id: str, requested_by: str, correlation_id: str
) -> JsonObject:
    payload = {
        "cluster_id": cluster_id,
        "contract_version": UNINSTALL_CONTRACT_VERSION,
    }
    basis = {
        "workspace_id": workspace_id,
        "cluster_id": cluster_id,
        "action": Command.CLUSTER_AGENT_UNINSTALL_ACTION,
        "payload": payload,
        "correlation_id": correlation_id,
    }
    encoded = json.dumps(basis, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(encoded.encode()).hexdigest()
    return {
        "command_id": f"cmd-uninstall-{digest[:24]}",
        "idempotency_key": digest,
        "cluster_id": cluster_id,
        "action": Command.CLUSTER_AGENT_UNINSTALL_ACTION,
        "namespace": TARGET_NAMESPACE,
        "diff": {
            "resource": "opsia/cluster-agent",
            "namespace": TARGET_NAMESPACE,
            "risk": RiskLevel.REVIEW_REQUIRED.value,
            "basis": {"contract_version": UNINSTALL_CONTRACT_VERSION},
        },
        "payload": payload,
        "steps": ["acknowledge uninstall", "remove allowlisted agent runtime"],
        "lease": {
            "lease_seconds": DEFAULT_COMMAND_LEASE_SECONDS,
            "heartbeat_interval_seconds": DEFAULT_COMMAND_HEARTBEAT_INTERVAL_SECONDS,
        },
        "retry_policy": {
            "max_attempts": DEFAULT_COMMAND_RETRY_MAX_ATTEMPTS,
            "retry_delay_seconds": DEFAULT_COMMAND_RETRY_DELAY_SECONDS,
        },
        "routing_constraint": {
            "channel": "agent",
            "cluster_id": cluster_id,
            "workspace_id": workspace_id,
            "required_capability": "commands",
        },
        "workspace_id": workspace_id,
        "priority": UNINSTALL_PRIORITY,
        "requested_by": requested_by,
        "reason": "cluster disconnect requested by administrator",
        "correlation_id": correlation_id,
    }


def queue_agent_uninstall(
    db: Any, *, cluster_id: str, workspace_id: str, requested_by: str
) -> QueuedAgentUninstall:
    correlation_id = f"corr-uninstall-{uuid.uuid4()}"
    plan = agent_uninstall_plan(
        cluster_id=cluster_id,
        workspace_id=workspace_id,
        requested_by=requested_by,
        correlation_id=correlation_id,
    )
    inserted = bool(db.queue_agent_command(correlation_id, plan, CommandStatus.QUEUED))
    return QueuedAgentUninstall(
        command_id=str(plan["command_id"]),
        correlation_id=correlation_id,
        inserted=inserted,
    )
