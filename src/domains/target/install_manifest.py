"""target cluster 설치 manifest 렌더러.

라우터는 요청/인증/apply 흐름을, 이 모듈은 install artifact 형태를 담당 —
CLI/웹 UI/Helm/Kustomize 렌더러가 라우트 핸들러의 YAML 복사 없이 한 경계를 공유.
"""

from __future__ import annotations

import json

from domains.target.management_guard import MANAGEMENT_BOOTSTRAP_MODE, MANAGEMENT_CLUSTER_ROLE
from packages.config.environments import normalize_environment
from packages.config.realtime import derive_realtime_gateway_url
from packages.config.security import (
    RCA_TEST_RUNS_ENABLED_ENV,
    RCA_TEST_TARGET_ENVIRONMENTS,
    rca_test_runs_enabled,
)
from packages.contracts.gateway.requests import DEFAULT_OTEL_SERVICE_NAME, TargetRegisterRequest
from packages.contracts.target import SANDBOX_NAMESPACE, TARGET_NAMESPACE

CONTROL_PRIORITY_CLASS_NAME = "gitops-control-critical"
FAST_LANE_PRIORITY_CLASS_NAME = "gitops-demo-fast"
FAST_LANE_NODE_LABEL_KEY = "workload-tier"
FAST_LANE_NODE_LABEL_VALUE = "demo-fast"


def yaml_string(value: str) -> str:
    return json.dumps(value)


def target_install_manifest(payload: TargetRegisterRequest, agent_token: str) -> str:
    namespace = agent_namespace(payload)
    role = payload.cluster_role
    return "\n---\n".join(
        block.strip()
        for block in [
            namespace_manifest(namespace),
            namespace_manifest(SANDBOX_NAMESPACE) if role != MANAGEMENT_CLUSTER_ROLE else "",
            priority_class_manifest(),
            service_account_manifest(namespace),
            cluster_read_rbac_manifest(namespace),
            node_control_rbac_manifest(namespace) if role != MANAGEMENT_CLUSTER_ROLE else "",
            cluster_uninstall_rbac_manifest(namespace) if role != MANAGEMENT_CLUSTER_ROLE else "",
            target_write_rbac_manifest(namespace) if role != MANAGEMENT_CLUSTER_ROLE else "",
            sandbox_rbac_manifest(namespace) if role != MANAGEMENT_CLUSTER_ROLE else "",
            catalog_install_rbac_manifest(namespace) if role != MANAGEMENT_CLUSTER_ROLE else "",
            runtime_config_manifest(payload),
            runtime_secret_manifest(agent_token, namespace),
            sample_workload_manifest(payload) if role != MANAGEMENT_CLUSTER_ROLE else "",
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


def priority_class_manifest() -> str:
    return f"""
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: {CONTROL_PRIORITY_CLASS_NAME}
value: 1000000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "GitOps 제어 경로와 target agent를 일반 workload보다 먼저 스케줄링한다."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: {FAST_LANE_PRIORITY_CLASS_NAME}
value: 100000
globalDefault: false
preemptionPolicy: PreemptLowerPriority
description: "사용자가 선택한 fast-lane workload용 우선순위."
"""


def agent_namespace(payload: TargetRegisterRequest) -> str:
    return "management" if payload.cluster_role == MANAGEMENT_CLUSTER_ROLE else TARGET_NAMESPACE


def service_account_manifest(namespace: str) -> str:
    return f"""
apiVersion: v1
kind: ServiceAccount
metadata:
  name: cluster-agent
  namespace: {namespace}
"""


def cluster_read_rbac_manifest(namespace: str) -> str:
    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-agent-read
rules:
  - apiGroups: [""]
    resources: ["pods", "events", "nodes", "services", "endpoints"]
    verbs: ["get", "list", "watch"]
  # Kubernetes RBAC cannot resourceName-scope create on pods/exec. Runtime
  # authorization therefore requires exact inventory target, pod.exec, and
  # POD_EXEC_ALLOWED_NAMESPACES at both gateway and agent boundaries.
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
  - apiGroups: ["discovery.k8s.io"]
    resources: ["endpointslices"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "daemonsets", "statefulsets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["batch"]
    resources: ["jobs", "cronjobs"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["argoproj.io"]
    resources: ["applications", "rollouts"]
    verbs: ["get", "list"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["pods", "nodes"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["nodes/proxy"]
    verbs: ["get"]
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
    namespace: {namespace}
"""


def cluster_uninstall_rbac_manifest(namespace: str) -> str:
    """Exact-name permissions used only after an administrator disconnect request.

    Namespace deletion and broad collection deletion are intentionally absent.
    The service account cannot touch arbitrary workloads even during uninstall.
    """

    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-agent-uninstall
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["target-runtime-config", "target-agent-policy"]
    verbs: ["delete"]
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["target-runtime-secret"]
    verbs: ["delete"]
  - apiGroups: [""]
    resources: ["serviceaccounts"]
    resourceNames: ["cluster-agent"]
    verbs: ["delete"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    resourceNames: ["cluster-agent"]
    verbs: ["delete"]
  - apiGroups: ["apps"]
    resources: ["daemonsets"]
    resourceNames: ["optional-node-collector"]
    verbs: ["delete"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["roles"]
    resourceNames:
      ["cluster-agent-self-manage", "cluster-agent-target-manage", "cluster-agent-sandbox-write", "cluster-agent-catalog-install"]
    verbs: ["delete"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["rolebindings"]
    resourceNames:
      ["cluster-agent-self-manage", "cluster-agent-target-manage", "cluster-agent-sandbox-write", "cluster-agent-catalog-install"]
    verbs: ["delete"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["clusterroles"]
    resourceNames: ["cluster-agent-read", "cluster-agent-node-control"]
    verbs: ["delete"]
  - apiGroups: ["rbac.authorization.k8s.io"]
    resources: ["clusterrolebindings"]
    resourceNames: ["cluster-agent-read", "cluster-agent-node-control"]
    verbs: ["delete"]
  - apiGroups: ["scheduling.k8s.io"]
    resources: ["priorityclasses"]
    resourceNames: ["gitops-control-critical", "gitops-demo-fast"]
    verbs: ["delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-agent-uninstall
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-agent-uninstall
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
"""


def node_control_rbac_manifest(namespace: str) -> str:
    """Cluster-scoped scheduling permission isolated from the read role."""

    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: cluster-agent-node-control
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "patch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-agent-node-control
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: cluster-agent-node-control
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
"""


def target_write_rbac_manifest(namespace: str) -> str:
    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-self-manage
  namespace: {namespace}
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
  namespace: {namespace}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-self-manage
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-target-manage
  namespace: {namespace}
rules:
  - apiGroups: ["apps"]
    resources: ["daemonsets"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-target-manage
  namespace: {TARGET_NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-target-manage
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
"""


def sandbox_rbac_manifest(namespace: str) -> str:
    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-sandbox-write
  namespace: {SANDBOX_NAMESPACE}
rules:
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list", "create", "update", "patch"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-sandbox-write
  namespace: {SANDBOX_NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-sandbox-write
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
"""


def catalog_install_rbac_manifest(namespace: str) -> str:
    return f"""
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: cluster-agent-catalog-install
  namespace: {SANDBOX_NAMESPACE}
rules:
  - apiGroups: [""]
    resources: ["configmaps", "secrets", "serviceaccounts", "services"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["apps"]
    resources: ["statefulsets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["networking.k8s.io"]
    resources: ["networkpolicies"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
  - apiGroups: ["policy"]
    resources: ["poddisruptionbudgets"]
    verbs: ["get", "list", "watch", "create", "update", "patch", "delete"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: cluster-agent-catalog-install
  namespace: {SANDBOX_NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: cluster-agent-catalog-install
subjects:
  - kind: ServiceAccount
    name: cluster-agent
    namespace: {namespace}
"""


def control_namespaces_line(payload: TargetRegisterRequest) -> str:
    """제어 허용 네임스페이스 — 지정된 경우에만 ConfigMap 키를 추가(미지정=기존 manifest 동일)."""
    value = payload.control_namespaces.strip()
    if not value:
        return ""
    return f"\n  CONTROL_ALLOWED_NAMESPACES: {yaml_string(value)}"


def pod_exec_namespaces_line(payload: TargetRegisterRequest) -> str:
    value = payload.control_namespaces.strip() or SANDBOX_NAMESPACE
    return f"\n  POD_EXEC_ALLOWED_NAMESPACES: {yaml_string(value)}"


def rca_test_runtime_config_lines(payload: TargetRegisterRequest) -> str:
    registration_environment = normalize_environment(payload.environment)
    if (
        payload.cluster_role == MANAGEMENT_CLUSTER_ROLE
        or registration_environment not in RCA_TEST_TARGET_ENVIRONMENTS
        or not rca_test_runs_enabled()
    ):
        return ""
    return f"\n  {RCA_TEST_RUNS_ENABLED_ENV}: {yaml_string('1')}"


def runtime_config_manifest(payload: TargetRegisterRequest) -> str:
    namespace = agent_namespace(payload)
    node_collector_enabled = (
        payload.install_node_collector if payload.cluster_role != MANAGEMENT_CLUSTER_ROLE else False
    )
    bootstrap_mode = (
        MANAGEMENT_BOOTSTRAP_MODE if payload.cluster_role == MANAGEMENT_CLUSTER_ROLE else "target"
    )
    return f"""
apiVersion: v1
kind: ConfigMap
metadata:
  name: target-runtime-config
  namespace: {namespace}
data:
  TARGET_CLUSTER_ID: {yaml_string(payload.cluster_id)}
  CLUSTER_ROLE: {yaml_string(payload.cluster_role)}
  BOOTSTRAP_MODE: {yaml_string(bootstrap_mode)}
  WORKSPACE_ID: {yaml_string(payload.workspace_id)}{rca_test_runtime_config_lines(payload)}
  EVIDENCE_INTERVAL_SECONDS: {yaml_string(str(payload.evidence_interval_seconds))}
  REALTIME_GATEWAY_URL: {yaml_string(derive_realtime_gateway_url(payload.management_base_url, management_cluster=payload.cluster_role == MANAGEMENT_CLUSTER_ROLE))}
  PROMETHEUS_BASE_URL: {yaml_string(payload.prometheus_base_url)}
  LOKI_BASE_URL: {yaml_string(payload.loki_base_url)}
  TEMPO_BASE_URL: {yaml_string(payload.tempo_base_url)}
  NODE_COLLECTOR_ENABLED: {yaml_string(str(node_collector_enabled).lower())}{control_namespaces_line(payload)}{pod_exec_namespaces_line(payload)}
  NODE_CONTROL_ENABLED: {yaml_string(str(payload.cluster_role != MANAGEMENT_CLUSTER_ROLE).lower())}
  NODE_COLLECTOR_IMAGE: {yaml_string(payload.image)}
  NODE_COLLECTOR_NAMESPACE: {yaml_string(namespace)}
  AGENT_CONTROL_DB_PATH: "/var/lib/target-agent/agent-control.db"
  COMMAND_OUTBOX_DB_PATH: "/var/lib/target-agent/command-outbox.db"
  OTEL_SERVICE_NAME: {yaml_string(DEFAULT_OTEL_SERVICE_NAME)}
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: {yaml_string(payload.otel_traces_endpoint)}
"""


def runtime_secret_manifest(agent_token: str, namespace: str) -> str:
    return f"""
apiVersion: v1
kind: Secret
metadata:
  name: target-runtime-secret
  namespace: {namespace}
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
  namespace: {SANDBOX_NAMESPACE}
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
      priorityClassName: {FAST_LANE_PRIORITY_CLASS_NAME}
      terminationGracePeriodSeconds: 1
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 80
              preference:
                matchExpressions:
                  - key: {FAST_LANE_NODE_LABEL_KEY}
                    operator: In
                    values:
                      - {FAST_LANE_NODE_LABEL_VALUE}
      containers:
        - name: {yaml_string(name)}
          image: {yaml_string(image)}
          imagePullPolicy: IfNotPresent
          command: ["python", "-m", "http.server", "8080"]
          ports:
            - containerPort: 8080
"""


def cluster_agent_manifest(payload: TargetRegisterRequest) -> str:
    namespace = agent_namespace(payload)
    return f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cluster-agent
  namespace: {namespace}
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
      priorityClassName: {CONTROL_PRIORITY_CLASS_NAME}
      serviceAccountName: cluster-agent
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 50
              preference:
                matchExpressions:
                  - key: {FAST_LANE_NODE_LABEL_KEY}
                    operator: In
                    values:
                      - {FAST_LANE_NODE_LABEL_VALUE}
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
            - name: REALTIME_GATEWAY_URL
              value: {yaml_string(derive_realtime_gateway_url(payload.management_base_url, management_cluster=payload.cluster_role == MANAGEMENT_CLUSTER_ROLE))}
          volumeMounts:
            - name: target-agent-runtime
              mountPath: /var/lib/target-agent
      volumes:
        - name: target-agent-runtime
          emptyDir: {{}}
"""
