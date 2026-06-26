from __future__ import annotations

from packages.contracts.event_bus.subjects import EventSubject
from packages.contracts.event_bus.subscriptions import WorkerSubscription

SERVICE_NAME = "command-worker"
SUBSCRIPTION = WorkerSubscription(
    service_name=SERVICE_NAME,
    subject=EventSubject.COMMAND_REQUESTED,
)

AGENT_ROUTE_CHANNEL = "agent-poll"
POLICY_STEPS = ["validate policy", "route target cluster", "queue for agent"]
DEFAULT_COMMAND_ACTION = "rollout_restart"
SANDBOX_WRITE_REJECT_REASON = "only sandbox namespace writes are allowed"
COMMAND_STATUS_QUEUED = "queued"
