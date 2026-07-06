#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/docs/api"
ENV_FILE="${BRUNO_ENV_FILE:-${API_DIR}/environments/aws-live.local.bru}"
OUTPUT_FILE="${BRUNO_OUTPUT_FILE:-/tmp/bruno-aws-ordered-run.json}"
DELAY_MS="${BRUNO_DELAY_MS:-250}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing Bruno env file: ${ENV_FILE}" >&2
  echo "Generate or select an AWS Bruno environment before running the full flow." >&2
  exit 1
fi

cd "${API_DIR}"

npx --yes @usebruno/cli run \
  00-health-auth/01-healthz.bru \
  00-health-auth/02-readyz.bru \
  00-health-auth/03-openapi-json.bru \
  00-health-auth/04-signup.bru \
  00-health-auth/05-resend-verification.bru \
  00-health-auth/06-login.bru \
  00-health-auth/07-session.bru \
  01-providers \
  02-target-admin \
  03-agent-runtime \
  04-command \
  05-rca-dashboard \
  06-gitops-approval \
  07-ai \
  08-ops-dlq \
  09-management-console \
  10-applications \
  11-clusters \
  12-catalog \
  00-health-auth/08-approve-user.bru \
  00-health-auth/09-verify-email.bru \
  00-health-auth/10-logout.bru \
  -r \
  --env-file "${ENV_FILE}" \
  --sandbox developer \
  --delay "${DELAY_MS}" \
  --reporter-skip-body \
  --reporter-skip-all-headers \
  --output "${OUTPUT_FILE}" \
  --format json
