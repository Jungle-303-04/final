"""Target cluster install manifest renderer.

The API router owns request/auth/application flow. This module owns the install
artifact shape so CLI, web UI, Helm, and Kustomize renderers can share one
boundary instead of copying YAML strings inside route handlers.
"""

from __future__ import annotations

import json

from packages.config.settings import env
from packages.contracts.gateway.requests import TargetRegisterRequest

TARGET_INSTALL_RENDERER_ENV = "TARGET_INSTALL_RENDERER"
TARGET_INSTALL_RENDERER_NATIVE = "native"
TARGET_INSTALL_RENDERER_KUSTOMIZE = "kustomize"
SUPPORTED_TARGET_INSTALL_RENDERERS = {
    TARGET_INSTALL_RENDERER_NATIVE,
    TARGET_INSTALL_RENDERER_KUSTOMIZE,
}


def target_install_renderer() -> str:
    renderer = env(TARGET_INSTALL_RENDERER_ENV, TARGET_INSTALL_RENDERER_NATIVE).strip().lower()
    if renderer not in SUPPORTED_TARGET_INSTALL_RENDERERS:
        supported = ", ".join(sorted(SUPPORTED_TARGET_INSTALL_RENDERERS))
        raise ValueError(f"{TARGET_INSTALL_RENDERER_ENV} must be one of: {supported}")
    return renderer


def yaml_string(value: str) -> str:
    return json.dumps(value)


def target_install_manifest(payload: TargetRegisterRequest, agent_token: str) -> str:
    # native와 kustomize는 지금 같은 manifest contract를 반환한다. 차이는 호출 경계다:
    # native는 API가 즉시 apply 가능한 YAML을 만들고, kustomize는 같은 산출물을 향후
    # renderer adapter/웹앱 preview/install 단계에서 교체할 수 있게 선택값으로 노출한다.
    target_install_renderer()
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
            sample_workload_manifest(payload),
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


def sample_workload_manifest(payload: TargetRegisterRequest) -> str:
    if not payload.install_sample_workload:
        return ""
    if not payload.sample_workload_name or not payload.sample_workload_image:
        raise ValueError("sample workload install requires name and image")
    return workload_manifest(payload.sample_workload_name, payload.sample_workload_image)


def workload_manifest(name: str, image: str) -> str:
    return f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {yaml_string(name)}
  namespace: sandbox
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {yaml_string(name)}
  template:
    metadata:
      labels:
        app: {yaml_string(name)}
    spec:
      containers:
        - name: {yaml_string(name)}
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
            - name: target-agent-runtime
              mountPath: /var/lib/target-agent
      volumes:
        - name: target-agent-runtime
          emptyDir: {{}}
"""
