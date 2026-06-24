#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-final-kubernetes}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running." >&2
  exit 1
fi

if ! kind get clusters | grep -qx "${CLUSTER_NAME}"; then
  kind create cluster --name "${CLUSTER_NAME}" --config "${ROOT_DIR}/deploy/kind/kind-config.yaml"
fi

kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null
kubectl cluster-info --context "kind-${CLUSTER_NAME}"
