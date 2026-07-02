from __future__ import annotations

from enum import StrEnum

STREAM_NAME = "SERVICE_EVENTS"
STREAM_SUBJECTS = [
    "oauth.>",
    "git.>",
    "manifest.>",
    "desired.>",
    "cluster.>",
    "evidence.>",
    "command.>",
    "rca.>",
    "safe_pr.>",
    "dashboard.>",
    "audit.>",
    "agent.>",
    "dead_letter.>",
]


class EventSubject(StrEnum):
    OAUTH_START_REQUESTED = "oauth.start.requested"
    OAUTH_CONNECTED = "oauth.connected"
    GIT_WEBHOOK_RECEIVED = "git.webhook.received"
    GIT_CHANGED = "git.changed"
    MANIFEST_RENDERED = "manifest.rendered"
    DESIRED_DIFF_DETECTED = "desired.diff.detected"
    AGENT_CONNECTED = "agent.connected"
    CLUSTER_EVIDENCE_RECEIVED = "cluster.evidence.received"
    EVIDENCE_BUILT = "evidence.built"
    COMMAND_REQUESTED = "command.requested"
    COMMAND_REJECTED = "command.rejected"
    COMMAND_DISPATCH_READY = "command.dispatch.ready"
    COMMAND_DISPATCHED = "command.dispatched"
    COMMAND_QUEUED_FOR_AGENT = "command.queued_for_agent"
    COMMAND_COMPLETED = "command.completed"
    AGENT_POLICY_UPDATED = "agent.policy.updated"
    AGENT_POLICY_REPORTED = "agent.policy.reported"
    AGENT_RECONCILE_REPORTED = "agent.reconcile.reported"
    RCA_COMPLETED = "rca.completed"
    SAFE_PR_CREATED = "safe_pr.created"
    DASHBOARD_UPDATED = "dashboard.updated"
    DEAD_LETTER_CREATED = "dead_letter.created"
