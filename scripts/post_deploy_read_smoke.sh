#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"
source "${SCRIPT_DIR}/lib/auth.sh"

API_BASE_URL="${API_BASE_URL:-}"
AUTH_EMAIL="${AUTH_EMAIL:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
AUTH_COOKIE_JAR_OUT="${AUTH_COOKIE_JAR_OUT:-}"
COOKIE_JAR="$(mktemp)"
CLUSTERS_RESPONSE="$(mktemp)"
RESOURCES_RESPONSE="$(mktemp)"
trap 'rm -f "${COOKIE_JAR}" "${CLUSTERS_RESPONSE}" "${RESOURCES_RESPONSE}"' EXIT

for variable in \
  API_BASE_URL \
  AUTH_EMAIL \
  AUTH_PASSWORD; do
  require_env "${variable}"
done

if [ -n "${AUTH_COOKIE_JAR_OUT}" ] && [[ "${AUTH_COOKIE_JAR_OUT}" != /* ]]; then
  echo "AUTH_COOKIE_JAR_OUT must be an absolute path" >&2
  exit 1
fi

echo "==> post-deploy operator login"
login_with_password "${API_BASE_URL}" "${COOKIE_JAR}"

echo "==> post-deploy cluster and resource reads"
curl --fail --silent --show-error \
  --cookie "${COOKIE_JAR}" \
  --output "${CLUSTERS_RESPONSE}" \
  "${API_BASE_URL}/clusters?limit=100"
curl --fail --silent --show-error \
  --cookie "${COOKIE_JAR}" \
  --output "${RESOURCES_RESPONSE}" \
  "${API_BASE_URL}/resources?limit=1"

python3 - "${CLUSTERS_RESPONSE}" "${RESOURCES_RESPONSE}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    clusters = json.load(handle)
with open(sys.argv[2], encoding="utf-8") as handle:
    resources = json.load(handle)

if not isinstance(clusters.get("clusters"), list):
    raise SystemExit("cluster list response is invalid")
if not isinstance(resources.get("items"), list):
    raise SystemExit("resource list response is invalid")
PY

if [ -n "${AUTH_COOKIE_JAR_OUT}" ]; then
  rm -f -- "${AUTH_COOKIE_JAR_OUT}"
  install -m 600 -- "${COOKIE_JAR}" "${AUTH_COOKIE_JAR_OUT}"
fi

echo "post-deploy read smoke passed"
