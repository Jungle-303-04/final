from __future__ import annotations

from typing import Final

from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import WorkerSubscription


class Settings:
    SERVICE_NAME: Final[str] = "command-worker"
    SUBSCRIPTION = WorkerSubscription(
        service_name=SERVICE_NAME,
        subject=EventSubject.COMMAND_REQUESTED,
    )

    AGENT_ROUTE_CHANNEL: Final[str] = "agent-poll"
    POLICY_STEPS: Final[list[str]] = ["validate policy", "route target cluster", "queue for agent"]
    DEFAULT_COMMAND_ACTION: Final[str] = "rollout_restart"
    SANDBOX_NAMESPACE_POLICY_NAME: Final[str] = "sandbox_namespace"
    SANDBOX_WRITE_REJECT_REASON: Final[str] = "only sandbox namespace writes are allowed"
    DEFAULT_POLICY_REJECT_REASON: Final[str] = "command policy rejected"
    COMMAND_STATUS_QUEUED: Final[str] = "queued"
