#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-service:local}"
MGMT_CLUSTER="${MGMT_CLUSTER:-management}"
TARGET_CLUSTER="${TARGET_CLUSTER:-target}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need docker
need kind
need kubectl
need curl

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

echo "==> building ${IMAGE_NAME}"
docker build -f "${ROOT_DIR}/services/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"

if ! kind get clusters | grep -qx "${MGMT_CLUSTER}"; then
  echo "==> creating management cluster: ${MGMT_CLUSTER}"
  kind create cluster --name "${MGMT_CLUSTER}" --config "${ROOT_DIR}/deploy/kind/management.yaml"
fi

if ! kind get clusters | grep -qx "${TARGET_CLUSTER}"; then
  echo "==> creating target cluster: ${TARGET_CLUSTER}"
  kind create cluster --name "${TARGET_CLUSTER}" --config "${ROOT_DIR}/deploy/kind/target.yaml"
fi

echo "==> loading image into both clusters"
kind load docker-image "${IMAGE_NAME}" --name "${MGMT_CLUSTER}"
kind load docker-image "${IMAGE_NAME}" --name "${TARGET_CLUSTER}"

echo "==> deploying management plane"
kubectl --context "kind-${MGMT_CLUSTER}" apply -f "${ROOT_DIR}/deploy/management/namespace.yaml"
kubectl --context "kind-${MGMT_CLUSTER}" -n management delete \
  deploy/management-api-gateway \
  svc/management-api-gateway \
  deploy/api-gateway \
  svc/api-gateway \
  --ignore-not-found
kubectl --context "kind-${MGMT_CLUSTER}" apply -k "${ROOT_DIR}/deploy/management"
for old_deploy in \
  oauth-auth-service git-event-processor manifest-renderer desired-state-sync \
  command-orchestrator command-dispatcher agent-connection-gateway \
  evidence-builder ai-rca-service safe-pr-service; do
  kubectl --context "kind-${MGMT_CLUSTER}" -n management delete "deploy/${old_deploy}" --ignore-not-found
done
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status statefulset/postgresql --timeout=180s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status statefulset/nats --timeout=180s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/redis --timeout=120s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/minio --timeout=120s
for deploy in \
  api-gateway \
  git-pull-worker manifest-render-worker diff-worker diff-analyze-worker repo-gateway-worker \
  command-worker rca-worker \
  dashboard-projection-service audit-timeline-service; do
  kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout restart "deploy/${deploy}"
done
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/api-gateway --timeout=180s

for deploy in \
  git-pull-worker manifest-render-worker diff-worker diff-analyze-worker repo-gateway-worker \
  command-worker rca-worker \
  dashboard-projection-service audit-timeline-service; do
  kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status "deploy/${deploy}" --timeout=180s
done

MGMT_NODE="${MGMT_CLUSTER}-control-plane"
MGMT_NODE_IP="$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${MGMT_NODE}")"
MANAGEMENT_BASE_URL="http://${MGMT_NODE_IP}:30080"

echo "==> deploying target cluster with management URL: ${MANAGEMENT_BASE_URL}"
sed "s#__MANAGEMENT_BASE_URL__#${MANAGEMENT_BASE_URL}#g" "${ROOT_DIR}/deploy/target/target.yaml" \
  | kubectl --context "kind-${TARGET_CLUSTER}" apply -f -
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout status deploy/fake-prometheus --timeout=120s
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout status deploy/fake-loki --timeout=120s
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout status deploy/fake-otel --timeout=120s
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout status daemonset/optional-node-collector --timeout=120s
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout restart deploy/target-cluster-agent
kubectl --context "kind-${TARGET_CLUSTER}" -n target rollout status deploy/target-cluster-agent --timeout=180s

echo
echo "service is ready."
echo "Gateway:      http://localhost:18080"
echo "Health:       http://localhost:18080/healthz"
echo "Dashboard:    http://localhost:18080/dashboard/query"
echo
echo "Run smoke test:"
echo "  bash ${ROOT_DIR}/scripts/smoke.sh"
