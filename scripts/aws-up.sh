#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${ROOT_DIR}/scripts/lib/env.sh"

default_github_repo() {
  local url
  url="$(git -C "${ROOT_DIR}" config --get remote.origin.url 2>/dev/null || true)"
  url="${url%.git}"
  case "${url}" in
    git@github.com:*) echo "${url#git@github.com:}" ;;
    https://github.com/*) echo "${url#https://github.com/}" ;;
    http://github.com/*) echo "${url#http://github.com/}" ;;
  esac
}

PROJECT_SLUG="${PROJECT_SLUG:-kubeheal}"
AWS_REGION="${AWS_REGION:-us-east-1}"
MGMT_CLUSTER="${MGMT_CLUSTER:-${PROJECT_SLUG}-mgmt}"
TARGET_CLUSTER_1="${TARGET_CLUSTER_1:-${PROJECT_SLUG}-target-a}"
TARGET_CLUSTER_2="${TARGET_CLUSTER_2:-${PROJECT_SLUG}-target-b}"
TARGET_CLUSTER_ID_1="${TARGET_CLUSTER_ID_1:-${TARGET_CLUSTER_1}}"
TARGET_CLUSTER_ID_2="${TARGET_CLUSTER_ID_2:-${TARGET_CLUSTER_2}}"

if [[ "${MGMT_CLUSTER}" == "management" ]]; then
  MGMT_CLUSTER="${AWS_MGMT_CLUSTER:-${PROJECT_SLUG}-mgmt}"
fi

MGMT_DISPLAY_NAME="${MGMT_DISPLAY_NAME:-${MGMT_CLUSTER}}"
TARGET_1_DISPLAY_NAME="${TARGET_1_DISPLAY_NAME:-${TARGET_CLUSTER_1}}"
TARGET_2_DISPLAY_NAME="${TARGET_2_DISPLAY_NAME:-${TARGET_CLUSTER_2}}"

ECR_REPO="${ECR_REPO:-${PROJECT_SLUG}-service}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)}"
IMAGE_NAME="${IMAGE_NAME:-}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"

MGMT_NODE_TYPE="${MGMT_NODE_TYPE:-t3.xlarge}"
MGMT_NODES="${MGMT_NODES:-2}"
TARGET_NODE_TYPE="${TARGET_NODE_TYPE:-t3.large}"
TARGET_NODES="${TARGET_NODES:-2}"
NODE_VOLUME_SIZE_GB="${NODE_VOLUME_SIZE_GB:-50}"

POSTGRES_USER="${POSTGRES_USER:-service}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-service}"
DATABASE_URL="${DATABASE_URL:-}"
NATS_URL="${NATS_URL:-nats://nats:4222}"
REDIS_URL="${REDIS_URL:-redis://redis:6379/0}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-minioadmin}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"

GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET:-}"
GITHUB_REPO="${GITHUB_REPO:-$(default_github_repo)}"
GITHUB_BRANCH="${GITHUB_BRANCH:-dev}"
MANIFEST_PATH="${MANIFEST_PATH:-deploy/target/target.yaml}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_API_BASE="${GITHUB_API_BASE:-https://api.github.com}"
GIT_MANIFEST_SOURCE_MODE="${GIT_MANIFEST_SOURCE_MODE:-remote}"
GIT_LOCAL_MANIFEST_ENABLED="${GIT_LOCAL_MANIFEST_ENABLED:-0}"
GIT_CHECKOUT_CACHE_ENABLED="${GIT_CHECKOUT_CACHE_ENABLED:-1}"
GIT_CHECKOUT_CACHE_REQUIRED="${GIT_CHECKOUT_CACHE_REQUIRED:-0}"
GIT_CACHE_MAX_REPOS="${GIT_CACHE_MAX_REPOS:-8}"
GIT_CACHE_MAX_BYTES="${GIT_CACHE_MAX_BYTES:-1073741824}"
GIT_REMOTE_MANIFEST_ENABLED="${GIT_REMOTE_MANIFEST_ENABLED:-1}"
GIT_REMOTE_MANIFEST_REQUIRED="${GIT_REMOTE_MANIFEST_REQUIRED:-1}"
GITOPS_REQUIRE_APPROVED_SNAPSHOT="${GITOPS_REQUIRE_APPROVED_SNAPSHOT:-1}"
GITHUB_MANIFEST_TIMEOUT_SECONDS="${GITHUB_MANIFEST_TIMEOUT_SECONDS:-5}"
COMMAND_JANITOR_INTERVAL_SECONDS="${COMMAND_JANITOR_INTERVAL_SECONDS:-15}"
SCM_PROVIDER="${SCM_PROVIDER:-github}"
SCM_REPO="${SCM_REPO:-${GITHUB_REPO}}"
SCM_BASE_BRANCH="${SCM_BASE_BRANCH:-${GITHUB_BRANCH}}"

LLM_PROVIDER="${LLM_PROVIDER:-}"
LLM_MODEL="${LLM_MODEL:-}"
LLM_BASE_URL="${LLM_BASE_URL:-}"
LLM_TIMEOUT_SECONDS="${LLM_TIMEOUT_SECONDS:-30}"
LLM_MAX_RETRIES="${LLM_MAX_RETRIES:-2}"
LLM_MAX_TOKENS="${LLM_MAX_TOKENS:-1024}"
LLM_API_KEY="${LLM_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
OPENAI_BASE_URL="${OPENAI_BASE_URL:-}"
OPENAI_MODEL="${OPENAI_MODEL:-}"
OPENAI_COMPATIBLE_API_KEY="${OPENAI_COMPATIBLE_API_KEY:-}"
OPENAI_COMPATIBLE_BASE_URL="${OPENAI_COMPATIBLE_BASE_URL:-}"
OPENAI_COMPATIBLE_MODEL="${OPENAI_COMPATIBLE_MODEL:-}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL:-}"
ANTHROPIC_MODEL="${ANTHROPIC_MODEL:-}"
ANTHROPIC_VERSION="${ANTHROPIC_VERSION:-2023-06-01}"
GEMINI_API_KEY="${GEMINI_API_KEY:-}"
GOOGLE_API_KEY="${GOOGLE_API_KEY:-}"
GEMINI_BASE_URL="${GEMINI_BASE_URL:-}"
GEMINI_MODEL="${GEMINI_MODEL:-}"

AUTH_EMAIL="${AUTH_EMAIL:-}"
AUTH_PASSWORD="${AUTH_PASSWORD:-}"
PRINT_GENERATED_ADMIN_PASSWORD="${PRINT_GENERATED_ADMIN_PASSWORD:-0}"
RUN_SMOKE="${RUN_SMOKE:-0}"
SKIP_LB_HEALTH_WAIT="${SKIP_LB_HEALTH_WAIT:-0}"
CREATE_CLUSTERS="${CREATE_CLUSTERS:-1}"
ENSURE_EBS_CSI="${ENSURE_EBS_CSI:-1}"
BOOTSTRAP_ADMIN="${BOOTSTRAP_ADMIN:-1}"
REGISTER_TARGETS="${REGISTER_TARGETS:-1}"
CONFIGURE_ROUTE53="${CONFIGURE_ROUTE53:-0}"
CONFIGURE_CLOUDFLARE="${CONFIGURE_CLOUDFLARE:-0}"
CUSTOM_DOMAIN="${CUSTOM_DOMAIN:-}"
ROUTE53_ZONE_NAME="${ROUTE53_ZONE_NAME:-}"
CLOUDFLARE_ZONE_NAME="${CLOUDFLARE_ZONE_NAME:-}"
CLOUDFLARE_ZONE_ID="${CLOUDFLARE_ZONE_ID:-}"
CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN:-}"
INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR:-true}"
EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS:-15}"
PROMETHEUS_BASE_URL="${PROMETHEUS_BASE_URL:-http://prometheus.target.svc:9090}"
LOKI_BASE_URL="${LOKI_BASE_URL:-http://loki-gateway.target.svc}"

RUNTIME_DIR="$(mktemp -d "${ROOT_DIR}/.aws-up.XXXXXX")"
PORT_FORWARD_PID=""
GENERATED_AUTH_PASSWORD="0"
CUSTOM_DOMAIN_CONFIGURED="0"

cleanup() {
  if [[ -n "${PORT_FORWARD_PID}" ]]; then
    kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  fi
  rm -rf "${RUNTIME_DIR}"
}
trap cleanup EXIT

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

log() {
  printf '==> %s\n' "$1"
}

require_domain_config() {
  local provider="$1"
  local domain="$2"
  local zone="$3"
  if [[ -z "${domain}" || -z "${zone}" ]]; then
    echo "${provider} DNS requires CUSTOM_DOMAIN and zone name env values" >&2
    exit 1
  fi
}

need aws
if [[ "${CREATE_CLUSTERS}" == "1" || "${ENSURE_EBS_CSI}" == "1" ]]; then
  need eksctl
fi
need kubectl
need docker
need curl
need openssl
need python3
if [[ "${BOOTSTRAP_ADMIN}" == "1" ]]; then
  need uv
fi

if [[ "${BOOTSTRAP_ADMIN}" == "1" || "${REGISTER_TARGETS}" == "1" || "${RUN_SMOKE}" == "1" ]]; then
  require_env AUTH_EMAIL
fi

if [[ -z "${AUTH_PASSWORD}" && ( "${BOOTSTRAP_ADMIN}" == "1" || "${REGISTER_TARGETS}" == "1" || "${RUN_SMOKE}" == "1" ) ]]; then
  AUTH_PASSWORD="$(generate_password)"
  GENERATED_AUTH_PASSWORD="1"
fi

aws_account_id() {
  aws sts get-caller-identity --query Account --output text
}

cluster_exists() {
  aws eks describe-cluster \
    --region "${AWS_REGION}" \
    --name "$1" >/dev/null 2>&1
}

existing_secret_value() {
  local context="$1"
  local secret_name="$2"
  local key="$3"
  { kubectl --context "${context}" -n management get secret "${secret_name}" \
    -o "jsonpath={.data.${key}}" 2>/dev/null || true; } \
    | python3 -c 'import base64, sys; data=sys.stdin.read().strip(); print(base64.b64decode(data).decode() if data else "")'
}

valid_github_token() {
  local token="$1"
  [[ -n "${token}" ]] || return 1
  [[ "${token}" != *"<"* && "${token}" != *">"* ]] || return 1
  [[ "${token}" != *PLACEHOLDER* && "${token}" != *TOKEN_HERE* ]] || return 1
  LC_ALL=C grep -q '^[[:print:]]\+$' <<<"${token}"
}

pgbouncer_auth_hash() {
  python3 - "$POSTGRES_USER" "$POSTGRES_PASSWORD" <<'PY'
import hashlib
import sys

user, password = sys.argv[1], sys.argv[2]
print("md5" + hashlib.md5((password + user).encode()).hexdigest())
PY
}

render_eksctl_config() {
  local cluster_name="$1"
  local display_name="$2"
  local node_type="$3"
  local desired_nodes="$4"
  local role="$5"
  local output="$6"
  local min_nodes="1"
  local max_nodes="$((desired_nodes + 1))"

  cat >"${output}" <<YAML
apiVersion: eksctl.io/v1alpha5
kind: ClusterConfig
metadata:
  name: ${cluster_name}
  region: ${AWS_REGION}
  tags:
    DisplayName: "${display_name}"
    Project: "${PROJECT_SLUG}"
    Role: "${role}"
iam:
  withOIDC: true
managedNodeGroups:
  - name: ${cluster_name}-ng
    instanceType: ${node_type}
    desiredCapacity: ${desired_nodes}
    minSize: ${min_nodes}
    maxSize: ${max_nodes}
    volumeSize: ${NODE_VOLUME_SIZE_GB}
    labels:
      role: "${role}"
    tags:
      DisplayName: "${display_name}"
      Project: "${PROJECT_SLUG}"
      Role: "${role}"
YAML
}

tag_cluster() {
  local cluster_name="$1"
  local display_name="$2"
  local role="$3"
  local arn
  arn="$(aws eks describe-cluster \
    --region "${AWS_REGION}" \
    --name "${cluster_name}" \
    --query 'cluster.arn' \
    --output text)"
  aws eks tag-resource \
    --region "${AWS_REGION}" \
    --resource-arn "${arn}" \
    --tags "DisplayName=${display_name},Project=${PROJECT_SLUG},Role=${role}" >/dev/null
}

tag_node_instances() {
  local cluster_name="$1"
  local display_name="$2"
  local role="$3"
  local instance_ids

  instance_ids="$(
    aws ec2 describe-instances \
      --region "${AWS_REGION}" \
      --filters \
        "Name=tag:eks:cluster-name,Values=${cluster_name}" \
        "Name=instance-state-name,Values=pending,running" \
      --query 'Reservations[].Instances[].InstanceId' \
      --output text
  )"
  if [[ -z "${instance_ids}" ]]; then
    log "no EC2 node instances found yet for ${cluster_name}"
    return
  fi
  aws ec2 create-tags \
    --region "${AWS_REGION}" \
    --resources ${instance_ids} \
    --tags \
      "Key=Name,Value=${display_name}" \
      "Key=Project,Value=${PROJECT_SLUG}" \
      "Key=Role,Value=${role}" >/dev/null
}

ensure_cluster() {
  local cluster_name="$1"
  local display_name="$2"
  local node_type="$3"
  local desired_nodes="$4"
  local role="$5"
  local config_path="${RUNTIME_DIR}/${cluster_name}.eksctl.yaml"

  if cluster_exists "${cluster_name}"; then
    log "EKS cluster already exists: ${cluster_name}"
  else
    log "creating EKS cluster ${cluster_name} (${display_name})"
    render_eksctl_config "${cluster_name}" "${display_name}" "${node_type}" "${desired_nodes}" "${role}" "${config_path}"
    eksctl create cluster -f "${config_path}"
  fi

  aws eks wait cluster-active --region "${AWS_REGION}" --name "${cluster_name}"
  aws eks update-kubeconfig \
    --region "${AWS_REGION}" \
    --name "${cluster_name}" \
    --alias "${cluster_name}" >/dev/null
  tag_cluster "${cluster_name}" "${display_name}" "${role}"
  tag_node_instances "${cluster_name}" "${display_name}" "${role}"
}

configure_existing_cluster_context() {
  local cluster_name="$1"
  if ! cluster_exists "${cluster_name}"; then
    echo "EKS cluster does not exist: ${cluster_name}" >&2
    exit 1
  fi
  aws eks wait cluster-active --region "${AWS_REGION}" --name "${cluster_name}"
  aws eks update-kubeconfig \
    --region "${AWS_REGION}" \
    --name "${cluster_name}" \
    --alias "${cluster_name}" >/dev/null
}

ensure_ecr_image() {
  local account_id="$1"
  local registry="${account_id}.dkr.ecr.${AWS_REGION}.amazonaws.com"
  local repo_uri="${registry}/${ECR_REPO}"

  log "ensuring ECR repository: ${ECR_REPO}"
  aws ecr describe-repositories \
    --region "${AWS_REGION}" \
    --repository-names "${ECR_REPO}" >/dev/null 2>&1 \
    || aws ecr create-repository \
      --region "${AWS_REGION}" \
      --repository-name "${ECR_REPO}" >/dev/null

  log "logging in to ECR"
  aws ecr get-login-password --region "${AWS_REGION}" \
    | docker login --username AWS --password-stdin "${registry}" >/dev/null

  if [[ -z "${IMAGE_NAME}" ]]; then
    IMAGE_NAME="${repo_uri}:${IMAGE_TAG}"
  fi

  log "building Docker image: ${IMAGE_NAME}"
  docker build --platform "${DOCKER_PLATFORM}" -f "${ROOT_DIR}/src/services/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"

  log "pushing Docker image: ${IMAGE_NAME}"
  docker push "${IMAGE_NAME}"
}

ensure_ebs_csi() {
  local role_name="${MGMT_CLUSTER}-ebs-csi-driver"
  local policy_arn="arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicyV2"
  local role_arn

  if ! aws iam get-policy --policy-arn "${policy_arn}" >/dev/null 2>&1; then
    policy_arn="arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
  fi

  if ! aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    log "creating EBS CSI IAM role: ${role_name}"
    eksctl create iamserviceaccount \
      --name ebs-csi-controller-sa \
      --namespace kube-system \
      --cluster "${MGMT_CLUSTER}" \
      --region "${AWS_REGION}" \
      --role-name "${role_name}" \
      --role-only \
      --attach-policy-arn "${policy_arn}" \
      --approve
  fi

  role_arn="$(aws iam get-role --role-name "${role_name}" --query 'Role.Arn' --output text)"

  if aws eks describe-addon \
    --region "${AWS_REGION}" \
    --cluster-name "${MGMT_CLUSTER}" \
    --addon-name aws-ebs-csi-driver >/dev/null 2>&1; then
    log "EBS CSI addon already exists"
  else
    log "creating EBS CSI addon"
    aws eks create-addon \
      --region "${AWS_REGION}" \
      --cluster-name "${MGMT_CLUSTER}" \
      --addon-name aws-ebs-csi-driver \
      --service-account-role-arn "${role_arn}" >/dev/null
  fi

  aws eks wait addon-active \
    --region "${AWS_REGION}" \
    --cluster-name "${MGMT_CLUSTER}" \
    --addon-name aws-ebs-csi-driver
}

ensure_default_storage_class() {
  log "ensuring gp3 default StorageClass"
  while IFS= read -r storage_class; do
    [[ -n "${storage_class}" ]] || continue
    kubectl --context "${MGMT_CLUSTER}" annotate --overwrite \
      "${storage_class}" storageclass.kubernetes.io/is-default-class=false >/dev/null 2>&1 || true
  done < <(kubectl --context "${MGMT_CLUSTER}" get storageclass -o name 2>/dev/null || true)

  cat <<'YAML' | kubectl --context "${MGMT_CLUSTER}" apply -f -
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-gp3
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  type: gp3
  encrypted: "true"
YAML
}

create_management_runtime() {
  local context="${MGMT_CLUSTER}"
  local pgbouncer_hash

  kubectl --context "${context}" apply -f "${ROOT_DIR}/deploy/management/namespace.yaml"

  if [[ -z "${POSTGRES_PASSWORD}" ]]; then
    POSTGRES_PASSWORD="$(existing_secret_value "${context}" postgresql-secret POSTGRES_PASSWORD)"
  fi
  if [[ -z "${POSTGRES_PASSWORD}" ]]; then
    POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  fi
  if [[ -z "${DATABASE_URL}" ]]; then
    DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@pgbouncer:6432/${POSTGRES_DB}"
  fi

  if [[ -z "${MINIO_ROOT_PASSWORD}" ]]; then
    MINIO_ROOT_PASSWORD="$(existing_secret_value "${context}" minio-secret MINIO_ROOT_PASSWORD)"
  fi
  if [[ -z "${MINIO_ROOT_PASSWORD}" ]]; then
    MINIO_ROOT_PASSWORD="$(openssl rand -hex 32)"
  fi

  if [[ -z "${GITHUB_WEBHOOK_SECRET}" ]]; then
    GITHUB_WEBHOOK_SECRET="$(existing_secret_value "${context}" management-runtime-secret GITHUB_WEBHOOK_SECRET)"
  fi
  if [[ -z "${GITHUB_WEBHOOK_SECRET}" ]]; then
    GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
  fi

  for key in \
    LLM_API_KEY \
    OPENAI_API_KEY \
    OPENAI_COMPATIBLE_API_KEY \
    ANTHROPIC_API_KEY \
    GEMINI_API_KEY \
    GOOGLE_API_KEY; do
    if [[ -z "${!key}" ]]; then
      printf -v "${key}" "%s" "$(existing_secret_value "${context}" management-runtime-secret "${key}")"
    fi
  done

  kubectl --context "${context}" -n management create secret generic postgresql-secret \
    --from-literal=POSTGRES_USER="${POSTGRES_USER}" \
    --from-literal=POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
    --from-literal=POSTGRES_DB="${POSTGRES_DB}" \
    --dry-run=client -o yaml | kubectl --context "${context}" apply -f -

  kubectl --context "${context}" -n management create secret generic minio-secret \
    --from-literal=MINIO_ROOT_USER="${MINIO_ROOT_USER}" \
    --from-literal=MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD}" \
    --dry-run=client -o yaml | kubectl --context "${context}" apply -f -

  pgbouncer_hash="$(pgbouncer_auth_hash)"
  cat >"${RUNTIME_DIR}/pgbouncer.ini" <<EOF
[databases]
${POSTGRES_DB} = host=postgresql port=5432 dbname=${POSTGRES_DB} user=${POSTGRES_USER} password=${POSTGRES_PASSWORD}

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = md5
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction
max_client_conn = 1000
default_pool_size = 25
reserve_pool_size = 5
reserve_pool_timeout = 3
server_idle_timeout = 60
pidfile = /tmp/pgbouncer.pid
logfile =
unix_socket_dir = /tmp
ignore_startup_parameters = extra_float_digits,options
EOF
  printf '"%s" "%s"\n' "${POSTGRES_USER}" "${pgbouncer_hash}" >"${RUNTIME_DIR}/userlist.txt"

  kubectl --context "${context}" -n management create secret generic pgbouncer-config \
    --from-file=pgbouncer.ini="${RUNTIME_DIR}/pgbouncer.ini" \
    --from-file=userlist.txt="${RUNTIME_DIR}/userlist.txt" \
    --dry-run=client -o yaml | kubectl --context "${context}" apply -f -

  kubectl --context "${context}" -n management create configmap management-runtime-config \
    --from-literal=NATS_URL="${NATS_URL}" \
    --from-literal=REDIS_URL="${REDIS_URL}" \
    --from-literal=MANAGEMENT_BASE_URL="http://api-gateway:8000" \
    --from-literal=GITHUB_REPO="${GITHUB_REPO}" \
    --from-literal=GITHUB_BRANCH="${GITHUB_BRANCH}" \
    --from-literal=MANIFEST_PATH="${MANIFEST_PATH}" \
    --from-literal=GITOPS_WEBHOOK_IMAGE="${IMAGE_NAME}" \
    --from-literal=GITHUB_API_BASE="${GITHUB_API_BASE}" \
    --from-literal=GIT_MANIFEST_SOURCE_MODE="${GIT_MANIFEST_SOURCE_MODE}" \
    --from-literal=GIT_LOCAL_MANIFEST_ENABLED="${GIT_LOCAL_MANIFEST_ENABLED}" \
    --from-literal=GIT_CHECKOUT_CACHE_ENABLED="${GIT_CHECKOUT_CACHE_ENABLED}" \
    --from-literal=GIT_CHECKOUT_CACHE_REQUIRED="${GIT_CHECKOUT_CACHE_REQUIRED}" \
    --from-literal=GIT_CACHE_MAX_REPOS="${GIT_CACHE_MAX_REPOS}" \
    --from-literal=GIT_CACHE_MAX_BYTES="${GIT_CACHE_MAX_BYTES}" \
    --from-literal=GIT_REMOTE_MANIFEST_ENABLED="${GIT_REMOTE_MANIFEST_ENABLED}" \
    --from-literal=GIT_REMOTE_MANIFEST_REQUIRED="${GIT_REMOTE_MANIFEST_REQUIRED}" \
    --from-literal=GITOPS_REQUIRE_APPROVED_SNAPSHOT="${GITOPS_REQUIRE_APPROVED_SNAPSHOT}" \
    --from-literal=GITHUB_MANIFEST_TIMEOUT_SECONDS="${GITHUB_MANIFEST_TIMEOUT_SECONDS}" \
    --from-literal=COMMAND_JANITOR_INTERVAL_SECONDS="${COMMAND_JANITOR_INTERVAL_SECONDS}" \
    --from-literal=SCM_PROVIDER="${SCM_PROVIDER}" \
    --from-literal=SCM_REPO="${SCM_REPO}" \
    --from-literal=SCM_BASE_BRANCH="${SCM_BASE_BRANCH}" \
    --from-literal=LLM_PROVIDER="${LLM_PROVIDER}" \
    --from-literal=LLM_MODEL="${LLM_MODEL}" \
    --from-literal=LLM_BASE_URL="${LLM_BASE_URL}" \
    --from-literal=LLM_TIMEOUT_SECONDS="${LLM_TIMEOUT_SECONDS}" \
    --from-literal=LLM_MAX_RETRIES="${LLM_MAX_RETRIES}" \
    --from-literal=LLM_MAX_TOKENS="${LLM_MAX_TOKENS}" \
    --from-literal=OPENAI_BASE_URL="${OPENAI_BASE_URL}" \
    --from-literal=OPENAI_MODEL="${OPENAI_MODEL}" \
    --from-literal=OPENAI_COMPATIBLE_BASE_URL="${OPENAI_COMPATIBLE_BASE_URL}" \
    --from-literal=OPENAI_COMPATIBLE_MODEL="${OPENAI_COMPATIBLE_MODEL}" \
    --from-literal=ANTHROPIC_BASE_URL="${ANTHROPIC_BASE_URL}" \
    --from-literal=ANTHROPIC_MODEL="${ANTHROPIC_MODEL}" \
    --from-literal=ANTHROPIC_VERSION="${ANTHROPIC_VERSION}" \
    --from-literal=GEMINI_BASE_URL="${GEMINI_BASE_URL}" \
    --from-literal=GEMINI_MODEL="${GEMINI_MODEL}" \
    --dry-run=client -o yaml | kubectl --context "${context}" apply -f -

  local secret_args=(
    --from-literal=DATABASE_URL="${DATABASE_URL}"
    --from-literal=GITHUB_WEBHOOK_SECRET="${GITHUB_WEBHOOK_SECRET}"
  )
  if valid_github_token "${GITHUB_TOKEN}"; then
    secret_args+=(--from-literal=GITHUB_TOKEN="${GITHUB_TOKEN}")
  fi
  for key in \
    LLM_API_KEY \
    OPENAI_API_KEY \
    OPENAI_COMPATIBLE_API_KEY \
    ANTHROPIC_API_KEY \
    GEMINI_API_KEY \
    GOOGLE_API_KEY; do
    if [[ -n "${!key}" ]]; then
      secret_args+=(--from-literal="${key}=${!key}")
    fi
  done

  kubectl --context "${context}" -n management create secret generic management-runtime-secret \
    "${secret_args[@]}" \
    --dry-run=client -o yaml | kubectl --context "${context}" apply -f -
}

apply_management_plane() {
  local overlay="${RUNTIME_DIR}/management-kustomization"
  local image_repo="${IMAGE_NAME%:*}"
  local image_tag="${IMAGE_NAME##*:}"

  mkdir -p "${overlay}"
  cat >"${overlay}/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../deploy/management
images:
  - name: kubeheal-service
    newName: ${image_repo}
    newTag: ${image_tag}
EOF

  log "applying management plane"
  kubectl --context "${MGMT_CLUSTER}" apply -k "${overlay}"

  log "restarting management deployments"
  kubectl --context "${MGMT_CLUSTER}" -n management rollout restart deployment >/dev/null

  log "waiting for management rollouts"
  while IFS= read -r resource; do
    [[ -n "${resource}" ]] || continue
    kubectl --context "${MGMT_CLUSTER}" -n management rollout status "${resource}" --timeout=300s
  done < <(kubectl --context "${MGMT_CLUSTER}" -n management get statefulset,deploy -o name)

  log "exposing api-gateway with LoadBalancer"
  kubectl --context "${MGMT_CLUSTER}" -n management patch svc api-gateway --type merge \
    -p '{"spec":{"type":"LoadBalancer","ports":[{"name":"http","port":8000,"targetPort":"http","protocol":"TCP"},{"name":"public-http","port":80,"targetPort":"http","protocol":"TCP"}]}}' >/dev/null
}

gateway_load_balancer_host() {
  local host=""
  for _ in $(seq 1 90); do
    host="$(
      kubectl --context "${MGMT_CLUSTER}" -n management get svc api-gateway \
        -o jsonpath='{.status.loadBalancer.ingress[0].hostname}{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true
    )"
    if [[ -n "${host}" ]] && {
      [[ "${SKIP_LB_HEALTH_WAIT}" == "1" ]] \
        || curl -fsS "http://${host}/healthz" >/dev/null 2>&1
    }; then
      printf '%s\n' "${host}"
      return
    fi
    sleep 10
  done
  echo "api-gateway LoadBalancer did not become reachable" >&2
  return 1
}

configure_route53_record() {
  local lb_host="$1"
  require_domain_config "Route53" "${CUSTOM_DOMAIN}" "${ROUTE53_ZONE_NAME}"
  local record_name="${CUSTOM_DOMAIN%.}."
  local zone_name="${ROUTE53_ZONE_NAME%.}."
  local zone_id
  local change_id
  local change_batch="${RUNTIME_DIR}/route53-change.json"

  zone_id="$(
    aws route53 list-hosted-zones-by-name \
      --dns-name "${zone_name}" \
      --query "HostedZones[?Name=='${zone_name}'].Id | [0]" \
      --output text
  )"
  if [[ -z "${zone_id}" || "${zone_id}" == "None" ]]; then
    echo "Route53 hosted zone not found for ${zone_name}; skipping ${record_name}" >&2
    return 0
  fi
  zone_id="${zone_id##*/}"

  cat >"${change_batch}" <<JSON
{
  "Comment": "Point ${record_name} to ${MGMT_CLUSTER} api-gateway",
  "Changes": [
    {
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "${record_name}",
        "Type": "CNAME",
        "TTL": 60,
        "ResourceRecords": [
          {
            "Value": "${lb_host}"
          }
        ]
      }
    }
  ]
}
JSON

  log "upserting Route53 record ${record_name} -> ${lb_host}"
  change_id="$(
    aws route53 change-resource-record-sets \
      --hosted-zone-id "${zone_id}" \
      --change-batch "file://${change_batch}" \
      --query 'ChangeInfo.Id' \
      --output text
  )"
  aws route53 wait resource-record-sets-changed --id "${change_id}" || true
  CUSTOM_DOMAIN_CONFIGURED="1"
}

cloudflare_zone_id() {
  if [[ -n "${CLOUDFLARE_ZONE_ID}" ]]; then
    printf '%s\n' "${CLOUDFLARE_ZONE_ID}"
    return
  fi
  CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" \
  CLOUDFLARE_ZONE_NAME="${CLOUDFLARE_ZONE_NAME}" \
  python3 - <<'PY'
from __future__ import annotations

import json
import os
import urllib.request

token = os.environ["CLOUDFLARE_API_TOKEN"]
zone_name = os.environ["CLOUDFLARE_ZONE_NAME"]
request = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/zones?name={zone_name}",
    headers={"Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(request, timeout=20) as response:
    payload = json.load(response)
for zone in payload.get("result", []):
    if zone.get("name") == zone_name:
        print(zone["id"])
        break
PY
}

configure_cloudflare_record() {
  local lb_host="$1"
  local zone_id
  local record_id
  local body_file="${RUNTIME_DIR}/cloudflare-record.json"

  require_domain_config "Cloudflare" "${CUSTOM_DOMAIN}" "${CLOUDFLARE_ZONE_NAME}"

  if [[ -z "${CLOUDFLARE_API_TOKEN}" ]]; then
    log "Cloudflare API token is not set; skipping ${CUSTOM_DOMAIN}"
    return 0
  fi

  zone_id="$(cloudflare_zone_id)"
  if [[ -z "${zone_id}" ]]; then
    echo "Cloudflare zone not found for ${CLOUDFLARE_ZONE_NAME}; skipping ${CUSTOM_DOMAIN}" >&2
    return 0
  fi

  record_id="$(
    CLOUDFLARE_API_TOKEN="${CLOUDFLARE_API_TOKEN}" \
    CUSTOM_DOMAIN="${CUSTOM_DOMAIN}" \
    CF_ZONE_ID="${zone_id}" \
    python3 - <<'PY'
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request

token = os.environ["CLOUDFLARE_API_TOKEN"]
zone_id = os.environ["CF_ZONE_ID"]
name = urllib.parse.quote(os.environ["CUSTOM_DOMAIN"])
request = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records?type=CNAME&name={name}",
    headers={"Authorization": f"Bearer {token}"},
)
with urllib.request.urlopen(request, timeout=20) as response:
    payload = json.load(response)
records = payload.get("result", [])
print(records[0]["id"] if records else "")
PY
  )"

  cat >"${body_file}" <<JSON
{
  "type": "CNAME",
  "name": "${CUSTOM_DOMAIN}",
  "content": "${lb_host}",
  "ttl": 60,
  "proxied": false,
  "comment": "${PROJECT_SLUG} api-gateway"
}
JSON

  if [[ -n "${record_id}" ]]; then
    log "updating Cloudflare record ${CUSTOM_DOMAIN} -> ${lb_host}"
    curl -fsS -X PUT \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data @"${body_file}" \
      "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${record_id}" >/dev/null
  else
    log "creating Cloudflare record ${CUSTOM_DOMAIN} -> ${lb_host}"
    curl -fsS -X POST \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data @"${body_file}" \
      "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records" >/dev/null
  fi
  CUSTOM_DOMAIN_CONFIGURED="1"
}

custom_domain_base_url() {
  if [[ "${CONFIGURE_ROUTE53}" != "1" && "${CONFIGURE_CLOUDFLARE}" != "1" ]]; then
    return 1
  fi
  for _ in $(seq 1 30); do
    if curl -fsS "http://${CUSTOM_DOMAIN}/healthz" >/dev/null 2>&1; then
      printf 'http://%s\n' "${CUSTOM_DOMAIN}"
      return
    fi
    sleep 10
  done
  return 1
}

bootstrap_admin() {
  log "bootstrapping admin account: ${AUTH_EMAIL}"
  kubectl --context "${MGMT_CLUSTER}" -n management port-forward svc/postgresql 15432:5432 >/dev/null 2>&1 &
  PORT_FORWARD_PID="$!"
  sleep 5

  BOOTSTRAP_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:15432/${POSTGRES_DB}" \
  AUTH_EMAIL="${AUTH_EMAIL}" \
  AUTH_PASSWORD="${AUTH_PASSWORD}" \
  PROJECT_SLUG="${PROJECT_SLUG}" \
  uv run python - <<'PY'
from __future__ import annotations

import base64
import hashlib
import os
import secrets
import uuid

import psycopg

PASSWORD_HASH_ITERATIONS = 260000


def encode_token(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PASSWORD_HASH_ITERATIONS,
    )
    return (
        f"pbkdf2_sha256${PASSWORD_HASH_ITERATIONS}"
        f"${encode_token(salt)}"
        f"${encode_token(digest)}"
    )


email = os.environ["AUTH_EMAIL"].strip().lower()
password_hash = hash_password(os.environ["AUTH_PASSWORD"])
project_slug = os.environ["PROJECT_SLUG"]
user_id = "user-" + str(uuid.uuid5(uuid.NAMESPACE_URL, f"{project_slug}:{email}"))

with psycopg.connect(os.environ["BOOTSTRAP_DATABASE_URL"]) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            insert into workspaces (workspace_id, name, slug, status, updated_at)
            values ('default', 'Default Workspace', 'default', 'active', now())
            on conflict (workspace_id)
            do update set status = 'active', updated_at = now()
            """
        )
        cur.execute(
            """
            insert into user_accounts
              (user_id, email, password_hash, display_name, status, role, updated_at)
            values
              (%s, %s, %s, %s, 'active', 'admin', now())
            on conflict (email)
            do update set
              password_hash = excluded.password_hash,
              status = 'active',
              role = 'admin',
              updated_at = now()
            returning user_id
            """,
            (user_id, email, password_hash, email.split("@", 1)[0]),
        )
        stored_user_id = cur.fetchone()[0]
        cur.execute(
            """
            insert into workspace_members
              (workspace_id, user_id, role, permissions, status, updated_at)
            values
              ('default', %s, 'owner', '{"target":["register","install"]}'::jsonb, 'active', now())
            on conflict (workspace_id, user_id)
            do update set
              role = 'owner',
              permissions = excluded.permissions,
              status = 'active',
              updated_at = now()
            """,
            (stored_user_id,),
        )
PY

  kill "${PORT_FORWARD_PID}" >/dev/null 2>&1 || true
  PORT_FORWARD_PID=""
}

register_target() {
  local context="$1"
  local cluster_id="$2"
  local display_name="$3"
  local base_url="$4"

  log "registering target ${display_name} (${context})"
  BASE_URL="${base_url}" \
  MANAGEMENT_BASE_URL="${base_url}" \
  TARGET_CONTEXT="${context}" \
  TARGET_CLUSTER_ID="${cluster_id}" \
  TARGET_NAME="${display_name}" \
  TARGET_ENVIRONMENT="aws-test" \
  PROMETHEUS_BASE_URL="${PROMETHEUS_BASE_URL}" \
  LOKI_BASE_URL="${LOKI_BASE_URL}" \
  EVIDENCE_INTERVAL_SECONDS="${EVIDENCE_INTERVAL_SECONDS}" \
  IMAGE_NAME="${IMAGE_NAME}" \
  INSTALL_NODE_COLLECTOR="${INSTALL_NODE_COLLECTOR}" \
  AUTH_EMAIL="${AUTH_EMAIL}" \
  AUTH_PASSWORD="${AUTH_PASSWORD}" \
  bash "${ROOT_DIR}/scripts/register-target.sh"
}

basic_status() {
  local base_url="$1"
  log "management pods"
  kubectl --context "${MGMT_CLUSTER}" -n management get pods -o wide
  log "${TARGET_1_DISPLAY_NAME} target pods"
  kubectl --context "${TARGET_CLUSTER_1}" -n target get pods -o wide
  log "${TARGET_2_DISPLAY_NAME} target pods"
  kubectl --context "${TARGET_CLUSTER_2}" -n target get pods -o wide
  log "gateway health"
  if ! curl -fsS "${base_url}/healthz"; then
    echo "gateway health check failed from this machine; verify DNS propagation for ${base_url}" >&2
  fi
  echo
}

run_smoke_if_requested() {
  local base_url="$1"
  if [[ "${RUN_SMOKE}" != "1" ]]; then
    log "skipping smoke test (set RUN_SMOKE=1 to run scripts/smoke.sh)"
    return
  fi
  BASE_URL="${base_url}" \
  MGMT_CONTEXT="${MGMT_CLUSTER}" \
  SMOKE_IMAGE="${IMAGE_NAME}" \
  GITHUB_REPO="${GITHUB_REPO}" \
  GITHUB_BRANCH="${GITHUB_BRANCH}" \
  MANIFEST_PATH="${MANIFEST_PATH}" \
  GITHUB_API_BASE="${GITHUB_API_BASE}" \
  GITHUB_TOKEN="${GITHUB_TOKEN}" \
  AUTH_EMAIL="${AUTH_EMAIL}" \
  AUTH_PASSWORD="${AUTH_PASSWORD}" \
  bash "${ROOT_DIR}/scripts/smoke.sh"
}

main() {
  local account_id
  local base_url
  local lb_host

  account_id="$(aws_account_id)"
  log "using AWS account ${account_id}, region ${AWS_REGION}"

  ensure_ecr_image "${account_id}"

  if [[ "${CREATE_CLUSTERS}" == "1" ]]; then
    ensure_cluster "${MGMT_CLUSTER}" "${MGMT_DISPLAY_NAME}" "${MGMT_NODE_TYPE}" "${MGMT_NODES}" "management"
    ensure_cluster "${TARGET_CLUSTER_1}" "${TARGET_1_DISPLAY_NAME}" "${TARGET_NODE_TYPE}" "${TARGET_NODES}" "target"
    ensure_cluster "${TARGET_CLUSTER_2}" "${TARGET_2_DISPLAY_NAME}" "${TARGET_NODE_TYPE}" "${TARGET_NODES}" "target"
  else
    log "using existing EKS clusters"
    configure_existing_cluster_context "${MGMT_CLUSTER}"
    configure_existing_cluster_context "${TARGET_CLUSTER_1}"
    configure_existing_cluster_context "${TARGET_CLUSTER_2}"
  fi

  if [[ "${ENSURE_EBS_CSI}" == "1" ]]; then
    ensure_ebs_csi
    ensure_default_storage_class
  else
    log "skipping EBS CSI setup"
  fi
  create_management_runtime
  apply_management_plane
  lb_host="$(gateway_load_balancer_host)"
  base_url="http://${lb_host}"
  if [[ "${CONFIGURE_ROUTE53}" == "1" ]]; then
    configure_route53_record "${lb_host}"
  fi
  if [[ "${CONFIGURE_CLOUDFLARE}" == "1" ]]; then
    configure_cloudflare_record "${lb_host}"
  fi
  if [[ "${CUSTOM_DOMAIN_CONFIGURED}" == "1" ]]; then
    if domain_url="$(custom_domain_base_url)"; then
      base_url="${domain_url}"
    else
      log "custom domain not reachable yet; continuing with ${base_url}"
    fi
  else
    log "skipping Route53 custom domain setup"
  fi
  if [[ "${BOOTSTRAP_ADMIN}" == "1" ]]; then
    bootstrap_admin
  else
    log "skipping admin bootstrap"
  fi

  if [[ "${REGISTER_TARGETS}" == "1" ]]; then
    register_target "${TARGET_CLUSTER_1}" "${TARGET_CLUSTER_ID_1}" "${TARGET_1_DISPLAY_NAME}" "${base_url}"
    register_target "${TARGET_CLUSTER_2}" "${TARGET_CLUSTER_ID_2}" "${TARGET_2_DISPLAY_NAME}" "${base_url}"
  else
    log "skipping target registration"
  fi

  basic_status "${base_url}"
  run_smoke_if_requested "${base_url}"

  echo
  echo "AWS setup is ready."
  echo "Gateway: ${base_url}"
  if [[ "${CUSTOM_DOMAIN_CONFIGURED}" == "1" ]]; then
    echo "Custom domain: http://${CUSTOM_DOMAIN}"
  fi
  echo "Management cluster: ${MGMT_CLUSTER} (${MGMT_DISPLAY_NAME})"
  echo "Target 1: ${TARGET_CLUSTER_1} (${TARGET_1_DISPLAY_NAME})"
  echo "Target 2: ${TARGET_CLUSTER_2} (${TARGET_2_DISPLAY_NAME})"
  echo "Admin email: ${AUTH_EMAIL}"
  if [[ "${GENERATED_AUTH_PASSWORD}" == "1" ]]; then
    if [[ "${PRINT_GENERATED_ADMIN_PASSWORD}" == "1" ]]; then
      echo "Generated admin password: ${AUTH_PASSWORD}"
    else
      echo "Generated admin password: hidden; set PRINT_GENERATED_ADMIN_PASSWORD=1 for local debug output"
    fi
  else
    echo "Admin password: provided through AUTH_PASSWORD"
  fi
}

main "$@"
