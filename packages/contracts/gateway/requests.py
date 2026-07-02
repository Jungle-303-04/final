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
