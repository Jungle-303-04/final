from __future__ import annotations

from enum import StrEnum


class TargetComponent(StrEnum):
    CLUSTER_AGENT = "cluster-agent"
    NODE_COLLECTOR = "node-collector"
    FAKE_TELEMETRY = "fake-telemetry"


class TargetDesiredStateStatus(StrEnum):
    ACTIVE = "active"


class TargetReconcileStatus(StrEnum):
    REQUESTED = "requested"
    IN_SYNC = "in_sync"
    DRIFTED = "drifted"
    FAILED = "failed"


TARGET_NAMESPACE = "target"
SANDBOX_NAMESPACE = "sandbox"
