from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from packages.config.constants import DEFAULT_TARGET_CLUSTER_ID, LOCAL_USER_ID, SANDBOX_NAMESPACE

DEFAULT_OAUTH_SCOPES = ["profile", "email"]
DEFAULT_WEBHOOK_IMAGE = "ghcr.io/project/checkout-api:bad"
DEFAULT_WEBHOOK_REPLICAS = 2
MIN_WEBHOOK_REPLICAS = 1
MAX_WEBHOOK_REPLICAS = 10
DEFAULT_COMMAND_ACTION = "rollout_restart"
DEFAULT_COMMAND_STATUS = "completed"
EMPTY_COMMAND_MESSAGE = ""
DEFAULT_AGENT_POLICY_GENERATION = 1
DEFAULT_PROVIDER_INTERVAL_SECONDS = 8
DEFAULT_PROVIDER_MIN_WORKERS = 1
DEFAULT_PROVIDER_MAX_WORKERS = 3
DEFAULT_QUEUE_AGE_TARGET_SECONDS = 15


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OAuthCallbackRequest(StrictModel):
    user_id: str = LOCAL_USER_ID
    code: str | None = None
    state: str | None = None
    scopes: list[str] = Field(default_factory=lambda: DEFAULT_OAUTH_SCOPES.copy())
    provider_user: str | None = None


class GitHubWebhookRequest(StrictModel):
    commit_sha: str
    image: str = DEFAULT_WEBHOOK_IMAGE
    replicas: int = Field(
        default=DEFAULT_WEBHOOK_REPLICAS, ge=MIN_WEBHOOK_REPLICAS, le=MAX_WEBHOOK_REPLICAS
    )


class AgentConnectRequest(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    correlation_id: str | None = None
    kubernetes: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list)
    traces: dict[str, Any] = Field(default_factory=dict)


class CommandRequest(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    action: str = DEFAULT_COMMAND_ACTION
    namespace: Literal["sandbox"] = SANDBOX_NAMESPACE
    reason: str | None = None
    diff: dict[str, Any] | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class CommandResultRequest(StrictModel):
    status: Literal["completed", "failed"] = DEFAULT_COMMAND_STATUS
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    applied: bool = False
    message: str = EMPTY_COMMAND_MESSAGE


class EvidenceProviderPolicy(StrictModel):
    enabled: bool = True
    interval_seconds: int = Field(default=DEFAULT_PROVIDER_INTERVAL_SECONDS, ge=1)
    min_workers: int = Field(default=DEFAULT_PROVIDER_MIN_WORKERS, ge=0)
    max_workers: int = Field(default=DEFAULT_PROVIDER_MAX_WORKERS, ge=0)
    queue_age_target_seconds: int = Field(default=DEFAULT_QUEUE_AGE_TARGET_SECONDS, ge=1)


class EvidenceRuntimePolicy(StrictModel):
    failure_policy: Literal["allow_partial", "strict"] = "allow_partial"
    providers: dict[str, EvidenceProviderPolicy] = Field(default_factory=dict)


class DesiredResource(StrictModel):
    resource_id: str
    scope: Literal["target-agent", "system", "user-workload"] = "target-agent"
    kind: Literal["ConfigMap", "Deployment"]
    namespace: str
    name: str
    action: Literal["observe", "apply"] = "observe"
    state: dict[str, Any] = Field(default_factory=dict)


class BootstrapPolicy(StrictModel):
    mode: Literal["management", "target"] = "target"
    resources: list[DesiredResource] = Field(default_factory=list)


class DesiredStatePolicy(StrictModel):
    resources: list[DesiredResource] = Field(default_factory=list)


class AgentPolicy(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    cluster_role: Literal["management", "target"] = "target"
    evidence: EvidenceRuntimePolicy = Field(default_factory=EvidenceRuntimePolicy)
    bootstrap: BootstrapPolicy = Field(default_factory=BootstrapPolicy)
    desired_state: DesiredStatePolicy = Field(default_factory=DesiredStatePolicy)


class AgentPolicyResponse(StrictModel):
    policy: AgentPolicy | None = None


class AgentPolicyStatusRequest(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    status: Literal["applied", "failed", "unchanged"] = "applied"
    message: str = EMPTY_COMMAND_MESSAGE
    details: dict[str, Any] = Field(default_factory=dict)


class AgentReconcileStatusRequest(StrictModel):
    cluster_id: str = DEFAULT_TARGET_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    status: Literal["applied", "failed", "unchanged"] = "unchanged"
    message: str = EMPTY_COMMAND_MESSAGE
    details: dict[str, Any] = Field(default_factory=dict)
