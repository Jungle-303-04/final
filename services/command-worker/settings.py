from __future__ import annotations

from packages.config.constants import EventSubject

SERVICE_NAME = "command-worker"
SUBSCRIBE_SUBJECT = EventSubject.COMMAND_REQUESTED

AGENT_ROUTE_CHANNEL = "agent-poll"
POLICY_STEPS = ["validate policy", "route target cluster", "queue for agent"]
DEFAULT_COMMAND_ACTION = "rollout_restart"
SANDBOX_WRITE_REJECT_REASON = "only sandbox namespace writes are allowed"
COMMAND_STATUS_QUEUED = "queued"
