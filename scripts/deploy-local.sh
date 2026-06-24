#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-final-kubernetes}"
IMAGE_NAME="${IMAGE_NAME:-final-api:local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT_DIR}/scripts/build-image.sh"
kind load docker-image "${IMAGE_NAME}" --name "${CLUSTER_NAME}"
kubectl --context "kind-${CLUSTER_NAME}" apply -k "${ROOT_DIR}/deploy/k8s"
kubectl --context "kind-${CLUSTER_NAME}" -n final-app rollout restart deploy/final-api
kubectl --context "kind-${CLUSTER_NAME}" -n final-app rollout status deploy/final-api --timeout=180s

echo "API: http://localhost:18090"
