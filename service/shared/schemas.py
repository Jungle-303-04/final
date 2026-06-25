from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class OAuthCallbackRequest(StrictModel):
    user_id: str = "local-user"
    code: str | None = None
    state: str | None = None
    scopes: list[str] = Field(default_factory=lambda: ["profile", "email"])
    provider_user: str | None = None


class GitHubWebhookRequest(StrictModel):
    commit_sha: str
    image: str = "ghcr.io/project/checkout-api:bad"
    replicas: int = Field(default=2, ge=1, le=10)


class AgentConnectRequest(StrictModel):
    cluster_id: str = "target-cluster-01"
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = "target-cluster-01"
    correlation_id: str | None = None
    kubernetes: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list)
    traces: dict[str, Any] = Field(default_factory=dict)


class CommandRequest(StrictModel):
    cluster_id: str = "target-cluster-01"
    action: str = "rollout_restart"
    namespace: Literal["sandbox"] = "sandbox"
    reason: str | None = None
    diff: dict[str, Any] | None = None


class CommandResultRequest(StrictModel):
    status: Literal["completed", "failed"] = "completed"
    cluster_id: str = "target-cluster-01"
    applied: bool = False
    message: str = ""
