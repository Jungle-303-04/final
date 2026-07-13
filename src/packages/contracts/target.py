from __future__ import annotations

from enum import StrEnum


class TargetComponent(StrEnum):
    CLUSTER_AGENT = "cluster-agent"
    NODE_COLLECTOR = "node-collector"


class TargetDesiredStateStatus(StrEnum):
    ACTIVE = "active"


class TargetReconcileStatus(StrEnum):
    REQUESTED = "requested"
    IN_SYNC = "in_sync"
    DRIFTED = "drifted"
    FAILED = "failed"


TARGET_NAMESPACE = "target"
SANDBOX_NAMESPACE = "sandbox"
CONTROL_PRIORITY_CLASS_NAME = "gitops-control-critical"
FAST_LANE_PRIORITY_CLASS_NAME = "gitops-fast-lane"
FAST_LANE_NODE_LABEL_KEY = "workload-tier"
FAST_LANE_NODE_LABEL_VALUE = "fast-lane"
