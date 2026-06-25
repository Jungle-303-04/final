#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-eda-management}"
DEPLOYMENT="${1:-}"

if [[ -z "${DEPLOYMENT}" ]]; then
  echo "usage: $0 <management-deployment>" >&2
  echo "example: $0 evidence-builder" >&2
  exit 1
fi

pod="$(kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management get pod \
  -l "app=${DEPLOYMENT}" \
  -o jsonpath='{.items[0].metadata.name}')"

echo "deleting pod ${pod}"
kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management delete pod "${pod}"
kubectl --context "kind-${MGMT_CLUSTER}" -n eda-management rollout status "deploy/${DEPLOYMENT}" --timeout=120s

