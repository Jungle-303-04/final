#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"
source "${SCRIPT_DIR}/lib/auth.sh"

API_BASE_URL="${API_BASE_URL:-}"
AUTH_EMAIL="${AUTH_EMAIL:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
SMOKE_RCA_CORRELATION_ID="${SMOKE_RCA_CORRELATION_ID:-}"
SMOKE_RCA_INCIDENT_ID="${SMOKE_RCA_INCIDENT_ID:-}"
STRICT_API_SMOKE_SCRIPT="${STRICT_API_SMOKE_SCRIPT:-${SCRIPT_DIR}/strict_api_smoke.py}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "${COOKIE_JAR}"' EXIT

for variable in \
  API_BASE_URL \
  AUTH_EMAIL \
  AUTH_PASSWORD \
  SMOKE_RCA_CORRELATION_ID \
  SMOKE_RCA_INCIDENT_ID; do
  require_env "${variable}"
done

echo "==> post-deploy operator login"
login_with_password "${API_BASE_URL}" "${COOKIE_JAR}"

echo "==> post-deploy strict RCA reads"
python3 "${STRICT_API_SMOKE_SCRIPT}" \
  --base-url "${API_BASE_URL}" \
  --cookie-jar "${COOKIE_JAR}" \
  --correlation-id "${SMOKE_RCA_CORRELATION_ID}" \
  --incident-id "${SMOKE_RCA_INCIDENT_ID}"

echo "post-deploy read smoke passed"
