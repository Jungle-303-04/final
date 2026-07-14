#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"

BASE_URL="${BASE_URL:-}"
MGMT_CONTEXT="${MGMT_CONTEXT:-}"
MGMT_NS="${MGMT_NS:-management}"
PRE_DEPLOY_FRONTEND_BUNDLE="${PRE_DEPLOY_FRONTEND_BUNDLE:-}"
EXPECTED_CONSOLE_IMAGE="${EXPECTED_CONSOLE_IMAGE:-}"
CONSOLE_ROLLBACK_PLAN="${CONSOLE_ROLLBACK_PLAN:-}"
SOURCE_SHA="${SOURCE_SHA:-}"
SMOKE_CURL_IMAGE="${SMOKE_CURL_IMAGE:-curlimages/curl:8.11.1}"
IN_CLUSTER_API_URL="http://api-gateway.${MGMT_NS}.svc.cluster.local"
IN_CLUSTER_CONSOLE_URL="http://console-dev.${MGMT_NS}.svc.cluster.local"

for variable in \
  BASE_URL \
  MGMT_CONTEXT \
  PRE_DEPLOY_FRONTEND_BUNDLE \
  EXPECTED_CONSOLE_IMAGE \
  CONSOLE_ROLLBACK_PLAN \
  SOURCE_SHA; do
  require_env "${variable}"
done
BASE_URL="${BASE_URL%/}"

for command in curl grep jq kubectl; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "missing required command: ${command}" >&2
    exit 1
  fi
done

if ! [[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "source SHA must be a full lowercase Git SHA" >&2
  exit 1
fi
if ! [[ "${EXPECTED_CONSOLE_IMAGE}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "expected console image must be digest-pinned" >&2
  exit 1
fi

index_file="$(mktemp)"
bundle_file="$(mktemp)"
cleanup() {
  rm -f "${index_file}" "${bundle_file}"
}
trap cleanup EXIT

cluster_curl() {
  local url="$1"
  local pod_name="deploy-smoke-console-${GITHUB_RUN_ID:-local}-${RANDOM}"

  kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" run "${pod_name}" \
    --rm -i --restart=Never \
    --image="${SMOKE_CURL_IMAGE}" \
    --quiet -- \
    curl --silent --show-error \
      --connect-timeout 5 \
      --max-time 15 \
      --write-out $'\n%{http_code}' \
      "${url}"
}

echo "==> post-deploy gateway health"
health_response="$(cluster_curl "${IN_CLUSTER_API_URL}/api/healthz")"
test "${health_response##*$'\n'}" = "200"

echo "==> post-deploy frontend bundle"
frontend_response="$(cluster_curl "${IN_CLUSTER_CONSOLE_URL}/")"
frontend_status="${frontend_response##*$'\n'}"
printf '%s' "${frontend_response%$'\n'*}" >"${index_file}"
test "${frontend_status}" = "200"
post_bundle="$(grep -Eom1 'index-[A-Za-z0-9_-]+\.js' "${index_file}")"
test -n "${post_bundle}"
test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}"

echo "==> post-deploy source provenance"
bundle_response="$(cluster_curl "${IN_CLUSTER_CONSOLE_URL}/assets/${post_bundle}")"
bundle_status="${bundle_response##*$'\n'}"
printf '%s' "${bundle_response%$'\n'*}" >"${bundle_file}"
test "${bundle_status}" = "200"
grep --fixed-strings --quiet "${SOURCE_SHA}" "${bundle_file}"

echo "==> post-deploy immutable console image"
while IFS=$'\t' read -r namespace resource container; do
  current_image="$(
    kubectl --context "${MGMT_CONTEXT}" -n "${namespace}" get "${resource}" -o json \
      | jq -r --arg container "${container}" \
        '.spec.template.spec.containers[] | select(.name == $container) | .image'
  )"
  test "${current_image}" = "${EXPECTED_CONSOLE_IMAGE}"
done < <(jq -r '.targets[] | [.namespace, .resource, .container] | @tsv' \
  "${CONSOLE_ROLLBACK_PLAN}")

echo "==> post-deploy public edge"
public_edge_ready=0
for attempt in $(seq 1 12); do
  public_health="$(curl --silent --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --output /dev/null \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/healthz")"
  public_index="$(curl --silent --show-error \
    --connect-timeout 5 \
    --max-time 15 \
    --header 'Cache-Control: no-cache' \
    "${BASE_URL}/?source_sha=${SOURCE_SHA}")"
  if [[ "${public_health}" == "200" ]] && \
    grep --fixed-strings --quiet "${post_bundle}" <<<"${public_index}"; then
    public_edge_ready=1
    break
  fi
  echo "public edge not converged: attempt=${attempt} health=${public_health}" >&2
  sleep 5
done
test "${public_edge_ready}" = "1"

printf 'post-deploy console smoke passed: bundle=%s source_sha=%s\n' \
  "${post_bundle}" "${SOURCE_SHA}"
