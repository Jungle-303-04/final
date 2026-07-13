#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="${GITHUB_REPOSITORY:-Jungle-303-04/final}"
SECRET_ID="${TEAM_SECRET_ID:-kubeheal/test/team}"
AWS_REGION="${TEAM_AWS_REGION:-ap-northeast-2}"

umask 077
TMP_SECRET="$(mktemp)"
cleanup() {
  rm -f "${TMP_SECRET}"
}
trap cleanup EXIT

for command_name in aws gh jq; do
  command -v "${command_name}" >/dev/null || {
    echo "${command_name} is required" >&2
    exit 1
  }
done

aws secretsmanager get-secret-value \
  --secret-id "${SECRET_ID}" \
  --region "${AWS_REGION}" \
  --query SecretString \
  --output text >"${TMP_SECRET}"
jq -e 'type == "object"' "${TMP_SECRET}" >/dev/null

GH_ACCESS_TOKEN="${GH_TOKEN:-$(jq -r '.GITHUB_TOKEN // empty' "${TMP_SECRET}")}"
if [[ -z "${GH_ACCESS_TOKEN}" ]]; then
  echo "GH_TOKEN or GITHUB_TOKEN in the team secret is required" >&2
  exit 1
fi

set_repo_secret() {
  local secret_name="$1"
  local secret_value="$2"
  if [[ -z "${secret_value}" ]]; then
    echo "missing source value for ${secret_name}" >&2
    exit 1
  fi
  printf '%s' "${secret_value}" | GH_TOKEN="${GH_ACCESS_TOKEN}" \
    gh secret set "${secret_name}" --repo "${REPOSITORY}" --body -
  printf 'updated GitHub Actions secret: %s\n' "${secret_name}"
}

AUTH_EMAIL="$(jq -r '.AUTH_EMAIL // empty' "${TMP_SECRET}")"
AUTH_PASSWORD="$(jq -r '.AUTH_PASSWORD // empty' "${TMP_SECRET}")"
BASE_URL="$(jq -r '.BASE_URL // empty' "${TMP_SECRET}")"
GITHUB_TOKEN_VALUE="$(jq -r '.GITHUB_TOKEN // empty' "${TMP_SECRET}")"
CLOUDFLARE_TOKEN="$(jq -r '.CLOUDFLARE_API_TOKEN // empty' "${TMP_SECRET}")"

set_repo_secret "RELEASE_FLOW_AUTH_EMAIL" "${AUTH_EMAIL}"
set_repo_secret "RELEASE_FLOW_AUTH_PASSWORD" "${AUTH_PASSWORD}"
set_repo_secret "RELEASE_FLOW_API_BASE_URL" "${BASE_URL%/}/api"
set_repo_secret "RELEASE_FLOW_GITHUB_TOKEN" "${GITHUB_TOKEN_VALUE}"
set_repo_secret "CLOUDFLARE_API_TOKEN" "${CLOUDFLARE_TOKEN}"
