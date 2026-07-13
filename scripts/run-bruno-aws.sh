#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="${ROOT_DIR}/docs/api"
ENV_FILE="${API_DIR}/environments/aws-test.bru"
OUTPUT_FILE="${BRUNO_OUTPUT_FILE:-/tmp/bruno-aws-ordered-run.json}"
DELAY_MS="${BRUNO_DELAY_MS:-250}"
RUN_ID="bruno-$(date +%Y%m%d%H%M%S)-$$"
CLIENT_CERT_CONFIG="${BRUNO_CLIENT_CERT_CONFIG:-${HOME}/.kubeheal/bruno-client-cert-config.json}"

# Cloudflare가 AAAA/A를 함께 반환하지만 IPv6 route가 없는 개발 머신에서도
# Node가 주소 선택에 따라 연결 timeout으로 빠지지 않게 IPv4를 우선한다.
if [[ "${NODE_OPTIONS:-}" != *"--dns-result-order="* ]]; then
  export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--dns-result-order=ipv4first"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "missing Bruno env file: ${ENV_FILE}" >&2
  exit 1
fi
if [[ ! -f "${CLIENT_CERT_CONFIG}" ]]; then
  echo "missing Bruno mTLS client certificate config: ${CLIENT_CERT_CONFIG}" >&2
  echo "set BRUNO_CLIENT_CERT_CONFIG to a local Bruno client certificate config file" >&2
  exit 1
fi

cd "${API_DIR}"

COMMON_ARGS=(
  --env-file "${ENV_FILE}"
  --client-cert-config "${CLIENT_CERT_CONFIG}"
  --env-var "cluster_id=${RUN_ID}"
  --env-var "cluster_id_2=${RUN_ID}"
  --env-var "agent_cluster_id=${RUN_ID}"
  --env-var "cluster_purge=true"
  --env-var "target_name=API Verification ${RUN_ID}"
  --env-var "agent_target_name=API Verification ${RUN_ID}"
  --env-var "agent_id=agent-${RUN_ID}"
  --env-var "evidence_key=evidence-${RUN_ID}"
  --env-var "lease_id=lease-${RUN_ID}"
  --env-var "signup_email=${RUN_ID}@example.com"
  --sandbox developer
  --cache-ssl-session
  --delay "${DELAY_MS}"
  --reporter-skip-body
  --reporter-skip-all-headers
)

cleanup() {
  # 서버가 명시적 purge capability와 registration environment=test를 모두 확인한다.
  npx --yes @usebruno/cli@3.5.1 run \
    11-clusters/12-unregister-cluster.bru \
    "${COMMON_ARGS[@]}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

npx --yes @usebruno/cli@3.5.1 run \
  00-health-auth/01-healthz.bru \
  00-health-auth/02-readyz.bru \
  00-health-auth/03-openapi-json.bru \
  00-health-auth/07-session.bru \
  01-providers \
  02-target-admin/01-register-target-dry-run.bru \
  02-target-admin/02-update-cluster-policy.bru \
  02-target-admin/03-install-manifest-by-token.bru \
  02-target-admin/04-update-scheduling-profiles.bru \
  02-target-admin/05-get-scheduling-profiles.bru \
  03-agent-runtime \
  04-command \
  05-rca-dashboard/01-dashboard-timeline.bru \
  05-rca-dashboard/05-evidence-query.bru \
  05-rca-dashboard/06-rca-reports.bru \
  05-rca-dashboard/07-fleet-summary.bru \
  05-rca-dashboard/08-cluster-summary.bru \
  05-rca-dashboard/09-node-summary.bru \
  05-rca-dashboard/10-node-pods-summary.bru \
  05-rca-dashboard/13-remediation-bundle.bru \
  05-rca-dashboard/14-audit-timeline.bru \
  05-rca-dashboard/15-recent-changes.bru \
  07-ai/01-create-conversation.bru \
  07-ai/02-get-conversation.bru \
  07-ai/03-append-message.bru \
  07-ai/05-delete-conversation.bru \
  08-ops-dlq/01-dead-letters.bru \
  08-ops-dlq/03-metrics.bru \
  09-management-console/01-list-orgs.bru \
  09-management-console/04-list-users.bru \
  09-management-console/05-list-groups.bru \
  09-management-console/10-list-access.bru \
  10-applications/01-list-applications.bru \
  11-clusters/01-list-clusters.bru \
  11-clusters/02-get-cluster.bru \
  11-clusters/03-connection-status.bru \
  11-clusters/04-inventory-summary.bru \
  11-clusters/05-inventory-resources.bru \
  11-clusters/06-inventory-workloads.bru \
  11-clusters/07-inventory-services.bru \
  11-clusters/08-inventory-events.bru \
  11-clusters/11-usage-series.bru \
  12-catalog/01-list-items.bru \
  12-catalog/02-get-item.bru \
  13-alert-channels/01-list-alert-channels.bru \
  14-repository-discovery \
  15-wizard-validation/01-check-email.bru \
  15-wizard-validation/02-cluster-registration-discovery.bru \
  15-wizard-validation/03-repo-validate.bru \
  15-wizard-validation/04-repo-branches.bru \
  15-wizard-validation/05-repo-manifests.bru \
  15-wizard-validation/07-rca-rule-validate.bru \
  15-wizard-validation/08-metrics-validate.bru \
  -r \
  "${COMMON_ARGS[@]}" \
  --output "${OUTPUT_FILE}" \
  --format json

trap - EXIT
cleanup
