#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-eda-management}"
TARGET_CLUSTER="${TARGET_CLUSTER:-eda-target}"

echo "==> management pods"
kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management get pods -o wide

echo
echo "==> target pods"
kubectl --context "kind-${TARGET_CLUSTER}" -n eda-target get pods -o wide

echo
echo "==> gateway health"
curl -fsS http://localhost:18080/healthz || true
echo

