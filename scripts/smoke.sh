#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:18080}"
GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
MGMT_CONTEXT="${MGMT_CONTEXT:-kind-management}"
MGMT_NS="${MGMT_NS:-management}"
SMOKE_IMAGE="${SMOKE_IMAGE:-service:local}"
COOKIE_JAR="$(mktemp)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
trap 'rm -f "${COOKIE_JAR}"' EXIT

source "${SCRIPT_DIR}/lib/auth.sh"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need curl
need python3

load_webhook_secret() {
  kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" \
    get secret management-runtime-secret -o jsonpath='{.data.GITHUB_WEBHOOK_SECRET}' \
    | python3 -c 'import base64, sys; print(base64.b64decode(sys.stdin.read()).decode())'
}

if [ -z "${GITHUB_WEBHOOK_SECRET}" ]; then
  need kubectl
  GITHUB_WEBHOOK_SECRET="$(load_webhook_secret)"
fi

sign_body() {
  BODY="$1" WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}" python3 - <<'PY'
import hashlib
import hmac
import os

print(
    "sha256="
    + hmac.new(
        os.environ["WEBHOOK_SECRET"].encode(),
        os.environ["BODY"].encode(),
        hashlib.sha256,
    ).hexdigest()
)
PY
}

echo "==> checking gateway"
curl -fsS "${BASE_URL}/healthz"
echo

echo "==> logging in operator"
login_with_password "${BASE_URL}" "${COOKIE_JAR}"

echo "==> sending signed GitHub webhook"
webhook_body="$(
  SMOKE_IMAGE="${SMOKE_IMAGE}" python3 - <<'PY'
import json
import os

print(json.dumps({"commit_sha": "abc1234", "image": os.environ["SMOKE_IMAGE"], "replicas": 2}))
PY
)"
signature="$(sign_body "${webhook_body}")"
curl -fsS -X POST "${BASE_URL}/github/webhook" \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: ${signature}" \
  -d "${webhook_body}"
echo

echo "==> sending manual UI command"
curl -fsS -X POST "${BASE_URL}/commands" \
  -b "${COOKIE_JAR}" \
  -H "content-type: application/json" \
  -d '{"cluster_id":"target-cluster-01","action":"rollout_restart","namespace":"sandbox","reason":"manual smoke command"}'
echo

echo "==> waiting for async workers"
sleep 18

echo "==> dashboard query"
dashboard="$(curl -fsS -b "${COOKIE_JAR}" "${BASE_URL}/dashboard/query")"
echo "${dashboard}"
echo

if ! printf "%s" "${dashboard}" | grep -Eq "safe_pr.created|command.completed|evidence.built|dashboard.updated"; then
  echo "dashboard does not show expected event cycle yet" >&2
  exit 1
fi

echo "Smoke test passed."
