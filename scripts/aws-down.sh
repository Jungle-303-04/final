#!/usr/bin/env bash
set -euo pipefail

PROJECT_SLUG="${PROJECT_SLUG:-kubernetes-ops}"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
MGMT_CLUSTER="${MGMT_CLUSTER:-management-server}"
TARGET_CLUSTER_1="${TARGET_CLUSTER_1:-game-server}"
TARGET_CLUSTER_2="${TARGET_CLUSTER_2:-demo-server}"

BLUE_MGMT_CLUSTER="${BLUE_MGMT_CLUSTER:-}"
BLUE_GAME_CLUSTER="${BLUE_GAME_CLUSTER:-}"
BLUE_DEMO_CLUSTER="${BLUE_DEMO_CLUSTER:-}"

ECR_REPO="${ECR_REPO:-${PROJECT_SLUG}-service}"
CONSOLE_ECR_REPO="${CONSOLE_ECR_REPO:-${PROJECT_SLUG}-console}"
DESTROY_MODE="${DESTROY_MODE:-disabled}"
ALLOW_AWS_DESTROY="${ALLOW_AWS_DESTROY:-0}"
DESTROY_CONFIRMATION="${DESTROY_CONFIRMATION:-}"
EXPECTED_AWS_ACCOUNT_ID="${EXPECTED_AWS_ACCOUNT_ID:-}"
BACKUP_SNAPSHOT_IDS="${BACKUP_SNAPSHOT_IDS:-}"
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

require_active_cluster() {
  local cluster_name="$1"
  local status
  status="$(
    aws eks describe-cluster \
      --region "${AWS_REGION}" \
      --name "${cluster_name}" \
      --query 'cluster.status' \
      --output text
  )"
  if [[ "${status}" != "ACTIVE" ]]; then
    echo "replacement cluster is not ACTIVE: ${cluster_name} (${status})" >&2
    exit 1
  fi
}

require_exact_context() {
  local cluster_name="$1"
  local observed
  observed="$(kubectl config get-contexts "${cluster_name}" -o name 2>/dev/null || true)"
  if [[ "${observed}" != "${cluster_name}" ]]; then
    echo "required kubeconfig context is missing: ${cluster_name}" >&2
    exit 1
  fi
}

verify_backup_snapshots() {
  local raw_snapshot_ids="$1"
  local snapshot_id
  local state
  local encrypted
  local -a snapshot_ids

  IFS=',' read -r -a snapshot_ids <<<"${raw_snapshot_ids}"
  if (( ${#snapshot_ids[@]} < 3 )); then
    echo "BACKUP_SNAPSHOT_IDS must contain fresh PostgreSQL, NATS, and MinIO snapshots" >&2
    exit 1
  fi
  for snapshot_id in "${snapshot_ids[@]}"; do
    [[ "${snapshot_id}" =~ ^snap-[0-9a-f]{17}$ ]] || {
      echo "invalid backup snapshot ID: ${snapshot_id}" >&2
      exit 1
    }
    state="$(
      aws ec2 describe-snapshots \
        --region "${AWS_REGION}" \
        --owner-ids self \
        --snapshot-ids "${snapshot_id}" \
        --query 'Snapshots[0].State' \
        --output text
    )"
    encrypted="$(
      aws ec2 describe-snapshots \
        --region "${AWS_REGION}" \
        --owner-ids self \
        --snapshot-ids "${snapshot_id}" \
        --query 'Snapshots[0].Encrypted' \
        --output text
    )"
    if [[ "${state}" != "completed" || "${encrypted}" != "True" ]]; then
      echo "backup snapshot must be completed and encrypted: ${snapshot_id}" >&2
      exit 1
    fi
  done
}

delete_load_balancer_services() {
  local cluster_name="$1"
  local namespace
  local service

  while read -r namespace service; do
    [[ -n "${namespace}" && -n "${service}" ]] || continue
    echo "==> deleting LoadBalancer service: ${cluster_name}/${namespace}/${service}"
    kubectl --context "${cluster_name}" -n "${namespace}" \
      delete service "${service}" --wait=true
  done < <(
    kubectl --context "${cluster_name}" get services --all-namespaces \
      -o jsonpath='{range .items[?(@.spec.type=="LoadBalancer")]}{.metadata.namespace}{" "}{.metadata.name}{"\n"}{end}'
  )
}

delete_persistent_claims() {
  local cluster_name="$1"
  local namespace
  local statefulset
  local claim

  while read -r namespace statefulset; do
    [[ -n "${namespace}" && -n "${statefulset}" ]] || continue
    kubectl --context "${cluster_name}" -n "${namespace}" \
      scale "statefulset/${statefulset}" --replicas=0
  done < <(
    kubectl --context "${cluster_name}" get statefulsets --all-namespaces \
      -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{"\n"}{end}'
  )

  while read -r namespace claim; do
    [[ -n "${namespace}" && -n "${claim}" ]] || continue
    echo "==> deleting persistent claim: ${cluster_name}/${namespace}/${claim}"
    kubectl --context "${cluster_name}" -n "${namespace}" \
      delete "pvc/${claim}" --wait=true
  done < <(
    kubectl --context "${cluster_name}" get pvc --all-namespaces \
      -o jsonpath='{range .items[*]}{.metadata.namespace}{" "}{.metadata.name}{"\n"}{end}'
  )
}

disable_cluster_termination_protection() {
  local cluster_name="$1"
  local deletion_protection
  local stack_name

  deletion_protection="$(
    aws eks describe-cluster \
      --region "${AWS_REGION}" \
      --name "${cluster_name}" \
      --query 'cluster.deletionProtection' \
      --output text
  )"
  if [[ "${deletion_protection}" == "True" ]]; then
    echo "==> disabling EKS deletion protection: ${cluster_name}"
    aws eks update-cluster-config \
      --region "${AWS_REGION}" \
      --name "${cluster_name}" \
      --no-deletion-protection >/dev/null
    aws eks wait cluster-active --region "${AWS_REGION}" --name "${cluster_name}"
  fi

  for stack_name in $(
    aws cloudformation describe-stacks \
      --region "${AWS_REGION}" \
      --query "Stacks[?starts_with(StackName, 'eksctl-${cluster_name}-')].StackName" \
      --output text
  ); do
    if [[ "$(
      aws cloudformation describe-stacks \
        --region "${AWS_REGION}" \
        --stack-name "${stack_name}" \
        --query 'Stacks[0].EnableTerminationProtection' \
        --output text
    )" == "True" ]]; then
      echo "==> disabling CloudFormation termination protection: ${stack_name}"
      aws cloudformation update-termination-protection \
        --region "${AWS_REGION}" \
        --stack-name "${stack_name}" \
        --no-enable-termination-protection >/dev/null
    fi
  done
}

delete_cluster_if_exists() {
  local cluster_name="$1"
  if ! cluster_exists "${cluster_name}"; then
    echo "==> EKS cluster already absent: ${cluster_name}"
    return
  fi

  require_exact_context "${cluster_name}"
  delete_load_balancer_services "${cluster_name}"
  delete_persistent_claims "${cluster_name}"
  disable_cluster_termination_protection "${cluster_name}"
  echo "==> deleting EKS cluster: ${cluster_name}"
  eksctl delete cluster --region "${AWS_REGION}" --name "${cluster_name}" --wait
}

resolve_destroy_targets() {
  case "${DESTROY_MODE}" in
    retire-blue)
      if [[ "${DELETE_ECR}" == "1" ]]; then
        echo "DELETE_ECR=1 is forbidden while retiring blue; green uses the same repositories" >&2
        exit 1
      fi
      if [[ -z "${BLUE_MGMT_CLUSTER}" \
        || -z "${BLUE_GAME_CLUSTER}" \
        || -z "${BLUE_DEMO_CLUSTER}" ]]; then
        echo "BLUE_MGMT_CLUSTER, BLUE_GAME_CLUSTER, and BLUE_DEMO_CLUSTER are required" >&2
        exit 1
      fi
      if [[ "${BLUE_MGMT_CLUSTER}" == "${MGMT_CLUSTER}" \
        || "${BLUE_MGMT_CLUSTER}" == "${TARGET_CLUSTER_1}" \
        || "${BLUE_MGMT_CLUSTER}" == "${TARGET_CLUSTER_2}" \
        || "${BLUE_GAME_CLUSTER}" == "${MGMT_CLUSTER}" \
        || "${BLUE_GAME_CLUSTER}" == "${TARGET_CLUSTER_1}" \
        || "${BLUE_GAME_CLUSTER}" == "${TARGET_CLUSTER_2}" \
        || "${BLUE_DEMO_CLUSTER}" == "${MGMT_CLUSTER}" \
        || "${BLUE_DEMO_CLUSTER}" == "${TARGET_CLUSTER_1}" \
        || "${BLUE_DEMO_CLUSTER}" == "${TARGET_CLUSTER_2}" ]]; then
        echo "blue clusters must not overlap canonical green clusters" >&2
        exit 1
      fi
      require_active_cluster "${MGMT_CLUSTER}"
      require_active_cluster "${TARGET_CLUSTER_1}"
      require_active_cluster "${TARGET_CLUSTER_2}"
      DESTROY_MGMT_CLUSTER="${BLUE_MGMT_CLUSTER}"
      DESTROY_GAME_CLUSTER="${BLUE_GAME_CLUSTER}"
      DESTROY_DEMO_CLUSTER="${BLUE_DEMO_CLUSTER}"
      ;;
    canonical)
      DESTROY_MGMT_CLUSTER="${MGMT_CLUSTER}"
      DESTROY_GAME_CLUSTER="${TARGET_CLUSTER_1}"
      DESTROY_DEMO_CLUSTER="${TARGET_CLUSTER_2}"
      ;;
    disabled)
      echo "AWS destroy is disabled; set DESTROY_MODE=retire-blue or DESTROY_MODE=canonical" >&2
      exit 1
      ;;
    *)
      echo "DESTROY_MODE must be retire-blue, canonical, or disabled" >&2
      exit 1
      ;;
  esac
}

require_destroy_confirmation() {
  local account_id
  local expected_confirmation

  [[ "${ALLOW_AWS_DESTROY}" == "1" ]] || {
    echo "ALLOW_AWS_DESTROY=1 is required" >&2
    exit 1
  }
  [[ -n "${EXPECTED_AWS_ACCOUNT_ID}" ]] || {
    echo "EXPECTED_AWS_ACCOUNT_ID is required" >&2
    exit 1
  }
  account_id="$(aws sts get-caller-identity --query Account --output text)"
  if [[ "${account_id}" != "${EXPECTED_AWS_ACCOUNT_ID}" ]]; then
    echo "AWS account mismatch: expected ${EXPECTED_AWS_ACCOUNT_ID}, got ${account_id}" >&2
    exit 1
  fi
  expected_confirmation="$(
    printf 'destroy:%s:%s:%s,%s,%s' \
      "${account_id}" \
      "${AWS_REGION}" \
      "${DESTROY_MGMT_CLUSTER}" \
      "${DESTROY_GAME_CLUSTER}" \
      "${DESTROY_DEMO_CLUSTER}"
  )"
  if [[ "${DESTROY_CONFIRMATION}" != "${expected_confirmation}" ]]; then
    echo "DESTROY_CONFIRMATION must exactly equal: ${expected_confirmation}" >&2
    exit 1
  fi
}

need aws
need eksctl
need kubectl

resolve_destroy_targets
require_destroy_confirmation
verify_backup_snapshots "${BACKUP_SNAPSHOT_IDS}"

# Target clusters first; the management cluster remains available until both
# outbound agents and their external services have been retired.
delete_cluster_if_exists "${DESTROY_DEMO_CLUSTER}"
delete_cluster_if_exists "${DESTROY_GAME_CLUSTER}"
delete_cluster_if_exists "${DESTROY_MGMT_CLUSTER}"

if [[ "${DELETE_ECR}" == "1" ]]; then
  for repo in "${ECR_REPO}" "${CONSOLE_ECR_REPO}"; do
    echo "==> deleting ECR repository: ${repo}"
    aws ecr delete-repository \
      --region "${AWS_REGION}" \
      --repository-name "${repo}" \
      --force >/dev/null
  done
else
  echo "==> keeping ECR repositories ${ECR_REPO}, ${CONSOLE_ECR_REPO}"
fi
