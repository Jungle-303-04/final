"""target 도메인 HTTP 라우터 — target 등록 시 Kubernetes 설치 manifest 생성/적용."""

from __future__ import annotations

import asyncio
import re
import secrets
import shlex
import shutil
import subprocess
import time
from dataclasses import fields
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse

from domains.identity.dependencies import (
    ClusterAgentIdentity,
    hash_agent_token,
    require_admin_session,
    require_cluster_access,
    require_cluster_agent,
    require_session,
)
from domains.inventory.kubernetes_snapshot import kubernetes_evidence_to_inventory_snapshot
from domains.providers.catalog import ProviderCategory, require_available_provider
from domains.rca.events import ClusterEvidenceReceivedBody, compact_cluster_evidence_payload
from domains.target.events import (
    ClusterDesiredStateChangedBody,
    EvidenceJobUpdatedBody,
    TargetDesiredComponent,
)
from domains.target.evidence_jobs import (
    DEFAULT_EVIDENCE_JOB_LEASE_SECONDS,
    DEFAULT_EVIDENCE_SOURCE_ID,
    DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS,
    PENDING_EVIDENCE_EVENT_ID_PREFIX,
)
from domains.target.evidence_policy import (
    default_agent_policy,
    enabled_provider_keys,
    provider_policy_snapshots,
)
from domains.target.install_manifest import target_install_manifest
from domains.target.management_guard import (
    MANAGEMENT_CLUSTER_ROLE,
    freeze_management_policy,
    is_management_registration,
    is_management_role,
    management_policy_update_is_forbidden,
    management_readonly_detail,
)
from domains.target.reconciler import desired_state_version
from packages.config.security import (
    TEST_FIXTURE_ENVIRONMENT,
    test_fixture_purge_enabled,
)
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.policy_merge import merge_agent_policy
from packages.contracts.gateway.requests import (
    AgentPolicy,
    AgentPolicyResponse,
    AgentPolicyStatusRequest,
    AgentReconcileStatusRequest,
    EvidenceJobResultRequest,
    EvidenceJobScheduleRequest,
    SchedulingPolicy,
    TargetPreflightRequest,
    TargetRegisterRequest,
)
from packages.contracts.gateway.responses import (
    BootstrapStep,
    ClusterConnectionStatusResponse,
    ClusterListResponse,
    ClusterResponse,
    ClusterSummary,
    EvidenceJobPollResponse,
    EvidenceJobResultResponse,
    EvidenceJobScheduleResponse,
    SchedulingPolicyResponse,
    TargetInstallResponse,
    TargetPreflightResponse,
)
from packages.contracts.identity import (
    DEFAULT_WORKSPACE_ID,
    AccessResourceType,
    ClusterRegistrationStatus,
    Permission,
)
from packages.contracts.target import TARGET_NAMESPACE, TargetComponent
from packages.events.envelope import event
from packages.runtime.dependencies import get_db, get_events
from packages.storage.engine import unit_of_work_or_null
from packages.storage.retry import to_thread_db_retry

AGENT_TOKEN_BYTES = 32  # per-cluster agent 토큰 엔트로피(secrets.token_urlsafe)
KUBECTL_NOT_AVAILABLE = "kubectl is not available to api-gateway"
KUBECTL_APPLY_FAILED = "target install apply failed"
KUBECTL_APPLY_TIMEOUT = "target install apply timed out"
KUBECTL_APPLY_TIMEOUT_SECONDS_ENV = "KUBECTL_APPLY_TIMEOUT_SECONDS"
DEFAULT_KUBECTL_APPLY_TIMEOUT_SECONDS = "30"
# 콤마구분 허용 컨텍스트 목록. 설정 시 목록 밖 --context 거부(임의 클러스터 적용 차단).
# 미설정 시 컨텍스트 미지정(현재 kubeconfig)만 허용 — 페이로드로 임의 컨텍스트 지정 불가.
KUBE_CONTEXT_ALLOWLIST_ENV = "KUBE_CONTEXT_ALLOWLIST"
KUBE_CONTEXT_NOT_ALLOWED = "kube context is not in the allowlist"
KUBE_CONTEXT_CONNECTION_FAILED = "kubernetes preflight connection failed"
KUBE_CONTEXT_CONNECTION_TIMEOUT = "kubernetes preflight connection timed out"
DIRECT_APPLY_DEPLOY_PROVIDER = "kube-context"
MANUAL_MANIFEST_DEPLOY_PROVIDER = "manual-manifest"
TARGET_PROVIDER_INVALID = "target install provider selection is invalid"
# evidence job 롱폴 튜닝값 — env 미설정 시 기존 기본값과 동일한 기본값이 적용됨(배포 호환)
DEFAULT_EVIDENCE_JOB_POLL_SECONDS_ENV = (
    "EVIDENCE_JOB_POLL_DEFAULT_SECONDS"  # 롱폴 기본 대기 초(기본 10)
)
DEFAULT_EVIDENCE_JOB_POLL_SECONDS = int(env(DEFAULT_EVIDENCE_JOB_POLL_SECONDS_ENV, "10"))
MAX_EVIDENCE_JOB_POLL_SECONDS_ENV = "EVIDENCE_JOB_POLL_MAX_SECONDS"  # 롱폴 최대 대기 초(기본 30)
MAX_EVIDENCE_JOB_POLL_SECONDS = int(env(MAX_EVIDENCE_JOB_POLL_SECONDS_ENV, "30"))
EVIDENCE_JOB_POLL_SLEEP_SECONDS_ENV = (
    "EVIDENCE_JOB_POLL_SLEEP_SECONDS"  # 롱폴 반복 간 대기 초(기본 1)
)
EVIDENCE_JOB_POLL_SLEEP_SECONDS = int(env(EVIDENCE_JOB_POLL_SLEEP_SECONDS_ENV, "1"))
NOT_FOUND_CODE = 404
EVIDENCE_JOB_NOT_FOUND = "evidence job not found"
RELEASE_WORKFLOW_FAILURE_SOURCE_ID = "release-workflow-failure"
AGENT_ONLINE_WINDOW_SECONDS_ENV = "AGENT_ONLINE_WINDOW_SECONDS"
DEFAULT_AGENT_ONLINE_WINDOW_SECONDS = 120
AGENT_STATUS_NEVER_CONNECTED = "never_connected"
AGENT_STATUS_ONLINE = "online"
AGENT_STATUS_STALE = "stale"
TARGET_AGENT_IMAGE_ENV = "TARGET_AGENT_IMAGE"
GITOPS_WEBHOOK_IMAGE_ENV = "GITOPS_WEBHOOK_IMAGE"
PUBLIC_MANAGEMENT_BASE_URL_ENV = "PUBLIC_MANAGEMENT_BASE_URL"
PUBLIC_API_BASE_URL_ENV = "PUBLIC_API_BASE_URL"
PUBLIC_BASE_URL_ENV = "PUBLIC_BASE_URL"
LOCAL_PLACEHOLDER_IMAGES = {"", "service:local", "kubeheal-service:latest"}
BLOCKED_TEST_CLUSTER_IDS = {"bruno-api-test"}
BLOCKED_TEST_CLUSTER_NAME_PARTS = ("bruno api test",)
CLUSTER_ID_PATTERN = re.compile(r"^[a-z0-9]([-a-z0-9]*[a-z0-9])?$")
AGENT_STATUS_NOT_REGISTERED = "not_registered"
AGENT_STATUS_PENDING_INSTALL = ClusterRegistrationStatus.PENDING_INSTALL.value
AGENT_STATUS_INSTALL_EXPIRED = ClusterRegistrationStatus.INSTALL_EXPIRED.value
TARGET_AGENT_IMAGE_NOT_CONFIGURED = "target agent image is not configured"
MANAGEMENT_BASE_URL_NOT_CONFIGURED = "management base URL is not configured"
TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS_ENV = "TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS"
TARGET_REGISTRATION_AUTO_DELETE_EXPIRED_ENV = "TARGET_REGISTRATION_AUTO_DELETE_EXPIRED"
DEFAULT_TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS = 1800
CLUSTER_NOT_FOUND = "cluster not found"
TEST_FIXTURE_PURGE_FORBIDDEN_CODE = "test_fixture_purge_forbidden"
TEST_FIXTURE_PURGE_UNSUPPORTED_CODE = "test_fixture_purge_unsupported"

router = APIRouter()
# per-cluster 토큰 인증 — lease 의 workspace/cluster 는 토큰 identity 에서만 취함.
agent_router = APIRouter()


def target_desired_components(payload: TargetRegisterRequest) -> list[TargetDesiredComponent]:
    """등록 요청을 target cluster desired-state 컴포넌트로 정규화함.

    Secret 원문(agent token)은 desired-state에 저장하지 않음. 운영 구현에서는
    이 spec을 Helm/Kustomize/CRD desired state로 확장함.
    """

    return [
        TargetDesiredComponent(
            component=TargetComponent.CLUSTER_AGENT.value,
            namespace=TARGET_NAMESPACE,
            version=payload.image,
            spec={
                "deployment": "cluster-agent",
                "management_base_url": payload.management_base_url,
                "cluster_role": payload.cluster_role,
                "evidence_interval_seconds": payload.evidence_interval_seconds,
                "prometheus_base_url": payload.prometheus_base_url,
                "loki_base_url": payload.loki_base_url,
                "tempo_base_url": payload.tempo_base_url,
                "otel_traces_endpoint": payload.otel_traces_endpoint,
            },
        ),
        TargetDesiredComponent(
            component=TargetComponent.NODE_COLLECTOR.value,
            namespace=TARGET_NAMESPACE,
            version=payload.image,
            spec={
                "enabled": payload.install_node_collector,
                "daemonset": "optional-node-collector",
                "managed_by": TargetComponent.CLUSTER_AGENT.value,
            },
        ),
    ]


def allowed_kube_contexts() -> set[str]:
    raw = env(KUBE_CONTEXT_ALLOWLIST_ENV, "")
    return {item.strip() for item in raw.split(",") if item.strip()}


def normalized_management_base_url(value: str) -> str:
    base = value.strip().rstrip("/")
    if not base:
        return ""
    return base if base.endswith("/api") else f"{base}/api"


def public_management_base_url() -> str:
    for key in (
        PUBLIC_MANAGEMENT_BASE_URL_ENV,
        PUBLIC_API_BASE_URL_ENV,
        PUBLIC_BASE_URL_ENV,
    ):
        base = normalized_management_base_url(env(key, ""))
        if base:
            return base
    return ""


def target_registration_connect_timeout_seconds() -> int:
    raw = env(
        TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS_ENV,
        str(DEFAULT_TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS),
    )
    try:
        return max(60, int(raw))
    except ValueError:
        return DEFAULT_TARGET_REGISTRATION_CONNECT_TIMEOUT_SECONDS


def connect_expires_at_from(created_at: datetime, timeout_seconds: int) -> str:
    return (created_at + timedelta(seconds=timeout_seconds)).isoformat()


def shell_quote(value: object) -> str:
    return shlex.quote(str(value))


def provider_config_text(payload: TargetRegisterRequest, key: str, default: str = "") -> str:
    value = payload.provider_config.get(key, default)
    return str(value).strip() if value is not None else ""


def require_provider_config(payload: TargetRegisterRequest, *keys: str) -> dict[str, str]:
    values = {key: provider_config_text(payload, key) for key in keys}
    missing = [key for key, value in values.items() if not value]
    if missing:
        joined = ", ".join(missing)
        raise HTTPException(
            status_code=422,
            detail=f"provider_config is missing required fields: {joined}",
        )
    return values


def normalize_target_provider_defaults(payload: TargetRegisterRequest) -> TargetRegisterRequest:
    updates: dict[str, Any] = {}
    if payload.apply and "deploy_provider" not in payload.model_fields_set:
        updates["deploy_provider"] = DIRECT_APPLY_DEPLOY_PROVIDER

    image = payload.image.strip()
    if image in LOCAL_PLACEHOLDER_IMAGES:
        default_image = env(TARGET_AGENT_IMAGE_ENV, "") or env(GITOPS_WEBHOOK_IMAGE_ENV, "")
        if default_image:
            updates["image"] = default_image

    management_base_url = normalized_management_base_url(payload.management_base_url)
    if not management_base_url:
        management_base_url = public_management_base_url()
    if management_base_url:
        updates["management_base_url"] = management_base_url

    if payload.cluster_role == MANAGEMENT_CLUSTER_ROLE:
        updates["install_node_collector"] = False
        updates["install_sample_workload"] = False
        updates["control_namespaces"] = ""
        for telemetry_field in (
            "prometheus_base_url",
            "loki_base_url",
            "tempo_base_url",
            "otel_traces_endpoint",
        ):
            if telemetry_field not in payload.model_fields_set:
                updates[telemetry_field] = ""

    return payload.model_copy(update=updates) if updates else payload


def slugify_cluster_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9-]+", "-", name.strip().lower())
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "cluster"


def generated_cluster_id(name: str) -> str:
    suffix = f"{secrets.randbelow(10_000):04d}"
    base = slugify_cluster_name(name)[:58].strip("-") or "cluster"
    return f"{base}-{suffix}"


def resolve_target_cluster_id(payload: TargetRegisterRequest, workspace_id: str, db: Any) -> str:
    explicit = (payload.cluster_id or "").strip()
    if explicit:
        if not CLUSTER_ID_PATTERN.match(explicit):
            raise HTTPException(
                status_code=422,
                detail="cluster_id must use lowercase letters, numbers, and hyphens",
            )
        return explicit
    getter = getattr(db, "get_cluster_registration", None)
    for _ in range(20):
        candidate = generated_cluster_id(payload.name)
        if not callable(getter) or getter(workspace_id, candidate) is None:
            return candidate
    raise HTTPException(status_code=409, detail="cluster_id generation collided")


def reject_test_target(payload: TargetRegisterRequest) -> None:
    name = payload.name.lower()
    if (payload.cluster_id or "") in BLOCKED_TEST_CLUSTER_IDS or any(
        marker in name for marker in BLOCKED_TEST_CLUSTER_NAME_PARTS
    ):
        raise HTTPException(status_code=422, detail="test target registrations are not allowed")
    if payload.image.strip() in LOCAL_PLACEHOLDER_IMAGES:
        raise HTTPException(status_code=422, detail="target agent image is not configured")


def require_management_base_url(payload: TargetRegisterRequest) -> None:
    if not payload.management_base_url.strip():
        raise HTTPException(status_code=422, detail=MANAGEMENT_BASE_URL_NOT_CONFIGURED)


def validate_target_install_providers(payload: TargetRegisterRequest) -> None:
    try:
        require_available_provider(ProviderCategory.CLOUD, payload.cloud_provider)
        require_available_provider(ProviderCategory.DEPLOY, payload.deploy_provider)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"{TARGET_PROVIDER_INVALID}: {exc}") from exc

    if payload.apply and payload.deploy_provider != DIRECT_APPLY_DEPLOY_PROVIDER:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{TARGET_PROVIDER_INVALID}: direct apply requires "
                f"deploy_provider={DIRECT_APPLY_DEPLOY_PROVIDER}"
            ),
        )
    if payload.kube_context and payload.deploy_provider != DIRECT_APPLY_DEPLOY_PROVIDER:
        raise HTTPException(
            status_code=422,
            detail=(
                f"{TARGET_PROVIDER_INVALID}: kube_context requires "
                f"deploy_provider={DIRECT_APPLY_DEPLOY_PROVIDER}"
            ),
        )


def validate_target_bootstrap_config(payload: TargetRegisterRequest) -> None:
    if payload.cloud_provider == "eks":
        require_provider_config(payload, "region", "eks_cluster_name")
    if payload.cloud_provider == "gke":
        values = require_provider_config(
            payload, "project_id", "location_type", "location", "gke_cluster_name"
        )
        if values["location_type"] not in {"region", "zone"}:
            raise HTTPException(
                status_code=422,
                detail="provider_config.location_type must be region or zone",
            )
    if payload.cloud_provider == "aks":
        require_provider_config(payload, "resource_group", "aks_cluster_name")


def target_agent_image_ready(image: str = "") -> bool:
    candidate = image.strip()
    if candidate and candidate not in LOCAL_PLACEHOLDER_IMAGES:
        return True
    return bool(env(TARGET_AGENT_IMAGE_ENV, "") or env(GITOPS_WEBHOOK_IMAGE_ENV, ""))


def target_preflight_provider_checks(
    payload: TargetPreflightRequest,
) -> tuple[bool, list[str], list[str], dict[str, Any], bool | None]:
    errors: list[str] = []
    warnings: list[str] = []
    selected: dict[str, Any] = {}
    provider_errors = 0

    for category, key in (
        (ProviderCategory.CLOUD, payload.cloud_provider),
        (ProviderCategory.DEPLOY, payload.deploy_provider),
    ):
        try:
            selected[category.value] = require_available_provider(category, key).to_body()
        except ValueError as exc:
            errors.append(f"{TARGET_PROVIDER_INVALID}: {exc}")
            provider_errors += 1

    if payload.apply and payload.deploy_provider != DIRECT_APPLY_DEPLOY_PROVIDER:
        errors.append(
            f"{TARGET_PROVIDER_INVALID}: direct apply requires "
            f"deploy_provider={DIRECT_APPLY_DEPLOY_PROVIDER}"
        )
        provider_errors += 1
    if payload.kube_context and payload.deploy_provider != DIRECT_APPLY_DEPLOY_PROVIDER:
        errors.append(
            f"{TARGET_PROVIDER_INVALID}: kube_context requires "
            f"deploy_provider={DIRECT_APPLY_DEPLOY_PROVIDER}"
        )
        provider_errors += 1

    kube_context_allowed: bool | None = None
    allowlist = allowed_kube_contexts()
    if payload.kube_context:
        kube_context_allowed = payload.kube_context in allowlist
        if not kube_context_allowed:
            errors.append(KUBE_CONTEXT_NOT_ALLOWED)
            provider_errors += 1
    elif payload.apply and payload.deploy_provider == DIRECT_APPLY_DEPLOY_PROVIDER and allowlist:
        kube_context_allowed = False
        errors.append(KUBE_CONTEXT_NOT_ALLOWED)
        provider_errors += 1

    if payload.deploy_provider == DIRECT_APPLY_DEPLOY_PROVIDER and not allowlist:
        warnings.append(
            "KUBE_CONTEXT_ALLOWLIST is empty; direct apply can only use the api-gateway "
            "process current kube context"
        )

    if not target_agent_image_ready(payload.image):
        errors.append(TARGET_AGENT_IMAGE_NOT_CONFIGURED)
        provider_errors += 1
    if (
        not normalized_management_base_url(payload.management_base_url)
        and not public_management_base_url()
    ):
        errors.append(MANAGEMENT_BASE_URL_NOT_CONFIGURED)
        provider_errors += 1

    if (
        payload.deploy_provider == DIRECT_APPLY_DEPLOY_PROVIDER
        and payload.apply
        and kube_context_allowed is not False
        and provider_errors == 0
    ):
        connection_error = kube_context_connectivity_error(payload.kube_context)
        if connection_error:
            errors.append(connection_error)
            provider_errors += 1

    return provider_errors == 0, errors, warnings, selected, kube_context_allowed


def kube_context_connectivity_error(kube_context: str | None) -> str | None:
    if not shutil.which("kubectl"):
        return KUBECTL_NOT_AVAILABLE
    command = ["kubectl"]
    if kube_context:
        command.extend(["--context", kube_context])
    command.extend(["get", "--raw=/version", "--request-timeout=5s"])
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
            timeout=6,
        )
    except subprocess.TimeoutExpired:
        return KUBE_CONTEXT_CONNECTION_TIMEOUT
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip().splitlines()
        suffix = f": {detail[0][:160]}" if detail else ""
        return f"{KUBE_CONTEXT_CONNECTION_FAILED}{suffix}"
    return None


def apply_manifest_with_kubectl(manifest: str, kube_context: str | None) -> str:
    # 입력(컨텍스트) 검증을 먼저 — 허용목록이 비어있으면(미설정) 어떤 명시 컨텍스트도
    # 거부(fail-closed), 설정돼 있으면 목록에 든 컨텍스트만 허용. 임의 클러스터 적용 차단.
    allowlist = allowed_kube_contexts()
    if allowlist and not kube_context:
        raise HTTPException(status_code=403, detail=KUBE_CONTEXT_NOT_ALLOWED)
    if kube_context and kube_context not in allowlist:
        raise HTTPException(status_code=403, detail=KUBE_CONTEXT_NOT_ALLOWED)
    if not shutil.which("kubectl"):
        raise HTTPException(status_code=503, detail=KUBECTL_NOT_AVAILABLE)
    command = ["kubectl"]
    if kube_context:
        command.extend(["--context", kube_context])
    command.extend(["apply", "-f", "-"])
    try:
        result = subprocess.run(
            command,
            input=manifest,
            capture_output=True,
            text=True,
            check=False,
            timeout=float(
                env(KUBECTL_APPLY_TIMEOUT_SECONDS_ENV, DEFAULT_KUBECTL_APPLY_TIMEOUT_SECONDS)
            ),
        )
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail=KUBECTL_APPLY_TIMEOUT) from exc
    if result.returncode != 0:
        raise HTTPException(status_code=502, detail=KUBECTL_APPLY_FAILED)
    return result.stdout


def install_command_for(payload: TargetRegisterRequest, agent_token: str) -> str:
    """원라인 설치 명령 — 토큰이 박힌 manifest URL 을 kubectl 로 바로 적용.

    base 는 등록 payload 의 management_base_url(agent 가 접속하는 공개 게이트웨이 주소)
    그대로 사용 — 서버가 임의 호스트를 합성하지 않음.
    """
    base = payload.management_base_url.strip().rstrip("/")
    if not base:
        return ""
    path = gateway_routes.INSTALL_MANIFEST_PATH.format(agent_token=agent_token)
    return f"curl -fsSL {shell_quote(f'{base}{path}')} | kubectl apply -f -"


def kubectl_apply_command(
    payload: TargetRegisterRequest, agent_token: str, context: str = ""
) -> str:
    base = payload.management_base_url.strip().rstrip("/")
    if not base:
        return ""
    path = gateway_routes.INSTALL_MANIFEST_PATH.format(agent_token=agent_token)
    kubectl = "kubectl"
    if context:
        kubectl = f"kubectl --context {shell_quote(context)}"
    return f"curl -fsSL {shell_quote(f'{base}{path}')} | {kubectl} apply -f -"


def bootstrap_command_for(payload: TargetRegisterRequest, agent_token: str) -> str:
    cloud_provider = payload.cloud_provider.strip()
    base_install = install_command_for(payload, agent_token)
    if cloud_provider == "eks":
        values = require_provider_config(payload, "region", "eks_cluster_name")
        context_alias = provider_config_text(payload, "context_alias", payload.cluster_id or "")
        return (
            "aws eks update-kubeconfig "
            f"--region {shell_quote(values['region'])} "
            f"--name {shell_quote(values['eks_cluster_name'])} "
            f"--alias {shell_quote(context_alias)} "
            f"&& kubectl --context {shell_quote(context_alias)} get nodes "
            f"&& {kubectl_apply_command(payload, agent_token, context_alias)}"
        )
    if cloud_provider == "gke":
        values = require_provider_config(
            payload, "project_id", "location_type", "location", "gke_cluster_name"
        )
        if values["location_type"] not in {"region", "zone"}:
            raise HTTPException(
                status_code=422,
                detail="provider_config.location_type must be region or zone",
            )
        location_flag = "--zone" if values["location_type"] == "zone" else "--region"
        return (
            "gcloud container clusters get-credentials "
            f"{shell_quote(values['gke_cluster_name'])} "
            f"--project {shell_quote(values['project_id'])} "
            f"{location_flag} {shell_quote(values['location'])} "
            f"&& kubectl get nodes "
            f"&& {base_install}"
        )
    if cloud_provider == "aks":
        values = require_provider_config(payload, "resource_group", "aks_cluster_name")
        return (
            "az aks get-credentials "
            f"--resource-group {shell_quote(values['resource_group'])} "
            f"--name {shell_quote(values['aks_cluster_name'])} "
            "--overwrite-existing "
            f"&& kubectl get nodes "
            f"&& {base_install}"
        )
    if cloud_provider == "existing-k8s":
        context = provider_config_text(payload, "context_name", payload.kube_context or "")
        if context:
            return (
                f"kubectl --context {shell_quote(context)} get nodes "
                f"&& {kubectl_apply_command(payload, agent_token, context)}"
            )
        return base_install
    if cloud_provider == "kind":
        name = provider_config_text(
            payload, "kind_cluster_name", payload.name or payload.cluster_id
        )
        context = f"kind-{name.removeprefix('kind-')}"
        return (
            f"kubectl --context {shell_quote(context)} get nodes "
            f"&& {kubectl_apply_command(payload, agent_token, context)}"
        )
    if cloud_provider == "minikube":
        context = provider_config_text(payload, "profile", "minikube")
        return (
            f"kubectl --context {shell_quote(context)} get nodes "
            f"&& {kubectl_apply_command(payload, agent_token, context)}"
        )
    return base_install


def bootstrap_steps_for(payload: TargetRegisterRequest, command: str) -> list[BootstrapStep]:
    steps = [
        BootstrapStep(label="kubeconfig 확인", command="kubectl config current-context"),
    ]
    if command:
        steps.append(BootstrapStep(label="target agent 설치", command=command))
    steps.append(BootstrapStep(label="연결 확인", command="kubectl -n target get pods"))
    return steps


def install_response(
    payload: TargetRegisterRequest,
    manifest: str,
    apply_output: str | None,
    agent_token: str,
    *,
    connect_timeout_seconds: int | None = None,
    connect_expires_at: str | None = None,
) -> TargetInstallResponse:
    bootstrap_command = bootstrap_command_for(payload, agent_token)
    return TargetInstallResponse(
        registered=True,
        cluster_id=payload.cluster_id,
        status=ClusterRegistrationStatus.PENDING_INSTALL.value,
        applied=apply_output is not None,
        apply_output=apply_output,
        install_manifest=manifest,
        agent_token=agent_token,
        install_command=install_command_for(payload, agent_token),
        bootstrap_command=bootstrap_command,
        bootstrap_steps=bootstrap_steps_for(payload, bootstrap_command),
        connect_timeout_seconds=connect_timeout_seconds,
        connect_expires_at=connect_expires_at,
    )


def agent_online_window_seconds() -> int:
    return max(
        1,
        int(env(AGENT_ONLINE_WINDOW_SECONDS_ENV, str(DEFAULT_AGENT_ONLINE_WINDOW_SECONDS))),
    )


def parse_timestamp(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed


def cluster_connection_status(agent: dict[str, Any] | None) -> str:
    if agent is None:
        return AGENT_STATUS_NEVER_CONNECTED
    last_seen_at = parse_timestamp(agent.get("last_seen_at"))
    if last_seen_at is None:
        return AGENT_STATUS_STALE
    online_window = timedelta(seconds=agent_online_window_seconds())
    return (
        AGENT_STATUS_ONLINE
        if datetime.now(UTC) - last_seen_at <= online_window
        else AGENT_STATUS_STALE
    )


def visible_cluster_agent_statuses(agents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """활성 agent만 노출하고, 모두 오래됐으면 최근 상태 한 건을 보존한다."""
    online_agents = [
        agent for agent in agents if cluster_connection_status(agent) == AGENT_STATUS_ONLINE
    ]
    return online_agents or agents[:1]


def registration_connect_timeout(registration: dict[str, Any] | None) -> int | None:
    settings = (registration or {}).get("settings") or {}
    value = settings.get("connect_timeout_seconds")
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def registration_connect_expires_at(registration: dict[str, Any] | None) -> str | None:
    settings = (registration or {}).get("settings") or {}
    value = settings.get("connect_expires_at")
    return str(value) if value else None


def registration_connection_status(
    registration: dict[str, Any] | None,
    latest_agent: dict[str, Any] | None,
) -> str:
    agent_status = cluster_connection_status(latest_agent)
    if latest_agent is not None:
        return agent_status
    if registration is None:
        return AGENT_STATUS_NEVER_CONNECTED
    status = str(registration.get("status") or "")
    expires_at = parse_timestamp(registration_connect_expires_at(registration))
    if status == ClusterRegistrationStatus.PENDING_INSTALL.value:
        if expires_at is not None and datetime.now(UTC) > expires_at:
            return AGENT_STATUS_INSTALL_EXPIRED
        return AGENT_STATUS_PENDING_INSTALL
    if status == ClusterRegistrationStatus.INSTALL_EXPIRED.value:
        return AGENT_STATUS_INSTALL_EXPIRED
    return agent_status


def require_test_fixture_purge_environment(registration: dict[str, Any]) -> None:
    registration_environment = str(registration.get("environment") or "")
    if test_fixture_purge_enabled() and registration_environment == TEST_FIXTURE_ENVIRONMENT:
        return
    raise HTTPException(
        status_code=403,
        detail={
            "code": TEST_FIXTURE_PURGE_FORBIDDEN_CODE,
            "detail": (
                "테스트 fixture purge는 TEST_FIXTURE_PURGE_ENABLED=1 및 "
                "environment=test에서만 허용됩니다"
            ),
        },
    )


def unregisterable_registration(db: Any, workspace_id: str, cluster_id: str) -> dict[str, Any]:
    registration = db.get_cluster_registration(workspace_id, cluster_id)
    if registration is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=CLUSTER_NOT_FOUND)
    if is_management_registration(registration):
        raise HTTPException(status_code=400, detail=management_readonly_detail())
    return registration


def cluster_summary(cluster: dict[str, Any], latest_agent: dict[str, Any] | None) -> ClusterSummary:
    connection_status = registration_connection_status(cluster, latest_agent)
    status = (
        ClusterRegistrationStatus.INSTALL_EXPIRED.value
        if connection_status == AGENT_STATUS_INSTALL_EXPIRED
        else cluster["status"]
    )
    return ClusterSummary(
        workspace_id=cluster["workspace_id"],
        cluster_id=cluster["cluster_id"],
        name=cluster["name"],
        environment=cluster["environment"],
        status=status,
        settings=cluster.get("settings") or {},
        connection_status=connection_status,
        last_agent_id=latest_agent.get("agent_id") if latest_agent else None,
        last_agent_seen_at=latest_agent.get("last_seen_at") if latest_agent else None,
        created_at=cluster.get("created_at"),
        updated_at=cluster.get("updated_at"),
    )


def touch_agent_seen(
    db: Any,
    identity: ClusterAgentIdentity,
    agent_id: str | None,
    *,
    status: str = "connected",
) -> None:
    if not agent_id:
        return
    # heartbeat 는 best-effort — 저장소가 메서드를 제공하지 않으면 폴링을 막지 않고 건너뜀.
    saver = getattr(db, "save_cluster_agent_status", None)
    if saver is None:
        return
    saver(
        workspace_id=identity.workspace_id,
        cluster_id=identity.cluster_id,
        agent_id=agent_id,
        capabilities=None,
        status=status,
        details={"heartbeat_source": "agent_api"},
    )


def inventory_counts(counts: list[dict[str, Any]]) -> dict[str, int]:
    totals: dict[str, int] = {}
    for row in counts:
        resource_type = str(row.get("resource_type") or "")
        totals[resource_type] = totals.get(resource_type, 0) + int(row.get("count") or 0)
    return totals


def target_register_payload_from_settings(settings: dict[str, Any]) -> TargetRegisterRequest:
    allowed = set(TargetRegisterRequest.model_fields)
    return TargetRegisterRequest(
        **{key: value for key, value in settings.items() if key in allowed}
    )


# require_admin_session 이 세션을 검증 → base router 에 둠.
# (라우터 단위 require_session + require_admin_session = 이중 검증/레이트리밋 2배 회피)
@router.post(gateway_routes.TARGETS_PREFLIGHT_PATH, response_model=TargetPreflightResponse)
async def target_registration_preflight(
    payload: TargetPreflightRequest,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> TargetPreflightResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    cluster_id = payload.cluster_id.strip()
    errors: list[str] = []
    warnings: list[str] = []

    if not cluster_id:
        errors.append("cluster_id is required")
    elif not CLUSTER_ID_PATTERN.match(cluster_id):
        errors.append("cluster_id must use lowercase letters, numbers, and hyphens")
    if cluster_id in BLOCKED_TEST_CLUSTER_IDS:
        errors.append("test target registrations are not allowed")

    provider_ready, provider_errors, provider_warnings, selected, kube_context_allowed = (
        target_preflight_provider_checks(payload)
    )
    errors.extend(provider_errors)
    warnings.extend(provider_warnings)

    existing = None
    getter = getattr(db, "get_cluster_registration", None)
    if cluster_id and callable(getter):
        existing = getter(workspace_id, cluster_id)
    duplicate_cluster_id = existing is not None
    if duplicate_cluster_id:
        errors.append("cluster_id is already registered")

    agents: list[dict[str, Any]] = []
    lister = getattr(db, "list_cluster_agent_statuses", None)
    if cluster_id and callable(lister):
        agents = visible_cluster_agent_statuses(lister(workspace_id, cluster_id))
    latest_agent = agents[0] if agents else None
    connection_status = (
        cluster_connection_status(latest_agent)
        if duplicate_cluster_id or latest_agent
        else AGENT_STATUS_NOT_REGISTERED
    )

    return TargetPreflightResponse(
        valid=not errors,
        duplicate_cluster_id=duplicate_cluster_id,
        provider_ready=provider_ready,
        agent_install_status=connection_status,
        connection_status=connection_status,
        kube_context_allowed=kube_context_allowed,
        errors=errors,
        warnings=warnings,
        selected=selected,
        last_agent_id=latest_agent.get("agent_id") if latest_agent else None,
        last_seen_at=latest_agent.get("last_seen_at") if latest_agent else None,
    )


@router.post(gateway_routes.TARGETS_PATH, response_model=TargetInstallResponse)
async def register_target(
    payload: TargetRegisterRequest,
    current: Any = Depends(require_admin_session),  # kubectl apply 실행 → admin 만
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> TargetInstallResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    cluster_id = resolve_target_cluster_id(payload, workspace_id, db)
    scoped_payload = normalize_target_provider_defaults(payload).model_copy(
        update={"workspace_id": workspace_id, "cluster_id": cluster_id}
    )
    reject_test_target(scoped_payload)
    require_management_base_url(scoped_payload)
    validate_target_install_providers(scoped_payload)
    validate_target_bootstrap_config(scoped_payload)
    components = target_desired_components(scoped_payload)
    version = desired_state_version(components)

    # 클러스터별 agent 토큰 생성 — 원문은 이 클러스터 secret 에만 주입, 해시만 레지스트리에 저장.
    # 전역 AGENT_TOKEN 신뢰를 제거(토큰 1개로 전 워크스페이스 접근하던 구멍 차단). 재등록 시 회전.
    agent_token = secrets.token_urlsafe(AGENT_TOKEN_BYTES)
    manifest = target_install_manifest(scoped_payload, agent_token)
    apply_output = (
        apply_manifest_with_kubectl(manifest, scoped_payload.kube_context)
        if scoped_payload.apply
        else None
    )
    connect_timeout_seconds = target_registration_connect_timeout_seconds()
    created_at = datetime.now(UTC)
    connect_expires_at = connect_expires_at_from(created_at, connect_timeout_seconds)
    registration_settings = scoped_payload.model_dump(exclude={"apply", "kube_context"})
    registration_settings["connect_timeout_seconds"] = connect_timeout_seconds
    registration_settings["connect_expires_at"] = connect_expires_at

    # 클러스터 등록·정책·desired-state·이벤트 스테이징을 한 트랜잭션으로 —
    # 부분 실패 시 정책/desired-state 없는 반쪽 등록(고아)이 남지 않음.
    with unit_of_work_or_null(db):
        db.register_target_cluster(
            {
                "workspace_id": workspace_id,
                "user_id": current.user_id,
                "cluster_id": scoped_payload.cluster_id,
                "name": scoped_payload.name,
                "environment": scoped_payload.environment,
                "status": ClusterRegistrationStatus.PENDING_INSTALL.value,
                "agent_token_hash": hash_agent_token(agent_token),
                "settings": registration_settings,
            }
        )
        if db.get_cluster_policy(workspace_id, scoped_payload.cluster_id) is None:
            policy = default_agent_policy(
                cluster_id=scoped_payload.cluster_id,
                cluster_role=scoped_payload.cluster_role,
                interval_seconds=scoped_payload.evidence_interval_seconds,
                bootstrap_mode=(
                    "management"
                    if scoped_payload.cluster_role == MANAGEMENT_CLUSTER_ROLE
                    else "target"
                ),
            )
            if scoped_payload.cluster_role == MANAGEMENT_CLUSTER_ROLE:
                policy = freeze_management_policy(policy)
            db.upsert_cluster_policy(workspace_id, scoped_payload.cluster_id, policy.model_dump())
        db.upsert_target_desired_states(
            workspace_id,
            scoped_payload.cluster_id,
            [component.to_body() for component in components],
            current.user_id,
        )
        await events.accept_body(
            ClusterDesiredStateChangedBody(
                workspace_id=workspace_id,
                cluster_id=scoped_payload.cluster_id,
                desired_state_version=version,
                components=components,
                reason="target registered",
                requested_by=current.user_id,
            )
        )
    return install_response(
        scoped_payload,
        manifest,
        apply_output,
        agent_token,
        connect_timeout_seconds=connect_timeout_seconds,
        connect_expires_at=connect_expires_at,
    )


@router.get(gateway_routes.INSTALL_MANIFEST_PATH, include_in_schema=True)
async def install_manifest_by_token(
    agent_token: str,
    db: Any = Depends(get_db),
) -> PlainTextResponse:
    """원라인 인스톨러 — `curl <base>/install/<token> | kubectl apply -f -`.

    토큰 자체가 자격증명: 해시 대조로 등록 클러스터를 찾고, 저장된 등록 설정으로
    같은 manifest 를 재렌더해 YAML 로 반환함(서버는 토큰 원문·manifest 를 저장하지 않음).
    미등록/불일치 토큰은 404 — 존재 여부를 구분해 주지 않음.
    """
    identity = db.authenticate_cluster_agent(hash_agent_token(agent_token))
    if identity is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail="install link not found")
    registration = db.get_cluster_registration(identity["workspace_id"], identity["cluster_id"])
    if registration is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail="install link not found")
    payload = target_register_payload_from_settings(registration.get("settings") or {})
    manifest = target_install_manifest(payload, agent_token)
    return PlainTextResponse(
        manifest,
        media_type="text/yaml",
        headers={"Cache-Control": "no-store"},
    )


@router.get(gateway_routes.CLUSTERS_PATH, response_model=ClusterListResponse)
async def list_clusters(
    limit: int = 100,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ClusterListResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    accessible_cluster_ids = db.accessible_resource_ids(
        current.user_id,
        workspace_id,
        AccessResourceType.CLUSTER.value,
        Permission.CLUSTER_READ.value,
    )
    clusters = db.list_cluster_registrations(
        workspace_id,
        cluster_ids=accessible_cluster_ids,
        limit=limit,
    )
    latest_agents = db.latest_cluster_agent_statuses(
        workspace_id,
        {cluster["cluster_id"] for cluster in clusters},
    )
    open_incident_counts = (
        db.count_open_rca_incidents(workspace_id, {cluster["cluster_id"] for cluster in clusters})
        if hasattr(db, "count_open_rca_incidents")
        else {}
    )
    summaries = [
        cluster_summary(cluster, latest_agents.get(cluster["cluster_id"]))
        for cluster in clusters
        if cluster["cluster_id"] not in BLOCKED_TEST_CLUSTER_IDS
        and not any(
            marker in str(cluster["name"]).lower() for marker in BLOCKED_TEST_CLUSTER_NAME_PARTS
        )
    ]
    for summary in summaries:
        if hasattr(db, "inventory_resource_counts"):
            counts = inventory_counts(
                db.inventory_resource_counts(workspace_id, summary.cluster_id)
            )
            summary.node_count = counts.get("node", 0)
            summary.pod_count = counts.get("pod", 0)
        summary.incident_count = int(open_incident_counts.get(summary.cluster_id, 0))
    return ClusterListResponse(clusters=summaries)


@router.get(gateway_routes.CLUSTER_PATH, response_model=ClusterResponse)
async def get_cluster(
    cluster_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ClusterResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.CLUSTER_READ.value,
    )
    cluster = db.get_cluster_registration(workspace_id, cluster_id)
    if cluster is None:
        raise HTTPException(status_code=404, detail=CLUSTER_NOT_FOUND)
    agents = visible_cluster_agent_statuses(
        db.list_cluster_agent_statuses(workspace_id, cluster_id)
    )
    latest_agent = agents[0] if agents else None
    return ClusterResponse(cluster=cluster_summary(cluster, latest_agent), agents=agents)


@router.get(
    gateway_routes.CLUSTER_CONNECTION_STATUS_PATH,
    response_model=ClusterConnectionStatusResponse,
)
async def get_cluster_connection_status(
    cluster_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> ClusterConnectionStatusResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.CLUSTER_READ.value,
    )
    registration_getter = getattr(db, "get_cluster_registration", None)
    registration = (
        registration_getter(workspace_id, cluster_id) if callable(registration_getter) else None
    )
    agents = visible_cluster_agent_statuses(
        db.list_cluster_agent_statuses(workspace_id, cluster_id)
    )
    latest_agent = agents[0] if agents else None
    return ClusterConnectionStatusResponse(
        cluster_id=cluster_id,
        connection_status=registration_connection_status(registration, latest_agent),
        last_agent_id=latest_agent.get("agent_id") if latest_agent else None,
        last_seen_at=latest_agent.get("last_seen_at") if latest_agent else None,
        agents=agents,
        connect_timeout_seconds=registration_connect_timeout(registration),
        connect_expires_at=registration_connect_expires_at(registration),
    )


@router.put(gateway_routes.CLUSTER_POLICY_PATH)
async def update_cluster_policy(
    cluster_id: str,
    payload: AgentPolicy,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> dict[str, Any]:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    if payload.cluster_id != cluster_id:
        raise HTTPException(
            status_code=409,
            detail="cluster_id does not match policy payload",
        )
    existing = db.get_cluster_policy(workspace_id, cluster_id)
    base_policy = (
        AgentPolicy.model_validate(existing)
        if existing
        else default_agent_policy(cluster_id=cluster_id)
    )
    registration_getter = getattr(db, "get_cluster_registration", None)
    registration = (
        registration_getter(workspace_id, cluster_id) if callable(registration_getter) else None
    )
    management_cluster = is_management_registration(registration) or is_management_role(
        base_policy.cluster_role
    )
    if management_cluster:
        if management_policy_update_is_forbidden(payload):
            raise HTTPException(status_code=400, detail=management_readonly_detail())
        base_policy = freeze_management_policy(base_policy)
    merged_policy = merge_agent_policy(base_policy, payload)
    if management_cluster:
        merged_policy = freeze_management_policy(merged_policy)
    try:
        stored = db.upsert_cluster_policy(workspace_id, cluster_id, merged_policy.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"accepted": True, "policy": stored}


def cluster_policy_base(
    db: Any,
    workspace_id: str,
    cluster_id: str,
) -> tuple[AgentPolicy, dict[str, Any] | None, bool]:
    existing = db.get_cluster_policy(workspace_id, cluster_id)
    base_policy = (
        AgentPolicy.model_validate(existing)
        if existing
        else default_agent_policy(cluster_id=cluster_id)
    )
    registration_getter = getattr(db, "get_cluster_registration", None)
    registration = (
        registration_getter(workspace_id, cluster_id) if callable(registration_getter) else None
    )
    management_cluster = is_management_registration(registration) or is_management_role(
        base_policy.cluster_role
    )
    return base_policy, registration, management_cluster


@router.get(
    gateway_routes.CLUSTER_SCHEDULING_PROFILES_PATH,
    response_model=SchedulingPolicyResponse,
)
async def get_cluster_scheduling_profiles(
    cluster_id: str,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> SchedulingPolicyResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    require_cluster_access(
        db,
        current,
        workspace_id,
        cluster_id,
        Permission.CLUSTER_READ.value,
    )
    base_policy, _registration, _management_cluster = cluster_policy_base(
        db,
        workspace_id,
        cluster_id,
    )
    return SchedulingPolicyResponse(
        cluster_id=cluster_id,
        scheduling=base_policy.scheduling.model_dump(),
    )


@router.put(
    gateway_routes.CLUSTER_SCHEDULING_PROFILES_PATH,
    response_model=SchedulingPolicyResponse,
)
async def update_cluster_scheduling_profiles(
    cluster_id: str,
    payload: SchedulingPolicy,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> SchedulingPolicyResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    base_policy, _registration, management_cluster = cluster_policy_base(
        db,
        workspace_id,
        cluster_id,
    )
    if management_cluster:
        raise HTTPException(status_code=400, detail=management_readonly_detail())
    merged_policy = base_policy.model_copy(
        update={
            "generation": base_policy.generation + 1,
            "scheduling": payload,
        }
    )
    try:
        stored = db.upsert_cluster_policy(workspace_id, cluster_id, merged_policy.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    stored_policy = AgentPolicy.model_validate(stored)
    return SchedulingPolicyResponse(
        cluster_id=cluster_id,
        scheduling=stored_policy.scheduling.model_dump(),
    )


@router.delete(gateway_routes.CLUSTER_PATH, status_code=204)
async def unregister_cluster(
    cluster_id: str,
    purge: bool = False,
    current: Any = Depends(require_admin_session),
    db: Any = Depends(get_db),
) -> None:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    if purge:
        # 테스트 fixture 물리 삭제만 별도 UoW로 묶고 운영 soft-delete 경로는 그대로 둔다.
        with unit_of_work_or_null(db):
            registration = unregisterable_registration(db, workspace_id, cluster_id)
            require_test_fixture_purge_environment(registration)
            purge_registration = getattr(db, "purge_test_target_cluster_registration", None)
            if not callable(purge_registration):
                raise HTTPException(
                    status_code=500,
                    detail={
                        "code": TEST_FIXTURE_PURGE_UNSUPPORTED_CODE,
                        "detail": "테스트 fixture purge를 처리할 수 없습니다",
                    },
                )
            if not purge_registration(workspace_id, cluster_id):
                raise HTTPException(status_code=NOT_FOUND_CODE, detail=CLUSTER_NOT_FOUND)
        return

    unregisterable_registration(db, workspace_id, cluster_id)
    unregister = getattr(db, "unregister_target_cluster", None)
    if callable(unregister):
        if not unregister(workspace_id, cluster_id):
            raise HTTPException(status_code=NOT_FOUND_CODE, detail=CLUSTER_NOT_FOUND)
        return
    status_updater = getattr(db, "update_cluster_registration_status", None)
    if callable(status_updater):
        status_updater(workspace_id, cluster_id, ClusterRegistrationStatus.INSTALL_EXPIRED.value)
        return
    raise HTTPException(
        status_code=500,
        detail={
            "code": "cluster_unregister_unsupported",
            "detail": "등록 해제를 처리할 수 없습니다",
        },
    )


@agent_router.get(
    gateway_routes.AGENT_POLICY_PATH,
    response_model=AgentPolicyResponse,
)
async def agent_policy(
    cluster_id: str,
    generation: int = 0,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> AgentPolicyResponse:
    if cluster_id != identity.cluster_id:
        raise HTTPException(status_code=403, detail="cluster_id does not match agent identity")
    policy = db.get_cluster_policy(identity.workspace_id, identity.cluster_id)
    if policy is None or int(policy.get("generation", 0)) <= generation:
        return AgentPolicyResponse(policy=None)
    return AgentPolicyResponse(policy=AgentPolicy.model_validate(policy))


@agent_router.post(gateway_routes.AGENT_POLICY_STATUS_PATH)
async def agent_policy_status(
    payload: AgentPolicyStatusRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> dict[str, bool]:
    status = payload.model_copy(update={"cluster_id": identity.cluster_id}).model_dump()
    db.save_agent_policy_status(identity.workspace_id, status)
    return {"accepted": True}


@agent_router.post(gateway_routes.AGENT_RECONCILE_STATUS_PATH)
async def agent_reconcile_status(
    payload: AgentReconcileStatusRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> dict[str, bool]:
    status = payload.model_copy(update={"cluster_id": identity.cluster_id}).model_dump()
    db.save_agent_reconcile_status(identity.workspace_id, status)
    return {"accepted": True}


@agent_router.post(
    gateway_routes.AGENT_EVIDENCE_JOB_SCHEDULE_PATH,
    response_model=EvidenceJobScheduleResponse,
)
async def schedule_evidence_jobs(
    payload: EvidenceJobScheduleRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> EvidenceJobScheduleResponse:
    stored_policy = await db_call(
        db.get_cluster_policy,
        identity.workspace_id,
        identity.cluster_id,
    )
    policy = (
        AgentPolicy.model_validate(stored_policy)
        if stored_policy
        else default_agent_policy(cluster_id=identity.cluster_id)
    )
    provider_keys = enabled_provider_keys(policy, payload.provider_keys)
    queued = await db_call(
        db.queue_evidence_jobs,
        workspace_id=identity.workspace_id,
        cluster_id=identity.cluster_id,
        source_id=payload.source_id,
        window_start=payload.window_start,
        provider_keys=provider_keys,
        failure_policy=policy.evidence.failure_policy,
        max_attempts=policy.evidence.max_attempts,
        policy_generation=policy.generation,
        provider_policies=provider_policy_snapshots(policy, provider_keys),
    )
    return EvidenceJobScheduleResponse(**queued)


async def lease_next_evidence_job(
    db: Any,
    cluster_id: str,
    workspace_id: str,
    provider_key: str,
    agent_id: str,
    timeout: int,
) -> dict[str, Any] | None:
    deadline = time.time() + min(timeout, MAX_EVIDENCE_JOB_POLL_SECONDS)
    while time.time() < deadline:
        row = await db.lease_evidence_job(
            workspace_id=workspace_id,
            cluster_id=cluster_id,
            provider_key=provider_key,
            agent_id=agent_id,
            lease_seconds=DEFAULT_EVIDENCE_JOB_LEASE_SECONDS,
        )
        if row:
            return row
        await asyncio.sleep(EVIDENCE_JOB_POLL_SLEEP_SECONDS)
    return None


@agent_router.get(
    gateway_routes.AGENT_EVIDENCE_JOB_POLL_PATH,
    response_model=EvidenceJobPollResponse,
)
async def poll_evidence_job(
    provider_key: str,
    agent_id: str = "target-agent",
    timeout: int = DEFAULT_EVIDENCE_JOB_POLL_SECONDS,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> EvidenceJobPollResponse:
    await db_call(touch_agent_seen, db, identity, agent_id)
    job = await lease_next_evidence_job(
        db,
        identity.cluster_id,
        identity.workspace_id,
        provider_key,
        agent_id,
        timeout,
    )
    return EvidenceJobPollResponse(job=job)


async def emit_evidence_if_ready(
    evidence_key: str,
    events: Any,
    db: Any,
) -> EvidenceJobResultResponse | None:
    existing = await db_call(db.get_evidence_window, evidence_key)
    if existing:
        if str(existing["event_id"]).startswith(PENDING_EVIDENCE_EVENT_ID_PREFIX):
            if not await release_stale_pending_evidence_window(db, evidence_key):
                return None
        else:
            return EvidenceJobResultResponse(
                accepted=True,
                evidence_key=evidence_key,
                event_id=existing["event_id"],
                correlation_id=existing["correlation_id"],
            )

    payload = await db_call(db.evidence_payload_if_ready, evidence_key)
    if payload is None:
        return None

    evidence_body = ClusterEvidenceReceivedBody(**complete_evidence_payload(payload))
    correlation_id = payload.get("correlation_id")
    event_envelope = event(
        evidence_body.__subject__,
        getattr(events, "source", "api-gateway"),
        compact_cluster_evidence_payload(
            evidence_body,
            correlation_id if isinstance(correlation_id, str) else None,
        ),
        correlation_id if isinstance(correlation_id, str) else None,
    )
    recorded = await db_call(
        db.record_evidence_event_once,
        evidence_key=evidence_key,
        workspace_id=evidence_body.workspace_id,
        cluster_id=evidence_body.cluster_id,
        source_id=evidence_body.source_id or DEFAULT_EVIDENCE_SOURCE_ID,
        window_start=evidence_body.window_start or evidence_key,
        agent_id=evidence_body.agent_id,
        event_envelope=event_envelope,
        payload=evidence_body.to_body(),
    )
    if str(recorded["event_id"]).startswith(PENDING_EVIDENCE_EVENT_ID_PREFIX):
        return None
    return EvidenceJobResultResponse(
        accepted=True,
        evidence_key=evidence_key,
        event_id=recorded["event_id"],
        correlation_id=recorded["correlation_id"],
    )


def complete_evidence_payload(payload: dict[str, Any]) -> dict[str, Any]:
    allowed_fields = {item.name for item in fields(ClusterEvidenceReceivedBody)}
    return {
        **{key: value for key, value in payload.items() if key in allowed_fields},
        "kubernetes": payload.get("kubernetes")
        if isinstance(payload.get("kubernetes"), dict)
        else {},
        "metrics": payload.get("metrics") if isinstance(payload.get("metrics"), dict) else {},
        "logs": payload.get("logs") if isinstance(payload.get("logs"), list) else [],
        "traces": payload.get("traces") if isinstance(payload.get("traces"), dict) else {},
    }


@agent_router.post(
    gateway_routes.AGENT_EVIDENCE_JOB_RESULT_PATH,
    response_model=EvidenceJobResultResponse,
)
async def evidence_job_result(
    job_id: str,
    payload: EvidenceJobResultRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> EvidenceJobResultResponse:
    result = await db_call(
        db.complete_evidence_job,
        workspace_id=identity.workspace_id,
        cluster_id=identity.cluster_id,
        job_id=job_id,
        lease_id=payload.lease_id,
        agent_id=payload.agent_id,
        status=payload.status,
        result=payload.result,
        error=payload.error,
    )
    if result is None:
        raise HTTPException(status_code=NOT_FOUND_CODE, detail=EVIDENCE_JOB_NOT_FOUND)

    await db_call(touch_agent_seen, db, identity, payload.agent_id)
    source_id = str(result.get("source_id") or "")
    if source_id == RELEASE_WORKFLOW_FAILURE_SOURCE_ID:
        await events.accept_body(
            EvidenceJobUpdatedBody(
                provider_key=str(result.get("provider_key") or ""),
                status=str(result.get("status") or payload.status),
                evidence_key=str(result["evidence_key"]),
                workspace_id=identity.workspace_id,
                cluster_id=identity.cluster_id,
                source_id=source_id,
                window_start=str(result.get("window_start") or "") or None,
                evidence_emitted=False,
                collection_status={
                    "job_id": job_id,
                    "reported_status": payload.status,
                    "stored_status": str(result.get("status") or payload.status),
                },
            )
        )
    kubernetes = payload.result.get("kubernetes")
    if payload.status == "completed" and isinstance(kubernetes, dict):
        await db_call(
            db.save_inventory_snapshot,
            workspace_id=identity.workspace_id,
            cluster_id=identity.cluster_id,
            agent_id=payload.agent_id,
            payload=kubernetes_evidence_to_inventory_snapshot(
                kubernetes,
                cluster_id=identity.cluster_id,
                agent_id=payload.agent_id,
            ),
        )

    evidence_key = str(result["evidence_key"])
    emitted = await emit_evidence_if_ready(evidence_key, events, db)
    if emitted:
        return emitted
    return EvidenceJobResultResponse(accepted=True, evidence_key=evidence_key)


async def db_call(func: Any, *args: Any, **kwargs: Any) -> Any:
    return await to_thread_db_retry(func, *args, **kwargs)


async def release_stale_pending_evidence_window(db: Any, evidence_key: str) -> bool:
    return bool(
        await db_call(
            db.release_stale_pending_evidence_window,
            evidence_key,
            DEFAULT_PENDING_EVIDENCE_EVENT_TTL_SECONDS,
        )
    )


router.include_router(agent_router)
