from __future__ import annotations

import json
from typing import Any, Literal

from pydantic import Field, model_validator

from packages.config.constants import Command, CommandStatus, Sandbox, Target
from packages.contracts.gateway.base import StrictModel
from packages.contracts.gitops import (
    DEFAULT_APPLICATION_ID,
    DEFAULT_DEPLOYMENT_BINDING_ID,
    DEFAULT_ENVIRONMENT,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REPO_BRANCH,
    DEFAULT_REPOSITORY_ID,
    DEFAULT_WATCH_TARGET_ID,
    DEFAULT_WORKFLOW_RUN_ID,
)
from packages.contracts.identity import DEFAULT_WORKSPACE_ID

DEFAULT_WEBHOOK_REPLICAS = 2
MIN_WEBHOOK_REPLICAS = 1
MAX_WEBHOOK_REPLICAS = 10
DEFAULT_COMMAND_STATUS: Literal["completed", "failed"] = CommandStatus.COMPLETED
EMPTY_COMMAND_MESSAGE = ""
DEFAULT_TARGET_NAME = "target-cluster"
DEFAULT_TARGET_ENVIRONMENT = "sandbox"
# target cluster 실제 관측 스택 Service 주소(deploy/target/*.yaml Helm values와 정렬됨)
DEFAULT_PROMETHEUS_BASE_URL = "http://prometheus.target.svc:9090"
DEFAULT_LOKI_BASE_URL = "http://loki-gateway.target.svc"
MIN_EVIDENCE_INTERVAL_SECONDS = 1
MAX_EVIDENCE_INTERVAL_SECONDS = 3600
DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS = 3
MAX_EVIDENCE_JOB_MAX_ATTEMPTS = 10
DEFAULT_AGENT_POLICY_GENERATION = 1
DEFAULT_PROVIDER_INTERVAL_SECONDS = 8
DEFAULT_PROVIDER_MIN_WORKERS = 1
DEFAULT_PROVIDER_MAX_WORKERS = 3
DEFAULT_QUEUE_AGE_TARGET_SECONDS = 15
DEFAULT_AI_AGENT = "operations-chat"
MAX_AI_MESSAGE_LENGTH = 16_000

# agent evidence 페이로드 상한 — 무한 크기 수집물이 DB/NATS/LLM 컨텍스트를 압박하지 않도록.
MAX_EVIDENCE_LOG_ENTRIES = 2000
MAX_EVIDENCE_PAYLOAD_BYTES = 1_048_576  # 직렬화 1MiB 상한(초과 시 422)
EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE = "evidence payload exceeds size limit"


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
    image: str = Field(min_length=1)
    replicas: int = Field(
        default=DEFAULT_WEBHOOK_REPLICAS, ge=MIN_WEBHOOK_REPLICAS, le=MAX_WEBHOOK_REPLICAS
    )
    workspace_id: str = DEFAULT_WORKSPACE_ID
    repository_id: str = DEFAULT_REPOSITORY_ID
    repo_ref: str = Field(min_length=1)
    branch: str = DEFAULT_REPO_BRANCH
    watch_target_id: str = DEFAULT_WATCH_TARGET_ID
    binding_id: str = DEFAULT_DEPLOYMENT_BINDING_ID
    application_id: str = DEFAULT_APPLICATION_ID
    workflow_run_id: str = DEFAULT_WORKFLOW_RUN_ID
    environment: str = DEFAULT_ENVIRONMENT
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    manifest_path: str = DEFAULT_MANIFEST_PATH
    force: bool = False


class AgentConnectRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    agent_id: str
    capabilities: list[str] = Field(default_factory=list)


class AgentEvidenceRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
    correlation_id: str | None = None
    agent_id: str | None = None
    source_id: str | None = None
    window_start: str | None = None
    evidence_key: str | None = None
    kubernetes: dict[str, Any] = Field(default_factory=dict)
    metrics: dict[str, Any] = Field(default_factory=dict)
    logs: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVIDENCE_LOG_ENTRIES)
    traces: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _bound_payload_size(self) -> AgentEvidenceRequest:
        # logs 길이는 Field(max_length)로, 전체 수집물 크기는 직렬화 바이트로 상한.
        # (kubernetes/metrics/traces 는 중첩 dict 라 항목 수만으로는 못 막음)
        size = len(
            json.dumps(
                {
                    "kubernetes": self.kubernetes,
                    "metrics": self.metrics,
                    "logs": self.logs,
                    "traces": self.traces,
                },
                default=str,
            ).encode()
        )
        if size > MAX_EVIDENCE_PAYLOAD_BYTES:
            raise ValueError(EVIDENCE_PAYLOAD_TOO_LARGE_MESSAGE)
        return self


class TargetRegisterRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    name: str = DEFAULT_TARGET_NAME
    environment: str = DEFAULT_TARGET_ENVIRONMENT
    workspace_id: str = DEFAULT_WORKSPACE_ID
    management_base_url: str = Field(min_length=1)
    image: str = Field(min_length=1)
    prometheus_base_url: str = DEFAULT_PROMETHEUS_BASE_URL
    loki_base_url: str = DEFAULT_LOKI_BASE_URL
    evidence_interval_seconds: int = Field(
        default=int(Target.DEFAULT_EVIDENCE_INTERVAL_SECONDS),
        ge=MIN_EVIDENCE_INTERVAL_SECONDS,
        le=MAX_EVIDENCE_INTERVAL_SECONDS,
    )
    install_node_collector: bool = True
    install_sample_workload: bool = False
    sample_workload_name: str | None = Field(
        default=None,
        min_length=1,
        max_length=63,
        pattern=r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$",
    )
    sample_workload_image: str | None = Field(default=None, min_length=1)
    apply: bool = False
    kube_context: str | None = None
    cloud_provider: str = "existing-k8s"
    deploy_provider: str = "manual-manifest"

    @model_validator(mode="after")
    def _sample_workload_requires_explicit_config(self) -> TargetRegisterRequest:
        if self.install_sample_workload and (
            not self.sample_workload_name or not self.sample_workload_image
        ):
            raise ValueError(
                "sample_workload_name and sample_workload_image are required "
                "when install_sample_workload is true"
            )
        return self


class CommandRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    action: str = Command.DEFAULT_ACTION
    namespace: str = Sandbox.NAMESPACE
    reason: str | None = None
    diff: dict[str, Any] | None = None
    approval_ref: str | None = None
    policy_decision_ref: str | None = None


class AgentDebugQueryRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    query: dict[str, Any]
    reason: str | None = None


class AiConversationCreateRequest(StrictModel):
    message: str = Field(min_length=1, max_length=MAX_AI_MESSAGE_LENGTH)
    title: str | None = Field(default=None, max_length=120)
    agent: str = Field(default=DEFAULT_AI_AGENT, min_length=1, max_length=80)
    context: dict[str, Any] = Field(default_factory=dict)


class AiMessageCreateRequest(StrictModel):
    message: str = Field(min_length=1, max_length=MAX_AI_MESSAGE_LENGTH)
    agent: str | None = Field(default=None, min_length=1, max_length=80)
    context: dict[str, Any] = Field(default_factory=dict)


class ApprovalDecisionRequest(StrictModel):
    reason: str | None = None


class CommandStartRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str
    lease_id: str


class CommandHeartbeatRequest(CommandStartRequest):
    pass


class CommandResultRequest(StrictModel):
    status: Literal["completed", "failed"] = DEFAULT_COMMAND_STATUS
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    workspace_id: str = DEFAULT_WORKSPACE_ID
    agent_id: str
    lease_id: str
    applied: bool = False
    message: str = EMPTY_COMMAND_MESSAGE
    retryable: bool = False
    resources: list[dict[str, Any]] = Field(default_factory=list)
    stdout: str = ""
    stderr: str = ""


class EvidenceJobScheduleRequest(StrictModel):
    source_id: str = "cluster-snapshot"
    window_start: str
    provider_keys: list[str] = Field(min_length=1)


class EvidenceJobResultRequest(StrictModel):
    agent_id: str
    lease_id: str
    status: Literal["completed", "failed"]
    result: dict[str, Any] = Field(default_factory=dict)
    error: str = ""


class EvidenceProviderPolicy(StrictModel):
    enabled: bool = True
    interval_seconds: int = Field(default=DEFAULT_PROVIDER_INTERVAL_SECONDS, ge=1)
    min_workers: int = Field(default=DEFAULT_PROVIDER_MIN_WORKERS, ge=0)
    max_workers: int = Field(default=DEFAULT_PROVIDER_MAX_WORKERS, ge=0)
    queue_age_target_seconds: int = Field(default=DEFAULT_QUEUE_AGE_TARGET_SECONDS, ge=1)
    queries: list[dict[str, Any]] = Field(default_factory=list)


class EvidenceRuntimePolicy(StrictModel):
    failure_policy: Literal["allow_partial", "strict"] = "allow_partial"
    max_attempts: int = Field(
        default=DEFAULT_EVIDENCE_JOB_MAX_ATTEMPTS,
        ge=1,
        le=MAX_EVIDENCE_JOB_MAX_ATTEMPTS,
    )
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
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    cluster_role: Literal["management", "target"] = "target"
    evidence: EvidenceRuntimePolicy = Field(default_factory=EvidenceRuntimePolicy)
    bootstrap: BootstrapPolicy = Field(default_factory=BootstrapPolicy)
    desired_state: DesiredStatePolicy = Field(default_factory=DesiredStatePolicy)


class AgentPolicyResponse(StrictModel):
    policy: AgentPolicy | None = None


class AgentPolicyStatusRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    status: Literal["applied", "failed", "unchanged"] = "applied"
    message: str = EMPTY_COMMAND_MESSAGE
    details: dict[str, Any] = Field(default_factory=dict)


class ProviderSelectionRequest(StrictModel):
    source_provider: str | None = None
    deploy_provider: str | None = None
    cloud_provider: str | None = None
    secret_provider: str | None = None
    capabilities: list[str] = Field(default_factory=list)
    credential_refs: dict[str, str] = Field(default_factory=dict)


class AgentReconcileStatusRequest(StrictModel):
    cluster_id: str = Target.DEFAULT_CLUSTER_ID
    generation: int = Field(default=DEFAULT_AGENT_POLICY_GENERATION, ge=1)
    status: Literal["applied", "failed", "unchanged"] = "unchanged"
    message: str = EMPTY_COMMAND_MESSAGE
    details: dict[str, Any] = Field(default_factory=dict)
