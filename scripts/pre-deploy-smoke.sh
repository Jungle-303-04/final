#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/env.sh"

BASE_URL="${BASE_URL:-}"
MGMT_CONTEXT="${MGMT_CONTEXT:-}"
MGMT_NS="${MGMT_NS:-management}"

require_env BASE_URL
require_env MGMT_CONTEXT
BASE_URL="${BASE_URL%/}"

for command in curl kubectl python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "missing required command: ${command}" >&2
    exit 1
  fi
done

index_file="$(mktemp)"
health_file="$(mktemp)"
trap 'rm -f "${index_file}" "${health_file}"' EXIT

echo "==> pre-deploy gateway health" >&2
curl -fsS "${BASE_URL}/api/healthz" >"${health_file}"
python3 - "${health_file}" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    document = json.load(handle)
if document.get("status") != "ok":
    raise SystemExit("pre-deploy gateway health is not ok")
PY

echo "==> pre-deploy frontend" >&2
curl -fsS "${BASE_URL}/" >"${index_file}"
frontend_bundle="$(grep -Eom1 'index-[A-Za-z0-9_-]+\.js' "${index_file}")"
if [ -z "${frontend_bundle}" ]; then
  echo "pre-deploy frontend did not expose a versioned bundle" >&2
  exit 1
fi

echo "==> pre-deploy database connection" >&2
database_probe="$(
  kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" exec statefulset/postgresql -- \
    sh -ec 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -Atc "SELECT 1"'
)"
test "${database_probe}" = "1"

printf 'frontend_bundle=%s\n' "${frontend_bundle}"
