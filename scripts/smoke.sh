#!/usr/bin/env bash
set -euo pipefail

GATEWAY_PORT="${GATEWAY_PORT:-18080}"
BASE_URL="${BASE_URL:-http://localhost:${GATEWAY_PORT}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

default_github_repo() {
  local url
  url="$(git -C "${ROOT_DIR}" config --get remote.origin.url 2>/dev/null || true)"
  url="${url%.git}"
  case "${url}" in
    git@github.com:*) echo "${url#git@github.com:}" ;;
    https://github.com/*) echo "${url#https://github.com/}" ;;
    http://github.com/*) echo "${url#http://github.com/}" ;;
  esac
}

GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
MGMT_CONTEXT="${MGMT_CONTEXT:-kind-management}"
MGMT_NS="${MGMT_NS:-management}"
SMOKE_IMAGE="${SMOKE_IMAGE:-}"
SMOKE_COMMAND_RESOURCE="${SMOKE_COMMAND_RESOURCE:-}"
GITHUB_REPO="${GITHUB_REPO:-$(default_github_repo)}"
GITHUB_BRANCH="${GITHUB_BRANCH:-dev}"
MANIFEST_PATH="${MANIFEST_PATH:-deploy/target/target.yaml}"
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
SMOKE_COMMIT_SHA="${SMOKE_COMMIT_SHA:-}"
COOKIE_JAR="$(mktemp)"
WEBHOOK_RESPONSE="$(mktemp)"
trap 'rm -f "${COOKIE_JAR}" "${WEBHOOK_RESPONSE}"' EXIT

source "${SCRIPT_DIR}/lib/auth.sh"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need curl
need python3

latest_commit_sha() {
  if [ -z "${GITHUB_REPO}" ]; then
    echo "GITHUB_REPO is required when the current git remote is not a GitHub repository." >&2
    exit 1
  fi
  local header_args=()
  if [ -n "${GITHUB_TOKEN}" ]; then
    header_args=(-H "authorization: Bearer ${GITHUB_TOKEN}")
  fi
  local response
  if [ "${#header_args[@]}" -gt 0 ]; then
    response="$(
      curl -fsS "${header_args[@]}" \
        "${GITHUB_API_BASE%/}/repos/${GITHUB_REPO}/commits?per_page=1&sha=${GITHUB_BRANCH}"
    )"
  else
    response="$(
      curl -fsS \
        "${GITHUB_API_BASE%/}/repos/${GITHUB_REPO}/commits?per_page=1&sha=${GITHUB_BRANCH}"
    )"
  fi
  GITHUB_COMMITS_JSON="${response}" python3 - <<'PY'
import json
import os

commits = json.loads(os.environ["GITHUB_COMMITS_JSON"])
if not commits:
    raise SystemExit("GitHub returned no commits for the configured smoke repo/branch")
print(commits[0]["sha"])
PY
}

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

if [ -z "${SMOKE_COMMIT_SHA}" ]; then
  echo "==> resolving latest Git commit for ${GITHUB_REPO}@${GITHUB_BRANCH}"
  SMOKE_COMMIT_SHA="$(latest_commit_sha)"
fi
if [ -z "${SMOKE_IMAGE}" ]; then
  echo "SMOKE_IMAGE is required for the signed webhook payload" >&2
  exit 1
fi

echo "==> sending signed GitHub webhook"
webhook_body="$(
  SMOKE_IMAGE="${SMOKE_IMAGE}" \
  SMOKE_COMMIT_SHA="${SMOKE_COMMIT_SHA}" \
  GITHUB_REPO="${GITHUB_REPO}" \
  GITHUB_BRANCH="${GITHUB_BRANCH}" \
  MANIFEST_PATH="${MANIFEST_PATH}" \
  python3 - <<'PY'
import json
import os

print(
    json.dumps(
        {
            "commit_sha": os.environ["SMOKE_COMMIT_SHA"],
            "image": os.environ["SMOKE_IMAGE"],
            "replicas": 2,
            "repo_ref": os.environ["GITHUB_REPO"],
            "branch": os.environ["GITHUB_BRANCH"],
            "manifest_path": os.environ["MANIFEST_PATH"],
            "cluster_id": "target-cluster-01",
        }
    )
)
PY
)"
signature="$(sign_body "${webhook_body}")"
curl -fsS -X POST "${BASE_URL}/github/webhook" \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: ${signature}" \
  -d "${webhook_body}" | tee "${WEBHOOK_RESPONSE}"
echo
webhook_correlation_id="$(WEBHOOK_RESPONSE="${WEBHOOK_RESPONSE}" python3 - <<'PY'
import json
import os

with open(os.environ["WEBHOOK_RESPONSE"], encoding="utf-8") as handle:
    print(json.load(handle)["correlation_id"])
PY
)"

if [ -n "${SMOKE_COMMAND_RESOURCE}" ]; then
  echo "==> sending manual UI command"
  SMOKE_COMMAND_RESOURCE="${SMOKE_COMMAND_RESOURCE}" python3 - <<'PY' > "${WEBHOOK_RESPONSE}.command.json"
import json
import os

print(json.dumps({
    "cluster_id": "target-cluster-01",
    "action": "rollout_restart",
    "namespace": "sandbox",
    "reason": "manual smoke command",
    "diff": {
        "resource": os.environ["SMOKE_COMMAND_RESOURCE"],
        "namespace": "sandbox",
        "desired_image": "",
        "actual_image": "",
        "risk": "sandbox-only",
    },
}))
PY
  curl -fsS -X POST "${BASE_URL}/commands" \
    -b "${COOKIE_JAR}" \
    -H "content-type: application/json" \
    -d @"${WEBHOOK_RESPONSE}.command.json"
  echo
fi

echo "==> waiting for async workers"
sleep 18

echo "Smoke test passed."
