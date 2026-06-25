#!/usr/bin/env bash
set -euo pipefail

MGMT_CLUSTER="${MGMT_CLUSTER:-management}"
DEPLOYMENT="${1:-}"

if [[ -z "${DEPLOYMENT}" ]]; then
  echo "usage: $0 <management-deployment>" >&2
  echo "example: $0 rca-worker" >&2
  exit 1
fi

pod="$(kubectl --context "kind-${MGMT_CLUSTER}" -n management get pod \
  -l "app=${DEPLOYMENT}" \
  -o jsonpath='{.items[0].metadata.name}')"

echo "deleting pod ${pod}"
kubectl --context "kind-${MGMT_CLUSTER}" -n management delete pod "${pod}"
kubectl --context "kind-${MGMT_CLUSTER}" -n management rollout status "deploy/${DEPLOYMENT}" --timeout=120s
