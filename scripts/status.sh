#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-kubernetes-ops}"
TARGET_CLUSTER="${TARGET_CLUSTER:-cluster-1}"
MGMT_CONTEXT="${MGMT_CONTEXT:-${MGMT_CLUSTER}}"
TARGET_CONTEXT="${TARGET_CONTEXT:-${TARGET_CLUSTER}}"
BASE_URL="${BASE_URL:-https://k8s.woonyong.org}"

echo "==> management pods"
kubectl --context "${MGMT_CONTEXT}" -n management get pods -o wide

echo
echo "==> target pods"
kubectl --context "${TARGET_CONTEXT}" -n target get pods -o wide

echo
echo "==> gateway health"
curl -fsS "${BASE_URL}/healthz" || true
echo
