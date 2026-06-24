#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-final-kubernetes}"

if kind get clusters | grep -qx "${CLUSTER_NAME}"; then
  kind delete cluster --name "${CLUSTER_NAME}"
else
  echo "Cluster not found: ${CLUSTER_NAME}"
fi
