#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-eda-management}"
DEPLOYMENT="${1:-}"
REPLICAS="${2:-}"

if [[ -z "${DEPLOYMENT}" || -z "${REPLICAS}" ]]; then
  echo "usage: $0 <management-deployment> <replicas>" >&2
  echo "example: $0 evidence-builder 3" >&2
  exit 1
fi

kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management scale "deploy/${DEPLOYMENT}" --replicas="${REPLICAS}"
kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management rollout status "deploy/${DEPLOYMENT}" --timeout=120s

