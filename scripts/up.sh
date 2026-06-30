#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${IMAGE_NAME:-service:local}"
MGMT_CLUSTER="${MGMT_CLUSTER:-management}"
TARGET_CLUSTER="${TARGET_CLUSTER:-target}"
POSTGRES_USER="${POSTGRES_USER:-service}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-service}"
DATABASE_URL="${DATABASE_URL:-}"
NATS_URL="${NATS_URL:-nats://nats:4222}"
REDIS_URL="${REDIS_URL:-redis://redis:6379/0}"
GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
GITHUB_REPO="${GITHUB_REPO:-octocat/Hello-World}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"
MANIFEST_PATH="${MANIFEST_PATH:-deploy.yaml}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
GIT_REMOTE_MANIFEST_ENABLED="${GIT_REMOTE_MANIFEST_ENABLED:-1}"
GIT_REMOTE_MANIFEST_REQUIRED="${GIT_REMOTE_MANIFEST_REQUIRED:-0}"
GITHUB_MANIFEST_TIMEOUT_SECONDS="${GITHUB_MANIFEST_TIMEOUT_SECONDS:-5}"
SCM_PR_URL_PREFIX="${SCM_PR_URL_PREFIX:-}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
TARGET_RUNTIME_CLUSTER_ID="${TARGET_RUNTIME_CLUSTER_ID:-target-cluster-01}"
EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS:-8}"
SKIP_BUILD="${SKIP_BUILD:-0}"

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
need openssl
need python3

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

RUNTIME_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${RUNTIME_DIR}"
}
trap cleanup EXIT

pgbouncer_auth_hash() {
  python3 - "$POSTGRES_USER" "$POSTGRES_PASSWORD" <<'PY'
import hashlib
import sys

user, password = sys.argv[1], sys.argv[2]
print("md5" + hashlib.md5((password + user).encode()).hexdigest())
PY
}

existing_secret_value() {
  local secret_name="$1"
  local key="$2"
  { kubectl --context "kind-${MGMT_CLUSTER}" -n management get secret "${secret_name}" \
    -o "jsonpath={.data.${key}}" 2>/dev/null || true; } \
    | python3 -c 'import base64, sys; data=sys.stdin.read().strip(); print(base64.b64decode(data).decode() if data else "")'
}

if [ -z "${POSTGRES_PASSWORD}" ]; then
  POSTGRES_PASSWORD="$(existing_secret_value postgresql-secret POSTGRES_PASSWORD)"
fi
if [ -z "${POSTGRES_PASSWORD}" ]; then
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
fi

if [ -z "${DATABASE_URL}" ]; then
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pgbouncer:6432/${POSTGRES_DB}"
fi

if [ -z "${GITHUB_WEBHOOK_SECRET}" ]; then
  GITHUB_WEBHOOK_SECRET="$(existing_secret_value management-runtime-secret GITHUB_WEBHOOK_SECRET)"
fi
if [ -z "${GITHUB_WEBHOOK_SECRET}" ]; then
  GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
fi

if [ -z "${MINIO_ROOT_PASSWORD}" ]; then
  MINIO_ROOT_PASSWORD="$(existing_secret_value minio-secret MINIO_ROOT_PASSWORD)"
fi
if [ -z "${MINIO_ROOT_PASSWORD}" ]; then
  MINIO_ROOT_PASSWORD="$(openssl rand -hex 32)"
fi

if [ "${SKIP_BUILD}" = "1" ]; then
  echo "==> skipping image build for ${IMAGE_NAME}"
else
  echo "==> building ${IMAGE_NAME}"
  docker build -f "${ROOT_DIR}/src/services/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"
fi

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
kubectl --context "kind-${MGMT_CLUSTER}" -n management create secret generic postgresql-secret \
  --from-literal=POSTGRES_USER="${POSTGRES_USER}" \
  --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  --from-literal=POSTGRES_DB="${POSTGRES_DB}" \
  --dry-run=client -o yaml | kubectl --context "kind-${MGMT_CLUSTER}" apply -f -
kubectl --context "kind-${MGMT_CLUSTER}" -n management create secret generic minio-secret \
  --from-literal=MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
  --from-literal=MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
  --dry-run=client -o yaml | kubectl --context "kind-${MGMT_CLUSTER}" apply -f -
PGBOUNCER_AUTH_HASH="$(pgbouncer_auth_hash)"
cat >"${RUNTIME_DIR}/pgbouncer.ini" <<EOF
[databases]
${POSTGRES_DB} = host=postgresql port=5432 dbname=${POSTGRES_DB} user=${POSTGRES_USER} password=${POSTGRES_PASSWORD}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 60
pidfile = /tmp/pgbouncer.pid
logfile =
unix_socket_dir = /tmp
ignore_startup_parameters = extra_float_digits,options
EOF
printf '"%s" "%s"\n' "${POSTGRES_USER}" "${PGBOUNCER_AUTH_HASH}" >"${RUNTIME_DIR}/userlist.txt"
kubectl --context "kind-${MGMT_CLUSTER}" -n management create secret generic pgbouncer-config \
  --from-file=pgbouncer.ini="${RUNTIME_DIR}/pgbouncer.ini" \
  --from-file=userlist.txt="${RUNTIME_DIR}/userlist.txt" \
  --dry-run=client -o yaml | kubectl --context "kind-${MGMT_CLUSTER}" apply -f -
kubectl --context "kind-${MGMT_CLUSTER}" -n management create configmap management-runtime-config \
  --from-literal=NATS_URL="${NATS_URL}" \
  --from-literal=REDIS_URL="${REDIS_URL}" \
  --from-literal=MANAGEMENT_BASE_URL="http://api-gateway:8000" \
  --from-literal=GITHUB_REPO="${GITHUB_REPO}" \
  --from-literal=GITHUB_BRANCH="${GITHUB_BRANCH}" \
  --from-literal=MANIFEST_PATH="${MANIFEST_PATH}" \
  --from-literal=GITHUB_API_BASE="${GITHUB_API_BASE}" \
  --from-literal=GIT_REMOTE_MANIFEST_ENABLED="${GIT_REMOTE_MANIFEST_ENABLED}" \
  --from-literal=GIT_REMOTE_MANIFEST_REQUIRED="${GIT_REMOTE_MANIFEST_REQUIRED}" \
  --from-literal=GITHUB_MANIFEST_TIMEOUT_SECONDS="${GITHUB_MANIFEST_TIMEOUT_SECONDS}" \
  --from-literal=SCM_PR_URL_PREFIX="${SCM_PR_URL_PREFIX}" \
  --dry-run=client -o yaml | kubectl --context "kind-${MGMT_CLUSTER}" apply -f -
kubectl --context "kind-${MGMT_CLUSTER}" -n management create secret generic management-runtime-secret \
  --from-literal=DATABASE_URL="${DATABASE_URL}" \
  --from-literal=GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}" \
  --from-literal=GITHUB_TOKEN="${GITHUB_TOKEN}" \
  --dry-run=client -o yaml | kubectl --context "kind-${MGMT_CLUSTER}" apply -f -
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
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status statefulset/postgresql --timeout=300s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/pgbouncer --timeout=120s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status statefulset/nats --timeout=180s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/redis --timeout=120s
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/minio --timeout=120s
for deploy in \
  api-gateway \
  git-pull-worker manifest-render-worker diff-worker diff-analyze-worker scm-worker \
  alert-worker command-worker target-reconcile-worker rca-worker \
  dashboard-worker audit-worker; do
  kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout restart "deploy/${deploy}"
done
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status deploy/api-gateway --timeout=180s

for deploy in \
  git-pull-worker manifest-render-worker diff-worker diff-analyze-worker scm-worker \
  alert-worker command-worker target-reconcile-worker rca-worker \
  dashboard-worker audit-worker; do
  kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status "deploy/${deploy}" --timeout=180s
done

MGMT_NODE="${MGMT_CLUSTER}-control-plane"
MGMT_NODE_IP="$(docker inspect -f '{{range.NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "${MGMT_NODE}")"
MANAGEMENT_BASE_URL="http://${MGMT_NODE_IP}:30080"

echo "==> deploying target cluster with management URL: ${MANAGEMENT_BASE_URL}"
BASE_URL="http://localhost:18080" \
MANAGEMENT_BASE_URL="${MANAGEMENT_BASE_URL}" \
TARGET_CONTEXT="kind-${TARGET_CLUSTER}" \
TARGET_CLUSTER_ID="${TARGET_RUNTIME_CLUSTER_ID}" \
EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS}" \
IMAGE_NAME="${IMAGE_NAME}" \
bash "${ROOT_DIR}/scripts/register-target.sh"

echo
echo "service is ready."
echo "Gateway:      http://localhost:18080"
echo "Health:       http://localhost:18080/healthz"
echo "Dashboard:    http://localhost:18080/dashboard/query"
echo
echo "Run smoke test:"
echo "  bash ${ROOT_DIR}/scripts/smoke.sh"
