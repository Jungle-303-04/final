#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:18080}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need curl
need python3

echo "==> checking gateway"
curl -fsS "${BASE_URL}/healthz"
echo

echo "==> connecting fake GitHub OAuth"
oauth_response="$(curl -fsS -X POST "${BASE_URL}/auth/oauth/github/callback" \
  -H "content-type: application/json" \
  -d '{"user_id":"local-user","code":"fake-code","scopes":["profile","email","repo"]}')"
echo "${oauth_response}"
session_token="$(printf "%s" "${oauth_response}" | python3 -c 'import json, sys; print(json.load(sys.stdin)["session"]["session_token"])')"

echo "==> sending fake GitHub webhook"
curl -fsS -X POST "${BASE_URL}/github/webhook" \
  -H "content-type: application/json" \
  -d '{"commit_sha":"abc1234","image":"ghcr.io/project/checkout-api:bad","replicas":2}'
echo

echo "==> sending manual UI command"
curl -fsS -X POST "${BASE_URL}/commands" \
  -H "authorization: Bearer ${session_token}" \
  -H "content-type: application/json" \
  -d '{"cluster_id":"target-cluster-01","action":"rollout_restart","namespace":"sandbox","reason":"manual smoke command"}'
echo

echo "==> waiting for async workers"
sleep 18

echo "==> dashboard query"
dashboard="$(curl -fsS -H "authorization: Bearer ${session_token}" "${BASE_URL}/dashboard/query")"
echo "${dashboard}"
echo

if ! printf "%s" "${dashboard}" | grep -Eq "safe_pr.created|command.completed|evidence.built|dashboard.updated"; then
  echo "dashboard does not show expected event cycle yet" >&2
  exit 1
fi

echo "Smoke test passed."
