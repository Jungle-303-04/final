#!/usr/bin/env bash

login_with_password() {
  local base_url="$1"
  local cookie_jar="$2"

  if [ -z "${AUTH_EMAIL:-}" ] || [ -z "${AUTH_PASSWORD:-}" ]; then
    echo "AUTH_EMAIL and AUTH_PASSWORD are required for password login" >&2
    exit 1
  fi

  local login_body
  login_body="$(
    AUTH_EMAIL="${AUTH_EMAIL}" AUTH_PASSWORD="${AUTH_PASSWORD}" python3 - <<'PY'
import json
import os

print(json.dumps({
    "email": os.environ["AUTH_EMAIL"],
    "password": os.environ["AUTH_PASSWORD"],
}))
PY
  )"

  curl -fsS -X POST "${base_url}/auth/login" \
    -H "content-type: application/json" \
    -c "${cookie_jar}" \
    -d "${login_body}" >/dev/null
}
