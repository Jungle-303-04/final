from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from packages.config.constants import Command, CommandStatus, Sandbox, Target
from packages.contracts.gateway.base import StrictModel
from packages.contracts.gitops import (
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPO_REF,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID

DEFAULT_WEBHOOK_IMAGE = "service:local"
DEFAULT_WEBHOOK_REPLICAS = 2
MIN_WEBHOOK_REPLICAS = 1
MAX_WEBHOOK_REPLICAS = 10
DEFAULT_COMMAND_STATUS: Literal["completed", "failed"] = CommandStatus.COMPLETED
EMPTY_COMMAND_MESSAGE = ""
DEFAULT_TARGET_NAME = "target-cluster"
DEFAULT_TARGET_ENVIRONMENT = "sandbox"
DEFAULT_TARGET_IMAGE = "service:local"
DEFAULT_PROMETHEUS_BASE_URL = "http://fake-prometheus:8000"
DEFAULT_LOKI_BASE_URL = "http://fake-loki:8000"
MIN_EVIDENCE_INTERVAL_SECONDS = 1
MAX_EVIDENCE_INTERVAL_SECONDS = 3600


class LoginRequest(StrictModel):
    # 우리 서비스 자체 계정 로그인 입력값
    # role 같은 권한 필드는 클라이언트 입력 금지, 서버가 DB/session 기준 결정
    email: str = Field(min_length=1, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)


class SignupRequest(StrictModel):
    # 가입도 권한 필드 입력 금지. 최초 role/session 정책은 서버 결정
    email: str = Field(min_length=1, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)
    password_confirm: str = Field(min_length=8)


class ResendEmailVerificationRequest(StrictModel):
    email: str = Field(min_length=1, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8)


class GitHubWebhookRequest(StrictModel):
    commit_sha: str
    image: str = DEFAULT_WEBHOOK_IMAGE
    replicas: int = Field(
        default=DEFAULT_WEBHOOK_REPLICAS, ge=MIN_WEBHOOK_REPLICAS, le=MAX_WEBHOOK_REPLICAS
    )
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    repo_ref: str = DEFAULT_REPO_REF
    branch: str = DEFAULT_REPO_BRANCH
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH


class AgentConnectRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
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
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str
    lease_id: str


class CommandResultRequest(StrictModel):
    status: Literal["completed", "failed"] = DEFAULT_COMMAND_STATUS
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str
    lease_id: str
    applied: bool = False
    message: str = EMPTY_COMMAND_MESSAGE
