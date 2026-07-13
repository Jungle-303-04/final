#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="${TEAM_ENV_TEMPLATE:-${ROOT_DIR}/config/env/local-test.env.example}"
OUTPUT="${TEAM_ENV_FILE:-${ROOT_DIR}/.env.local-test}"
SECRET_ID="${TEAM_SECRET_ID:-kubeheal/test/team}"
AWS_REGION="${TEAM_AWS_REGION:-ap-northeast-2}"
FETCH_SECRETS="${TEAM_ENV_FETCH_SECRETS:-1}"

umask 077
TMP_ENV="$(mktemp)"
TMP_SECRET="$(mktemp)"
cleanup() {
  rm -f "${TMP_ENV}" "${TMP_SECRET}"
}
trap cleanup EXIT

if [[ ! -f "${TEMPLATE}" ]]; then
  echo "team env template not found: ${TEMPLATE}" >&2
  exit 1
fi

install -m 600 "${TEMPLATE}" "${TMP_ENV}"

if [[ "${FETCH_SECRETS}" != "0" ]]; then
  command -v aws >/dev/null || {
    echo "aws CLI is required to fetch team secrets" >&2
    exit 1
  }
  command -v jq >/dev/null || {
    echo "jq is required to render the team env file" >&2
    exit 1
  }
  aws secretsmanager get-secret-value \
    --secret-id "${SECRET_ID}" \
    --region "${AWS_REGION}" \
    --query SecretString \
    --output text >"${TMP_SECRET}"
  jq -e 'type == "object"' "${TMP_SECRET}" >/dev/null
  printf '\n# AWS Secrets Manager: %s\n' "${SECRET_ID}" >>"${TMP_ENV}"
  jq -r '
    [
      "AUTH_EMAIL",
      "AUTH_PASSWORD",
      "BASE_URL",
      "CLOUDFLARE_API_TOKEN",
      "CLOUDFLARE_ZONE_ID",
      "GITHUB_TOKEN",
      "LLM_PROVIDER",
      "OPENAI_API_KEY"
    ] as $allowed
    | to_entries[]
    | . as $entry
    | select($allowed | index($entry.key))
    | "\(.key)=\(.value | tostring | @sh)"
  ' "${TMP_SECRET}" >>"${TMP_ENV}"
fi

install -m 600 "${TMP_ENV}" "${OUTPUT}"
printf 'team env ready: %s\n' "${OUTPUT}"
