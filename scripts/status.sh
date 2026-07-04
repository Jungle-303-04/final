#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-management}"
TARGET_CLUSTER="${TARGET_CLUSTER:-target}"
GATEWAY_PORT="${GATEWAY_PORT:-18080}"
BASE_URL="${BASE_URL:-http://localhost:${GATEWAY_PORT}}"

echo "==> management pods"
kubectl --context "kind-${MGMT_CLUSTER}" -n management get pods -o wide

echo
echo "==> target pods"
kubectl --context "kind-${TARGET_CLUSTER}" -n target get pods -o wide

echo
echo "==> gateway health"
curl -fsS "${BASE_URL}/healthz" || true
echo
