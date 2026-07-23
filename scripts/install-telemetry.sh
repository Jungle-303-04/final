#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/env.sh"

TARGET_CLUSTER="${TARGET_CLUSTER:-}"
TARGET_CONTEXT="${TARGET_CONTEXT:-${TARGET_CLUSTER}}"
TARGET_NAMESPACE="${TARGET_NAMESPACE:-target}"
require_env TARGET_CONTEXT

PROMETHEUS_RELEASE="${PROMETHEUS_RELEASE:-prometheus}"
LOKI_RELEASE="${LOKI_RELEASE:-loki}"
TEMPO_RELEASE="${TEMPO_RELEASE:-tempo}"
OTEL_RELEASE="${OTEL_RELEASE:-opentelemetry-collector}"
PROMETHEUS_CHART_VERSION="${PROMETHEUS_CHART_VERSION:-29.19.0}"
LOKI_CHART_VERSION="${LOKI_CHART_VERSION:-7.1.0}"
TEMPO_CHART_VERSION="${TEMPO_CHART_VERSION:-1.24.4}"
OTEL_CHART_VERSION="${OTEL_CHART_VERSION:-0.165.0}"

PROMETHEUS_VALUES="${PROMETHEUS_VALUES:-${ROOT_DIR}/deploy/target/prometheus.yaml}"
LOKI_VALUES="${LOKI_VALUES:-${ROOT_DIR}/deploy/target/loki.yaml}"
TEMPO_VALUES="${TEMPO_VALUES:-${ROOT_DIR}/deploy/target/tempo.yaml}"
OTEL_VALUES="${OTEL_VALUES:-${ROOT_DIR}/deploy/target/opentelemetry.yaml}"
TARGET_MINIO_MANIFEST="${TARGET_MINIO_MANIFEST:-${ROOT_DIR}/deploy/target/minio.yaml}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

wait_rollouts() {
  local kind="$1"
  local selector="$2"
  local timeout="${3:-180s}"
  local resources

  resources="$(
    kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
      get "${kind}" -l "${selector}" -o name 2>/dev/null || true
  )"

  if [[ -z "${resources}" ]]; then
    return
  fi

  while IFS= read -r resource; do
    kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
      rollout status "${resource}" --timeout="${timeout}"
  done <<< "${resources}"
}

require_service_endpoints() {
  local service_name="$1"
  local attempts="${2:-60}"
  local ready_endpoints

  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
    get "service/${service_name}" >/dev/null
  for _ in $(seq 1 "${attempts}"); do
    ready_endpoints="$(
      kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
        get endpointslices \
        -l "kubernetes.io/service-name=${service_name}" \
        -o jsonpath='{range .items[*].endpoints[*]}{.conditions.ready}{"\n"}{end}' \
        2>/dev/null \
        | grep -vc '^false$' \
        || true
    )"
    if [[ "${ready_endpoints}" =~ ^[1-9][0-9]*$ ]]; then
      return 0
    fi
    sleep 2
  done
  echo "service/${service_name} has no ready endpoints" >&2
  return 1
}

require_release_workload() {
  local release="$1"
  local resources

  resources="$(
    {
      kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
        get deployment,statefulset,daemonset \
        -l "app.kubernetes.io/instance=${release}" \
        -o name 2>/dev/null \
        || true
    }
  )"
  if [[ -z "${resources}" ]]; then
    echo "telemetry release ${release} has no workload" >&2
    return 1
  fi
}

existing_secret_value() {
  local secret_name="$1"
  local key="$2"

  {
    kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
      get secret "${secret_name}" -o "jsonpath={.data.${key}}" 2>/dev/null \
      || true
  } | python3 -c 'import base64, sys; data=sys.stdin.read().strip(); print(base64.b64decode(data).decode() if data else "")'
}

random_hex() {
  python3 -c 'import secrets; print(secrets.token_hex(32))'
}

ensure_target_minio() {
  if [[ -z "${MINIO_ROOT_PASSWORD}" ]]; then
    MINIO_ROOT_PASSWORD="$(existing_secret_value minio-secret MINIO_ROOT_PASSWORD)"
  fi
  if [[ -z "${MINIO_ROOT_PASSWORD}" ]]; then
    MINIO_ROOT_PASSWORD="$(random_hex)"
  fi

  echo "==> ensuring target MinIO credentials secret exists"
  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" create secret generic minio-secret \
    --from-literal=MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
    --from-literal=MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
    --dry-run=client -o yaml \
    | kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" apply -f -

  echo "==> installing target MinIO object store for Loki"
  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
    delete job/minio-create-buckets --ignore-not-found --wait=true
  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" apply -f "${TARGET_MINIO_MANIFEST}"
  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
    rollout status statefulset/minio --timeout=180s
  kubectl --context "${TARGET_CONTEXT}" -n "${TARGET_NAMESPACE}" \
    wait --for=condition=complete job/minio-create-buckets --timeout=180s
}

need helm
need kubectl
need python3

echo "==> ensuring target namespace exists: ${TARGET_NAMESPACE}"
kubectl --context "${TARGET_CONTEXT}" create namespace "${TARGET_NAMESPACE}" \
  --dry-run=client -o yaml \
  | kubectl --context "${TARGET_CONTEXT}" apply -f -

ensure_target_minio

echo "==> adding Helm repositories"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo add grafana https://grafana.github.io/helm-charts --force-update
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts --force-update
helm repo update

echo "==> installing Prometheus"
helm upgrade --install "${PROMETHEUS_RELEASE}" prometheus-community/prometheus \
  --version "${PROMETHEUS_CHART_VERSION}" \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${PROMETHEUS_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing Loki"
helm upgrade --install "${LOKI_RELEASE}" grafana/loki \
  --version "${LOKI_CHART_VERSION}" \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${LOKI_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing Tempo"
helm upgrade --install "${TEMPO_RELEASE}" grafana/tempo \
  --version "${TEMPO_CHART_VERSION}" \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${TEMPO_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing OpenTelemetry Collector"
helm upgrade --install "${OTEL_RELEASE}" open-telemetry/opentelemetry-collector \
  --version "${OTEL_CHART_VERSION}" \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${OTEL_VALUES}" \
  --wait \
  --timeout 5m

echo "==> waiting for telemetry rollouts"
wait_rollouts deployment "app.kubernetes.io/instance=${PROMETHEUS_RELEASE}" 180s
wait_rollouts statefulset "app.kubernetes.io/instance=${PROMETHEUS_RELEASE}" 180s
wait_rollouts daemonset "app.kubernetes.io/instance=${PROMETHEUS_RELEASE}" 180s
wait_rollouts deployment "app.kubernetes.io/instance=${LOKI_RELEASE}" 180s
wait_rollouts statefulset "app.kubernetes.io/instance=${LOKI_RELEASE}" 180s
wait_rollouts daemonset "app.kubernetes.io/instance=${LOKI_RELEASE}" 180s
wait_rollouts deployment "app.kubernetes.io/instance=${TEMPO_RELEASE}" 180s
wait_rollouts statefulset "app.kubernetes.io/instance=${TEMPO_RELEASE}" 180s
wait_rollouts daemonset "app.kubernetes.io/instance=${TEMPO_RELEASE}" 180s
wait_rollouts deployment "app.kubernetes.io/instance=${OTEL_RELEASE}" 180s
wait_rollouts statefulset "app.kubernetes.io/instance=${OTEL_RELEASE}" 180s
wait_rollouts daemonset "app.kubernetes.io/instance=${OTEL_RELEASE}" 180s

echo "==> verifying required telemetry services and workloads"
require_release_workload "${PROMETHEUS_RELEASE}"
require_release_workload "${LOKI_RELEASE}"
require_release_workload "${TEMPO_RELEASE}"
require_release_workload "${OTEL_RELEASE}"
require_service_endpoints prometheus
require_service_endpoints loki-gateway
require_service_endpoints tempo
require_service_endpoints opentelemetry-collector

echo
echo "telemetry is installed in context ${TARGET_CONTEXT}, namespace ${TARGET_NAMESPACE}."
