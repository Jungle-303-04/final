"""target 도메인 HTTP 라우터 — target 등록 시 Kubernetes 설치 manifest 생성/적용."""

from __future__ import annotations

import json
import secrets
import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import (
    ClusterAgentIdentity,
    hash_agent_token,
    require_admin_session,
    require_cluster_agent,
)
from domains.target.reconciler import desired_state_version
from packages.config.settings import env
from packages.contracts.event_bus.bodies import (
    ClusterDesiredStateChangedBody,
    TargetDesiredComponent,
)
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.policy_merge import merge_agent_policy
from packages.contracts.gateway.requests import (
    AgentPolicy,
    AgentPolicyResponse,
    AgentPolicyStatusRequest,
    AgentReconcileStatusRequest,
    EvidenceSourceLeaseRequest,
    TargetRegisterRequest,
)
from packages.contracts.gateway.responses import EvidenceSourceLeaseResponse, TargetInstallResponse
from packages.contracts.identity import DEFAULT_WORKSPACE_ID, ClusterRegistrationStatus
from packages.contracts.target import TARGET_NAMESPACE, TargetComponent
from packages.runtime.dependencies import get_db, get_events

AGENT_TOKEN_BYTES = 32  # per-cluster agent 토큰 엔트로피(secrets.token_urlsafe)
KUBECTL_NOT_AVAILABLE = "kubectl is not available to api-gateway"
KUBECTL_APPLY_FAILED = "target install apply failed"
# 콤마구분 허용 컨텍스트 목록. 설정 시 목록 밖 --context 거부(임의 클러스터 적용 차단).
# 미설정 시 컨텍스트 미지정(현재 kubeconfig)만 허용 — 페이로드로 임의 컨텍스트 지정 불가.
KUBE_CONTEXT_ALLOWLIST_ENV = "KUBE_CONTEXT_ALLOWLIST"
KUBE_CONTEXT_NOT_ALLOWED = "kube context is not in the allowlist"

router = APIRouter()
# per-cluster 토큰 인증 — lease 의 workspace/cluster 는 토큰 identity 에서만 취한다.
agent_router = APIRouter()


def yaml_string(value: str) -> str:
    return json.dumps(value)


def target_install_manifest(payload: TargetRegisterRequest, agent_token: str) -> str:
    fake_telemetry = (
        fake_telemetry_manifest(payload.image) if payload.install_fake_telemetry else ""
    )
    return "\n---\n".join(
        block.strip()
        for block in [
            namespace_manifest("target"),
            namespace_manifest("sandbox"),
            service_account_manifest(),
            target_rbac_manifest(),
            sandbox_rbac_manifest(),
            runtime_config_manifest(payload),
            runtime_secret_manifest(agent_token),
            target_agent_state_pvc_manifest(),
            fake_telemetry,
            checkout_api_manifest(payload.image),
            cluster_agent_manifest(payload),
        ]
        if block.strip()
    )


def target_desired_components(payload: TargetRegisterRequest) -> list[TargetDesiredComponent]:
    """등록 요청을 target cluster desired-state 컴포넌트로 정규화한다.

    Secret 원문(agent token)은 desired-state에 저장하지 않는다. 운영 구현에서는
    이 spec을 Helm/Kustomize/CRD desired state로 확장한다.
    """

    return [
        TargetDesiredComponent(
            component=TargetComponent.CLUSTER_AGENT.value,
            namespace=TARGET_NAMESPACE,
            version=payload.image,
            spec={
                "deployment": "cluster-agent",
                "management_base_url": payload.management_base_url,
                "evidence_interval_seconds": payload.evidence_interval_seconds,
                "prometheus_base_url": payload.prometheus_base_url,
                "loki_base_url": payload.loki_base_url,
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
        TargetDesiredComponent(
            component=TargetComponent.FAKE_TELEMETRY.value,
            namespace=TARGET_NAMESPACE,
            version=payload.image,
            spec={
                "enabled": payload.install_fake_telemetry,
                "providers": ["prometheus", "loki", "otel"],
            },
        ),
    ]


def namespace_manifest(name: str) -> str:
    return f"""
apiVersion: v1
kind: Namespace
metadata:
  name: {name}
"""


def service_account_manifest() -> str:
    return """
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cluster-agent
  namespace: target
"""


def target_rbac_manifest() -> str:
    return """
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-agent-read
rules:
  - apiGroups: [""]
    resources: ["pods", "events", "nodes", "services", "endpoints"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "daemonsets"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-self-manage
  namespace: target
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["target-agent-policy"]
    verbs: ["get", "update", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    resourceNames: ["cluster-agent"]
    verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-self-manage
  namespace: target
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-self-manage
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: target
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-agent-read
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-agent-read
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: target
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-target-manage
  namespace: target
rules:
  - apiGroups: ["apps"]
    resources: ["daemonsets"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-target-manage
  namespace: target
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-target-manage
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: target
"""


def sandbox_rbac_manifest() -> str:
    return """
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-sandbox-write
  namespace: sandbox
rules:
  - apiGroups: [""]
    resources: ["services", "configmaps"]
    verbs: ["get", "list", "create", "update", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "create", "update", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-sandbox-write
  namespace: sandbox
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-sandbox-write
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: target
"""


def runtime_config_manifest(payload: TargetRegisterRequest) -> str:
    # Target팀: gateway의 cluster-agent bootstrap, agent의 node collector reconciliation
    # TODO(target): inline YAML string을 Helm/Kustomize render output으로 교체
    return f"""
apiVersion: v1
kind: ConfigMap
metadata:
  name: target-runtime-config
  namespace: target
data:
  TARGET_CLUSTER_ID: {yaml_string(payload.cluster_id)}
  WORKSPACE_ID: {yaml_string(payload.workspace_id)}
  EVIDENCE_INTERVAL_SECONDS: {yaml_string(str(payload.evidence_interval_seconds))}
  PROMETHEUS_BASE_URL: {yaml_string(payload.prometheus_base_url)}
  LOKI_BASE_URL: {yaml_string(payload.loki_base_url)}
  NODE_COLLECTOR_ENABLED: {yaml_string(str(payload.install_node_collector).lower())}
  NODE_COLLECTOR_IMAGE: {yaml_string(payload.image)}
  NODE_COLLECTOR_NAMESPACE: "target"
  EVIDENCE_QUEUE_DB_PATH: "/var/lib/target-agent/evidence-queue.db"
  AGENT_CONTROL_DB_PATH: "/var/lib/target-agent/agent-control.db"
  COMMAND_OUTBOX_DB_PATH: "/var/lib/target-agent/command-outbox.db"
  OTEL_SERVICE_NAME: "target-cluster-agent"
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://opentelemetry-collector.target.svc:4318/v1/traces"
"""


def runtime_secret_manifest(agent_token: str) -> str:
    return f"""
apiVersion: v1
kind: Secret
metadata:
  name: target-runtime-secret
  namespace: target
type: Opaque
stringData:
  AGENT_TOKEN: {yaml_string(agent_token)}
"""


def fake_telemetry_manifest(image: str) -> str:
    return "\n---\n".join(
        fake_telemetry_deployment(kind, image) + "\n---\n" + fake_telemetry_service(kind)
        for kind in ("prometheus", "loki", "otel")
    )


def target_agent_state_pvc_manifest() -> str:
    return """
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: target-agent-state
  namespace: target
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
"""


def fake_telemetry_deployment(kind: str, image: str) -> str:
    app = f"fake-{kind}"
    return f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {app}
  namespace: target
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {app}
  template:
    metadata:
      labels:
        app: {app}
    spec:
      containers:
        - name: {app}
          image: {yaml_string(image)}
          imagePullPolicy: IfNotPresent
          command: ["python", "src/services/target/cluster-agent/fake_telemetry.py"]
          env:
            - name: FAKE_TELEMETRY_KIND
              value: {kind}
          ports:
            - containerPort: 8000
"""


def fake_telemetry_service(kind: str) -> str:
    app = f"fake-{kind}"
    return f"""
apiVersion: v1
kind: Service
metadata:
  name: {app}
  namespace: target
spec:
  selector:
    app: {app}
  ports:
    - port: 8000
      targetPort: 8000
"""


def checkout_api_manifest(image: str) -> str:
    return f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 1
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: {yaml_string(image)}
          imagePullPolicy: IfNotPresent
          command: ["python", "-m", "http.server", "8080"]
          ports:
            - containerPort: 8080
"""


def cluster_agent_manifest(payload: TargetRegisterRequest) -> str:
    return f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-agent
  namespace: target
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cluster-agent
  template:
    metadata:
      labels:
        app: cluster-agent
    spec:
      serviceAccountName: cluster-agent
      containers:
        - name: cluster-agent
          image: {yaml_string(payload.image)}
          imagePullPolicy: IfNotPresent
          command: ["python", "src/services/target/cluster-agent/app.py"]
          envFrom:
            - configMapRef:
                name: target-runtime-config
            - secretRef:
                name: target-runtime-secret
          env:
            - name: MANAGEMENT_BASE_URL
              value: {yaml_string(payload.management_base_url)}
          volumeMounts:
            - name: target-agent-state
              mountPath: /var/lib/target-agent
      volumes:
        - name: target-agent-state
          persistentVolumeClaim:
            claimName: target-agent-state
"""


def allowed_kube_contexts() -> set[str]:
    raw = env(KUBE_CONTEXT_ALLOWLIST_ENV, "")
    return {item.strip() for item in raw.split(",") if item.strip()}


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
    result = subprocess.run(command, input=manifest, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise HTTPException(status_code=502, detail=KUBECTL_APPLY_FAILED)
    return result.stdout


def install_response(
    payload: TargetRegisterRequest, manifest: str, apply_output: str | None, agent_token: str
) -> TargetInstallResponse:
    return TargetInstallResponse(
        registered=True,
        cluster_id=payload.cluster_id,
        status=ClusterRegistrationStatus.REGISTERED.value,
        applied=apply_output is not None,
        apply_output=apply_output,
        install_manifest=manifest,
        agent_token=agent_token,
    )


# require_admin_session 이 세션을 검증 → base router 에 둔다.
# (라우터 단위 require_session + require_admin_session = 이중 검증/레이트리밋 2배 회피)
@router.post(gateway_routes.TARGETS_PATH, response_model=TargetInstallResponse)
async def register_target(
    payload: TargetRegisterRequest,
    current: Any = Depends(require_admin_session),  # kubectl apply 실행 → admin 만
    db: Any = Depends(get_db),
    events: Any = Depends(get_events),
) -> TargetInstallResponse:
    workspace_id = getattr(current, "workspace_id", DEFAULT_WORKSPACE_ID)
    scoped_payload = payload.model_copy(update={"workspace_id": workspace_id})
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

    db.register_target_cluster(
        {
            "workspace_id": workspace_id,
            "user_id": current.user_id,
            "cluster_id": scoped_payload.cluster_id,
            "name": scoped_payload.name,
            "environment": scoped_payload.environment,
            "agent_token_hash": hash_agent_token(agent_token),
            "settings": scoped_payload.model_dump(
                exclude={"apply", "kube_context"},
            ),
        }
    )
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
    return install_response(scoped_payload, manifest, apply_output, agent_token)


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
        AgentPolicy.model_validate(existing) if existing else AgentPolicy(cluster_id=cluster_id)
    )
    merged_policy = merge_agent_policy(base_policy, payload)
    try:
        stored = db.upsert_cluster_policy(workspace_id, cluster_id, merged_policy.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"accepted": True, "policy": stored}


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
    gateway_routes.AGENT_EVIDENCE_SOURCE_LEASE_PATH,
    response_model=EvidenceSourceLeaseResponse,
)
async def lease_evidence_source(
    source_id: str,
    payload: EvidenceSourceLeaseRequest,
    identity: ClusterAgentIdentity = Depends(require_cluster_agent),
    db: Any = Depends(get_db),
) -> EvidenceSourceLeaseResponse:
    lease = db.lease_evidence_source(
        identity.cluster_id,  # body 가 아닌 토큰 identity 기준
        identity.workspace_id,
        source_id,
        payload.agent_id,
        payload.window_start,
        payload.lease_seconds,
    )
    return EvidenceSourceLeaseResponse(**lease)


router.include_router(agent_router)
