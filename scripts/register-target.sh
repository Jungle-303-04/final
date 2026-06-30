#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:18080}"
TARGET_CONTEXT="${TARGET_CONTEXT:-kind-target}"
TARGET_CLUSTER_ID="${TARGET_CLUSTER_ID:-target-cluster-01}"
TARGET_NAME="${TARGET_NAME:-target-cluster}"
TARGET_ENVIRONMENT="${TARGET_ENVIRONMENT:-sandbox}"
WORKSPACE_ID="${WORKSPACE_ID:-default}"
MANAGEMENT_BASE_URL="${MANAGEMENT_BASE_URL:-}"
PROMETHEUS_BASE_URL="${PROMETHEUS_BASE_URL:-http://fake-prometheus:8000}"
LOKI_BASE_URL="${LOKI_BASE_URL:-http://fake-loki:8000}"
EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS:-8}"
IMAGE_NAME="${IMAGE_NAME:-service:local}"
INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR:-true}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "${COOKIE_JAR}"' EXIT

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need curl
need kubectl
need python3

is_true() {
  normalized="$(printf "%s" "$1" | tr "[:upper:]" "[:lower:]")"
  case "${normalized}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

if [ -z "${MANAGEMENT_BASE_URL}" ]; then
  echo "MANAGEMENT_BASE_URL is required" >&2
  exit 1
fi

echo "==> creating operator session for target registration"
start_response="$(curl -fsS "${BASE_URL}/auth/oauth/github/start?user_id=local-user&scopes=profile,email,repo")"
state="$(printf "%s" "${start_response}" | python3 -c 'import json, sys; print(json.load(sys.stdin)["state"])')"
curl -fsS -X POST "${BASE_URL}/auth/oauth/github/callback" \
  -H "content-type: application/json" \
  -c "${COOKIE_JAR}" \
  -d "{\"state\":\"${state}\",\"code\":\"local-dev-code\",\"scopes\":[\"profile\",\"email\",\"repo\"]}" >/dev/null

registration_body="$(
  TARGET_CLUSTER_ID="${TARGET_CLUSTER_ID}" \
  TARGET_NAME="${TARGET_NAME}" \
  TARGET_ENVIRONMENT="${TARGET_ENVIRONMENT}" \
  WORKSPACE_ID="${WORKSPACE_ID}" \
  MANAGEMENT_BASE_URL="${MANAGEMENT_BASE_URL}" \
  PROMETHEUS_BASE_URL="${PROMETHEUS_BASE_URL}" \
  LOKI_BASE_URL="${LOKI_BASE_URL}" \
  EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS}" \
  IMAGE_NAME="${IMAGE_NAME}" \
  INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR}" \
  python3 - <<'PY'
import json
import os

install_node_collector = os.environ["INSTALL_NODE_COLLECTOR"].lower() in {
    "1",
    "true",
    "yes",
    "on",
}

print(json.dumps({
    "cluster_id": os.environ["TARGET_CLUSTER_ID"],
    "name": os.environ["TARGET_NAME"],
    "environment": os.environ["TARGET_ENVIRONMENT"],
    "workspace_id": os.environ["WORKSPACE_ID"],
    "management_base_url": os.environ["MANAGEMENT_BASE_URL"],
    "prometheus_base_url": os.environ["PROMETHEUS_BASE_URL"],
    "loki_base_url": os.environ["LOKI_BASE_URL"],
    "evidence_interval_seconds": int(os.environ["EVIDENCE_INTERVAL_SECONDS"]),
    "image": os.environ["IMAGE_NAME"],
    "install_fake_telemetry": True,
    "install_node_collector": install_node_collector,
    "apply": False,
}))
PY
)"

echo "==> registering target in operations tool"
registration_response="$(curl -fsS -X POST "${BASE_URL}/targets" \
  -b "${COOKIE_JAR}" \
  -H "content-type: application/json" \
  -d "${registration_body}")"

echo "==> removing legacy target agent deployment if present"
kubectl --context "${TARGET_CONTEXT}" -n target delete deploy/target-cluster-agent --ignore-not-found

echo "==> applying generated target install manifest"
printf "%s" "${registration_response}" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["install_manifest"])' \
  | kubectl --context "${TARGET_CONTEXT}" apply -f -

kubectl --context "${TARGET_CONTEXT}" -n target rollout status deploy/fake-prometheus --timeout=120s
kubectl --context "${TARGET_CONTEXT}" -n target rollout status deploy/fake-loki --timeout=120s
kubectl --context "${TARGET_CONTEXT}" -n target rollout status deploy/fake-otel --timeout=120s
kubectl --context "${TARGET_CONTEXT}" -n sandbox rollout status deploy/checkout-api --timeout=120s
kubectl --context "${TARGET_CONTEXT}" -n target rollout restart deploy/cluster-agent
kubectl --context "${TARGET_CONTEXT}" -n target rollout status deploy/cluster-agent --timeout=180s
if is_true "${INSTALL_NODE_COLLECTOR}"; then
  kubectl --context "${TARGET_CONTEXT}" -n target rollout status daemonset/optional-node-collector --timeout=180s
fi

echo "Target registered and installed."
