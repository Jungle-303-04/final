#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"

BASE_URL="${BASE_URL:-}"
MGMT_CONTEXT="${MGMT_CONTEXT:-}"
MGMT_NS="${MGMT_NS:-management}"
PRE_DEPLOY_FRONTEND_BUNDLE="${PRE_DEPLOY_FRONTEND_BUNDLE:-}"
REQUIRE_FRONTEND_BUNDLE_CHANGE="${REQUIRE_FRONTEND_BUNDLE_CHANGE:-}"
EXPECTED_ALEMBIC_HEAD="${EXPECTED_ALEMBIC_HEAD:-}"
EXPECTED_SERVICE_IMAGE="${EXPECTED_SERVICE_IMAGE:-}"
EXPECTED_CONSOLE_IMAGE="${EXPECTED_CONSOLE_IMAGE:-}"
SERVICE_ROLLBACK_PLAN="${SERVICE_ROLLBACK_PLAN:-}"
CONSOLE_ROLLBACK_PLAN="${CONSOLE_ROLLBACK_PLAN:-}"

for variable in \
  BASE_URL \
  MGMT_CONTEXT \
  PRE_DEPLOY_FRONTEND_BUNDLE \
  REQUIRE_FRONTEND_BUNDLE_CHANGE \
  EXPECTED_ALEMBIC_HEAD \
  EXPECTED_SERVICE_IMAGE \
  EXPECTED_CONSOLE_IMAGE \
  SERVICE_ROLLBACK_PLAN \
  CONSOLE_ROLLBACK_PLAN; do
  require_env "${variable}"
done
BASE_URL="${BASE_URL%/}"

for command in curl jq kubectl python3 uv; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "missing required command: ${command}" >&2
    exit 1
  fi
done

if ! [[ "${EXPECTED_SERVICE_IMAGE}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "expected service image must be digest-pinned" >&2
  exit 1
fi
if ! [[ "${EXPECTED_CONSOLE_IMAGE}" =~ @sha256:[0-9a-f]{64}$ ]]; then
  echo "expected console image must be digest-pinned" >&2
  exit 1
fi

index_file="$(mktemp)"
health_file="$(mktemp)"
trap 'rm -f "${index_file}" "${health_file}"' EXIT

echo "==> post-deploy gateway health"
health_status="$(
  curl --silent --show-error \
    --output "${health_file}" \
    --write-out '%{http_code}' \
    "${BASE_URL}/api/healthz"
)"
test "${health_status}" = "200"
python3 - "${health_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    document = json.load(handle)
if document.get("status") != "ok":
    raise SystemExit("post-deploy gateway health is not ok")
PY

echo "==> post-deploy frontend bundle"
frontend_status="$(
  curl --silent --show-error \
    --output "${index_file}" \
    --write-out '%{http_code}' \
    "${BASE_URL}/"
)"
test "${frontend_status}" = "200"
post_bundle="$(grep -Eom1 'index-[A-Za-z0-9_-]+\.js' "${index_file}")"
test -n "${post_bundle}"
case "${REQUIRE_FRONTEND_BUNDLE_CHANGE}" in
  1) test "${post_bundle}" != "${PRE_DEPLOY_FRONTEND_BUNDLE}" ;;
  0) ;;
  *) echo "REQUIRE_FRONTEND_BUNDLE_CHANGE must be 0 or 1" >&2; exit 1 ;;
esac

echo "==> post-deploy login, workflow, and strict RCA reads"
bash "${SCRIPT_DIR}/smoke.sh"

echo "==> post-deploy Alembic head"
runtime_database="$({
  kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" \
    get secret management-runtime-secret \
    -o jsonpath='{.data.COMMAND_NOTIFY_DATABASE_URL}'
} | python3 -c '
import base64
import sys
from urllib.parse import urlsplit

value = base64.b64decode(sys.stdin.buffer.read(), validate=True).decode()
parsed = urlsplit(value)
if parsed.scheme not in {"postgres", "postgresql"} or parsed.path.count("/") != 1:
    raise SystemExit("runtime database URL is invalid")
print(parsed.path[1:])
')"
test -n "${runtime_database}"
database_head="$(
  kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" exec statefulset/postgresql -- \
    env OPSIA_RUNTIME_DATABASE="${runtime_database}" \
    sh -ec 'psql -U "$POSTGRES_USER" -d "$OPSIA_RUNTIME_DATABASE" -v ON_ERROR_STOP=1 -Atc "SELECT version_num FROM alembic_version"'
)"
test "${database_head}" = "${EXPECTED_ALEMBIC_HEAD}"

echo "==> post-deploy auth bypass policy"
uv run python "${SCRIPT_DIR}/verify_dev_auth_bypass.py" live \
  --context "${MGMT_CONTEXT}" \
  --namespace "${MGMT_NS}"

verify_plan_images() {
  local plan="$1"
  local expected_image="$2"
  local namespace
  local resource
  local container
  local current_image

  while IFS=$'\t' read -r namespace resource container; do
    current_image="$(
      kubectl --context "${MGMT_CONTEXT}" -n "${namespace}" get "${resource}" -o json \
        | jq -r --arg container "${container}" \
          '.spec.template.spec.containers[] | select(.name == $container) | .image'
    )"
    test "${current_image}" = "${expected_image}"
  done < <(jq -r '.targets[] | [.namespace, .resource, .container] | @tsv' "${plan}")
}

echo "==> post-deploy immutable images"
verify_plan_images "${SERVICE_ROLLBACK_PLAN}" "${EXPECTED_SERVICE_IMAGE}"
verify_plan_images "${CONSOLE_ROLLBACK_PLAN}" "${EXPECTED_CONSOLE_IMAGE}"

printf 'post-deploy smoke passed: bundle=%s head=%s\n' \
  "${post_bundle}" "${database_head}"
