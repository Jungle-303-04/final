from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from packages.config.constants import Auth, Command, CommandStatus, OAuth, Sandbox, Target

DEFAULT_WEBHOOK_IMAGE = "ghcr.io/project/checkout-api:bad"
DEFAULT_WEBHOOK_REPLICAS = 2
MIN_WEBHOOK_REPLICAS = 1
MAX_WEBHOOK_REPLICAS = 10
DEFAULT_COMMAND_STATUS: Literal["completed", "failed"] = CommandStatus.COMPLETED
EMPTY_COMMAND_MESSAGE = ""
DEFAULT_TARGET_NAME = "target-cluster"
DEFAULT_TARGET_ENVIRONMENT = "sandbox"
DEFAULT_WORKSPACE_ID = "default"
DEFAULT_TARGET_IMAGE = "service:local"
DEFAULT_PROMETHEUS_BASE_URL = "http://fake-prometheus:8000"
DEFAULT_LOKI_BASE_URL = "http://fake-loki:8000"
MIN_EVIDENCE_INTERVAL_SECONDS = 1
MAX_EVIDENCE_INTERVAL_SECONDS = 3600


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OAuthCallbackRequest(StrictModel):
    user_id: str = Auth.LOCAL_USER_ID
    code: str | None = None
    state: str | None = None
    scopes: list[str] = Field(default_factory=lambda: list(OAuth.DEFAULT_SCOPES))
    provider_user: str | None = None


class GitHubWebhookRequest(StrictModel):
    commit_sha: str
    image: str = DEFAULT_WEBHOOK_IMAGE
    replicas: int = Field(
        default=DEFAULT_WEBHOOK_REPLICAS, ge=MIN_WEBHOOK_REPLICAS, le=MAX_WEBHOOK_REPLICAS
    )


class AgentConnectRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    correlation_id: str | None = None
    kubernetes: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list)
    traces: dict[str, Any] = Field(default_factory=dict)


class TargetRegisterRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    name: str = DEFAULT_TARGET_NAME
    environment: str = DEFAULT_TARGET_ENVIRONMENT
    workspace_id: str = DEFAULT_WORKSPACE_ID
    management_base_url: str = Field(min_length=1)
    image: str = DEFAULT_TARGET_IMAGE
    prometheus_base_url: str = DEFAULT_PROMETHEUS_BASE_URL
    loki_base_url: str = DEFAULT_LOKI_BASE_URL
    evidence_interval_seconds: int = Field(
        default=int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS),
        ge=MIN_EVIDENCE_INTERVAL_SECONDS,
        le=MAX_EVIDENCE_INTERVAL_SECONDS,
    )
    install_fake_telemetry: bool = True
    install_node_collector: bool = True
    apply: bool = False
    kube_context: str | None = None


class CommandRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    action: str = Command.DEFAULT_ACTION
    namespace: str = Sandbox.NAMESPACE
    reason: str | None = None
    diff: dict[str, Any] | None = None


class CommandStartRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    lease_id: str


class CommandResultRequest(StrictModel):
    status: Literal["completed", "failed"] = DEFAULT_COMMAND_STATUS
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    lease_id: str
    applied: bool = False
    message: str = EMPTY_COMMAND_MESSAGE
