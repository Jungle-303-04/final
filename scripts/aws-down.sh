#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
MGMT_CLUSTER="${MGMT_CLUSTER:-kubernetes-ops}"
TARGET_CLUSTER_1="${TARGET_CLUSTER_1:-cluster-1}"
TARGET_CLUSTER_2="${TARGET_CLUSTER_2:-cluster-2}"
ECR_REPO="${ECR_REPO:-kubernetes-ops-service}"
DELETE_ECR="${DELETE_ECR:-0}"

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

cluster_exists() {
  aws eks describe-cluster \
    --region "${AWS_REGION}" \
    --name "$1" >/dev/null 2>&1
}

delete_cluster_if_exists() {
  local cluster_name="$1"
  if cluster_exists "${cluster_name}"; then
    echo "==> deleting EKS cluster: ${cluster_name}"
    eksctl delete cluster --region "${AWS_REGION}" --name "${cluster_name}" --wait
  else
    echo "==> EKS cluster already absent: ${cluster_name}"
  fi
}

need aws
need eksctl

delete_cluster_if_exists "${TARGET_CLUSTER_2}"
delete_cluster_if_exists "${TARGET_CLUSTER_1}"
delete_cluster_if_exists "${MGMT_CLUSTER}"

if [[ "${DELETE_ECR}" == "1" ]]; then
  echo "==> deleting ECR repository: ${ECR_REPO}"
  aws ecr delete-repository \
    --region "${AWS_REGION}" \
    --repository-name "${ECR_REPO}" \
    --force >/dev/null 2>&1 || true
else
  echo "==> keeping ECR repository ${ECR_REPO} (set DELETE_ECR=1 to remove it)"
fi
