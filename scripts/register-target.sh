#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"

BASE_URL="${BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-}"
TARGET_CONTEXT="${TARGET_CONTEXT:-}"
TARGET_CLUSTER_ID="${TARGET_CLUSTER_ID:-}"
TARGET_NAME="${TARGET_NAME:-${TARGET_CLUSTER_ID}}"
TARGET_ENVIRONMENT="${TARGET_ENVIRONMENT:-sandbox}"
WORKSPACE_ID="${WORKSPACE_ID:-default}"
MANAGEMENT_BASE_URL="${MANAGEMENT_BASE_URL:-}"
LOKI_BASE_URL="${LOKI_BASE_URL:-http://loki-gateway.target.svc}"
EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS:-8}"
IMAGE_NAME="${IMAGE_NAME:-}"
INSTALL_TELEMETRY="${INSTALL_TELEMETRY:-true}"
INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR:-true}"
INSTALL_SAMPLE_WORKLOAD="${INSTALL_SAMPLE_WORKLOAD:-false}"
SAMPLE_WORKLOAD_NAME="${SAMPLE_WORKLOAD_NAME:-}"
SAMPLE_WORKLOAD_IMAGE="${SAMPLE_WORKLOAD_IMAGE:-}"
AUTH_EMAIL="${AUTH_EMAIL:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "${COOKIE_JAR}"' EXIT

source "${SCRIPT_DIR}/lib/auth.sh"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need curl
need kubectl
need python3
require_env BASE_URL
require_env TARGET_CONTEXT
require_env TARGET_CLUSTER_ID
require_env TARGET_NAME

is_true() {
  local normalized
  normalized="$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")"
  case "${normalized}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

is_false() {
  local normalized
  normalized="$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")"
  case "${normalized}" in
    0|false|no|off) return 0 ;;
    *) return 1 ;;
  esac
}

require_boolean() {
  local name="$1"
  local value="$2"
  if ! is_true "${value}" && ! is_false "${value}"; then
    echo "${name} must be a boolean value" >&2
    exit 1
  fi
}

wait_for_node_collector() {
  for _ in $(seq 1 60); do
    if kubectl --context "${TARGET_CONTEXT}" -n target get daemonset/optional-node-collector >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "daemonset/optional-node-collector was not created by cluster-agent" >&2
  return 1
}

if [ -z "${MANAGEMENT_BASE_URL}" ]; then
  echo "MANAGEMENT_BASE_URL is required" >&2
  exit 1
fi
if [ -z "${IMAGE_NAME}" ]; then
  echo "IMAGE_NAME is required for cluster-agent and node-collector manifests" >&2
  exit 1
fi
require_boolean INSTALL_TELEMETRY "${INSTALL_TELEMETRY}"
if is_true "${INSTALL_SAMPLE_WORKLOAD}" && { [ -z "${SAMPLE_WORKLOAD_NAME}" ] || [ -z "${SAMPLE_WORKLOAD_IMAGE}" ]; }; then
  echo "SAMPLE_WORKLOAD_NAME and SAMPLE_WORKLOAD_IMAGE are required when INSTALL_SAMPLE_WORKLOAD is true" >&2
  exit 1
fi

normalize_url() {
  local value="${1%/}"
  printf '%s\n' "${value}"
}

api_health_ok() {
  local candidate="$1"
  curl -fsS "${candidate}/healthz" 2>/dev/null | grep -q '"service":"api-gateway"'
}

resolve_api_base_url() {
  local base
  base="$(normalize_url "${BASE_URL}")"
  if [ -n "${API_BASE_URL}" ]; then
    normalize_url "${API_BASE_URL}"
    return
  fi
  if api_health_ok "${base}/api"; then
    printf '%s/api\n' "${base}"
    return
  fi
  if api_health_ok "${base}"; then
    printf '%s\n' "${base}"
    return
  fi
  printf '%s/api\n' "${base}"
}

API_BASE_URL="$(resolve_api_base_url)"

if is_true "${INSTALL_TELEMETRY}"; then
  echo "==> installing required target telemetry before cluster-agent registration"
  TARGET_CONTEXT="${TARGET_CONTEXT}" \
  bash "${SCRIPT_DIR}/install-telemetry.sh"
else
  echo "==> skipping target telemetry installation (INSTALL_TELEMETRY=${INSTALL_TELEMETRY})"
fi

echo "==> logging in operator for target registration"
login_with_password "${API_BASE_URL}" "${COOKIE_JAR}"

registration_body="$(
  TARGET_CLUSTER_ID="${TARGET_CLUSTER_ID}" \
  TARGET_NAME="${TARGET_NAME}" \
  TARGET_ENVIRONMENT="${TARGET_ENVIRONMENT}" \
  WORKSPACE_ID="${WORKSPACE_ID}" \
  MANAGEMENT_BASE_URL="${MANAGEMENT_BASE_URL}" \
  LOKI_BASE_URL="${LOKI_BASE_URL}" \
  EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS}" \
  IMAGE_NAME="${IMAGE_NAME}" \
  INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR}" \
  INSTALL_SAMPLE_WORKLOAD="${INSTALL_SAMPLE_WORKLOAD}" \
  SAMPLE_WORKLOAD_NAME="${SAMPLE_WORKLOAD_NAME}" \
  SAMPLE_WORKLOAD_IMAGE="${SAMPLE_WORKLOAD_IMAGE}" \
  python3 - <<'PY'
import json
import os

truthy = {
    "1",
    "true",
    "yes",
    "on",
}
install_node_collector = os.environ["INSTALL_NODE_COLLECTOR"].lower() in truthy
install_sample_workload = os.environ["INSTALL_SAMPLE_WORKLOAD"].lower() in truthy
body = {
    "cluster_id": os.environ["TARGET_CLUSTER_ID"],
    "name": os.environ["TARGET_NAME"],
    "environment": os.environ["TARGET_ENVIRONMENT"],
    "workspace_id": os.environ["WORKSPACE_ID"],
    "management_base_url": os.environ["MANAGEMENT_BASE_URL"],
    "loki_base_url": os.environ["LOKI_BASE_URL"],
    "evidence_interval_seconds": int(os.environ["EVIDENCE_INTERVAL_SECONDS"]),
    "image": os.environ["IMAGE_NAME"],
    "install_node_collector": install_node_collector,
    "install_sample_workload": install_sample_workload,
    "apply": False,
}
if install_sample_workload:
    body["sample_workload_name"] = os.environ["SAMPLE_WORKLOAD_NAME"]
    body["sample_workload_image"] = os.environ["SAMPLE_WORKLOAD_IMAGE"]

print(json.dumps(body))
PY
)"

echo "==> registering target in operations tool"
registration_response="$(curl -fsS -X POST "${API_BASE_URL}/targets" \
  -b "${COOKIE_JAR}" \
  -H "content-type: application/json" \
  -H "x-service-csrf: same-origin" \
  -d "${registration_body}")"

echo "==> removing legacy target agent deployment if present"
kubectl --context "${TARGET_CONTEXT}" -n target delete deploy/target-cluster-agent --ignore-not-found

echo "==> applying generated target install manifest"
printf "%s" "${registration_response}" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["install_manifest"])' \
  | kubectl --context "${TARGET_CONTEXT}" apply -f -

if is_true "${INSTALL_SAMPLE_WORKLOAD}"; then
  kubectl --context "${TARGET_CONTEXT}" -n sandbox rollout status "deploy/${SAMPLE_WORKLOAD_NAME}" --timeout=120s
fi
kubectl --context "${TARGET_CONTEXT}" -n target rollout restart deploy/cluster-agent
kubectl --context "${TARGET_CONTEXT}" -n target rollout status deploy/cluster-agent --timeout=180s
if is_true "${INSTALL_NODE_COLLECTOR}"; then
  wait_for_node_collector
  kubectl --context "${TARGET_CONTEXT}" -n target rollout status daemonset/optional-node-collector --timeout=180s
fi

echo "Target registered and installed."
