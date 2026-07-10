#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/docs/api"
ENV_FILE="${BRUNO_ENV_FILE:-${API_DIR}/environments/aws-test.bru}"
OUTPUT_FILE="${BRUNO_OUTPUT_FILE:-/tmp/bruno-aws-ordered-run.json}"
DELAY_MS="${BRUNO_DELAY_MS:-250}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing Bruno env file: ${ENV_FILE}" >&2
  echo "Select an existing Bruno environment file with BRUNO_ENV_FILE." >&2
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
  02-target-admin/01-register-target-dry-run.bru \
  02-target-admin/02-update-cluster-policy.bru \
  02-target-admin/03-install-manifest-by-token.bru \
  02-target-admin/04-update-scheduling-profiles.bru \
  02-target-admin/05-get-scheduling-profiles.bru \
  03-agent-runtime \
  04-command \
  05-rca-dashboard \
  06-gitops-approval \
  07-ai \
  08-ops-dlq \
  09-management-console \
  10-applications \
  11-clusters/01-list-clusters.bru \
  11-clusters/02-get-cluster.bru \
  11-clusters/03-connection-status.bru \
  11-clusters/04-inventory-summary.bru \
  11-clusters/05-inventory-resources.bru \
  11-clusters/06-inventory-workloads.bru \
  11-clusters/07-inventory-services.bru \
  11-clusters/08-inventory-events.bru \
  11-clusters/09-scale-deployment.bru \
  11-clusters/10-restart-deployment.bru \
  11-clusters/11-usage-series.bru \
  12-catalog \
  13-alert-channels \
  14-repository-discovery \
  15-wizard-validation \
  00-health-auth/08-approve-user.bru \
  00-health-auth/09-verify-email.bru \
  00-health-auth/10-logout.bru \
  11-clusters/12-unregister-cluster.bru \
  -r \
  --env-file "${ENV_FILE}" \
  --sandbox developer \
  --delay "${DELAY_MS}" \
  --reporter-skip-body \
  --reporter-skip-all-headers \
  --output "${OUTPUT_FILE}" \
  --format json
