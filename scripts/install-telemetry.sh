#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_CLUSTER="${TARGET_CLUSTER:-cluster-1}"
TARGET_CONTEXT="${TARGET_CONTEXT:-${TARGET_CLUSTER}}"
TARGET_NAMESPACE="${TARGET_NAMESPACE:-target}"

PROMETHEUS_RELEASE="${PROMETHEUS_RELEASE:-prometheus}"
LOKI_RELEASE="${LOKI_RELEASE:-loki}"
TEMPO_RELEASE="${TEMPO_RELEASE:-tempo}"
OTEL_RELEASE="${OTEL_RELEASE:-opentelemetry-collector}"

PROMETHEUS_VALUES="${PROMETHEUS_VALUES:-${ROOT_DIR}/deploy/target/prometheus.yaml}"
LOKI_VALUES="${LOKI_VALUES:-${ROOT_DIR}/deploy/target/loki.yaml}"
TEMPO_VALUES="${TEMPO_VALUES:-${ROOT_DIR}/deploy/target/tempo.yaml}"
OTEL_VALUES="${OTEL_VALUES:-${ROOT_DIR}/deploy/target/opentelemetry.yaml}"

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

need helm
need kubectl

echo "==> ensuring target namespace exists: ${TARGET_NAMESPACE}"
kubectl --context "${TARGET_CONTEXT}" create namespace "${TARGET_NAMESPACE}" \
  --dry-run=client -o yaml \
  | kubectl --context "${TARGET_CONTEXT}" apply -f -

echo "==> adding Helm repositories"
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
helm repo add grafana https://grafana.github.io/helm-charts --force-update
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts --force-update
helm repo update

echo "==> installing Prometheus"
helm upgrade --install "${PROMETHEUS_RELEASE}" prometheus-community/prometheus \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${PROMETHEUS_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing Loki"
helm upgrade --install "${LOKI_RELEASE}" grafana/loki \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${LOKI_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing Tempo"
helm upgrade --install "${TEMPO_RELEASE}" grafana/tempo \
  --kube-context "${TARGET_CONTEXT}" \
  --namespace "${TARGET_NAMESPACE}" \
  --values "${TEMPO_VALUES}" \
  --wait \
  --timeout 5m

echo "==> installing OpenTelemetry Collector"
helm upgrade --install "${OTEL_RELEASE}" open-telemetry/opentelemetry-collector \
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

echo
echo "telemetry is installed in context ${TARGET_CONTEXT}, namespace ${TARGET_NAMESPACE}."
