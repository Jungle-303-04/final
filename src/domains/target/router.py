"""target 도메인 HTTP 라우터 — target 등록 시 Kubernetes 설치 manifest 생성/적용."""

from __future__ import annotations

import json
import shutil
import subprocess
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from domains.identity.dependencies import require_session
from packages.config.settings import env
from packages.contracts.gateway import routes as gateway_routes
from packages.contracts.gateway.requests import TargetRegisterRequest
from packages.contracts.gateway.responses import TargetInstallResponse
from packages.contracts.identity import ClusterRegistrationStatus
from packages.runtime.dependencies import get_db

AGENT_TOKEN_ENV = "AGENT_TOKEN"
AGENT_TOKEN_NOT_CONFIGURED = "agent token is not configured"
KUBECTL_NOT_AVAILABLE = "kubectl is not available to api-gateway"
KUBECTL_APPLY_FAILED = "target install apply failed"

router = APIRouter(dependencies=[Depends(require_session)])


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
            fake_telemetry,
            checkout_api_manifest(payload.image),
            cluster_agent_manifest(payload),
        ]
        if block.strip()
    )


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
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "patch"]
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
  EVIDENCE_INTERVAL_SECONDS: {yaml_string(str(payload.evidence_interval_seconds))}
  PROMETHEUS_BASE_URL: {yaml_string(payload.prometheus_base_url)}
  LOKI_BASE_URL: {yaml_string(payload.loki_base_url)}
  NODE_COLLECTOR_ENABLED: {yaml_string(str(payload.install_node_collector).lower())}
  NODE_COLLECTOR_IMAGE: {yaml_string(payload.image)}
  NODE_COLLECTOR_NAMESPACE: "target"
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
"""


def apply_manifest_with_kubectl(manifest: str, kube_context: str | None) -> str:
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
    payload: TargetRegisterRequest, manifest: str, apply_output: str | None
) -> TargetInstallResponse:
    return TargetInstallResponse(
        registered=True,
        cluster_id=payload.cluster_id,
        status=ClusterRegistrationStatus.REGISTERED.value,
        applied=apply_output is not None,
        apply_output=apply_output,
        install_manifest=manifest,
    )


@router.post(gateway_routes.TARGETS_PATH, response_model=TargetInstallResponse)
async def register_target(
    payload: TargetRegisterRequest,
    current: Any = Depends(require_session),
    db: Any = Depends(get_db),
) -> TargetInstallResponse:
    agent_token = env(AGENT_TOKEN_ENV, "")
    if not agent_token:
        raise HTTPException(status_code=503, detail=AGENT_TOKEN_NOT_CONFIGURED)

    if hasattr(db, "register_target_cluster"):
        db.register_target_cluster(
            {
                "workspace_id": payload.workspace_id,
                "user_id": current.user_id,
                "cluster_id": payload.cluster_id,
                "name": payload.name,
                "environment": payload.environment,
                "settings": payload.model_dump(
                    exclude={"apply", "kube_context"},
                ),
            }
        )

    manifest = target_install_manifest(payload, agent_token)
    apply_output = (
        apply_manifest_with_kubectl(manifest, payload.kube_context) if payload.apply else None
    )
    return install_response(payload, manifest, apply_output)
