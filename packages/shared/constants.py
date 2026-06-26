from __future__ import annotations

from enum import StrEnum

DEFAULT_DATABASE_URL = "postgresql://service:service@postgresql:5432/service"
DEFAULT_NATS_URL = "nats://nats:4222"
DEFAULT_REDIS_URL = "redis://redis:6379/0"
DEFAULT_SERVICE_NAME = "service"
DEFAULT_HTTP_PORT = "8000"
DEFAULT_TARGET_CLUSTER_ID = "target-cluster-01"
DEFAULT_EVIDENCE_INTERVAL_SECONDS = "10"
DEFAULT_SESSION_TTL_SECONDS = "86400"
SERVICE_NAME_ENV = "SERVICE_NAME"
LOCAL_USER_ID = "local-user"
SANDBOX_NAMESPACE = "sandbox"
GITHUB_PROVIDER = "github"
REQUIRED_GITHUB_SCOPE = "repo"
SESSION_COOKIE_NAME = "service_session"

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
    RCA_COMPLETED = "rca.completed"
    SAFE_PR_CREATED = "safe_pr.created"
    DASHBOARD_UPDATED = "dashboard.updated"
    DEAD_LETTER_CREATED = "dead_letter.created"


class DashboardStatus(StrEnum):
    RUNNING = "running"
    DONE = "done"
    ATTENTION = "attention"


class EventProcessingStatus(StrEnum):
    PROCESSING = "processing"
    PROCESSED = "processed"
    RETRYING = "retrying"
    DEAD_LETTERED = "dead_lettered"
