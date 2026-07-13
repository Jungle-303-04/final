#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${DEMO_CLUSTER_NAME:-kubeheal-demo}"
NAMESPACE="${DEMO_NAMESPACE:-kubeheal-demo}"
WORKLOAD="${DEMO_WORKLOAD:-checkout-api}"
GOOD_IMAGE="${DEMO_GOOD_IMAGE:-nginx:1.27-alpine}"
BAD_IMAGE="${DEMO_BAD_IMAGE:-nginx:0.0.0-kubeheal-demo-missing}"
ARTIFACT_DIR="${DEMO_ARTIFACT_DIR:-.demo-artifacts}"
DRY_RUN="${DEMO_DRY_RUN:-0}"
KEEP_CLUSTER="${DEMO_KEEP_CLUSTER:-0}"

scene() {
  echo "[demo] $1"
}

if [[ "${DRY_RUN}" == "1" ]]; then
  scene "kind-cluster-ready"
  scene "bad-rollout-observed"
  scene "mock-rollback-pr-created"
  scene "workload-normalized"
  exit 0
fi

for command in kind kubectl docker; do
  command -v "${command}" >/dev/null || {
    echo "missing required command: ${command}" >&2
    exit 1
  }
done
docker info >/dev/null

cleanup() {
  if [[ "${KEEP_CLUSTER}" != "1" ]]; then
    kind delete cluster --name "${CLUSTER_NAME}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if ! kind get clusters | grep -Fxq "${CLUSTER_NAME}"; then
  kind create cluster --name "${CLUSTER_NAME}" --wait 120s
fi
kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null
scene "kind-cluster-ready"

kubectl create namespace "${NAMESPACE}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "${NAMESPACE}" create deployment "${WORKLOAD}" \
  --image="${GOOD_IMAGE}" --replicas=1 --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n "${NAMESPACE}" rollout status "deployment/${WORKLOAD}" --timeout=180s >/dev/null

kubectl -n "${NAMESPACE}" set image \
  "deployment/${WORKLOAD}" "${WORKLOAD}=${BAD_IMAGE}" >/dev/null
if kubectl -n "${NAMESPACE}" rollout status "deployment/${WORKLOAD}" --timeout=15s >/dev/null 2>&1; then
  echo "bad rollout unexpectedly became ready" >&2
  exit 1
fi
scene "bad-rollout-observed"

mkdir -p "${ARTIFACT_DIR}"
printf '%s\n' \
  '# Mock rollback PR: restore verified image' \
  '' \
  '| Verification | Result |' \
  '|---|---|' \
  '| Cause | bad image rollout |' \
  '| Rule verified | yes |' \
  "| Failed revision | ${BAD_IMAGE} |" \
  "| Normal revision | ${GOOD_IMAGE} |" \
  '| Patch scope | Deployment container image only |' \
  '| Base SHA / digest | local Kind demo fixture |' \
  '| Policy violations | 0 |' \
  '| Blast radius | one Deployment in demo namespace |' \
  '| Rollback | restore previous image |' \
  '| Post-verification | rollout ready |' \
  >"${ARTIFACT_DIR}/rollback-pr.md"
printf '%s\n' \
  'spec:' \
  '  template:' \
  '    spec:' \
  '      containers:' \
  "        - name: ${WORKLOAD}" \
  "          image: ${GOOD_IMAGE}" \
  >"${ARTIFACT_DIR}/rollback.patch.yaml"
scene "mock-rollback-pr-created"

kubectl -n "${NAMESPACE}" set image \
  "deployment/${WORKLOAD}" "${WORKLOAD}=${GOOD_IMAGE}" >/dev/null
kubectl -n "${NAMESPACE}" rollout status "deployment/${WORKLOAD}" --timeout=180s >/dev/null
ready="$(kubectl -n "${NAMESPACE}" get deployment "${WORKLOAD}" -o jsonpath='{.status.readyReplicas}')"
if [[ "${ready}" != "1" ]]; then
  echo "workload did not normalize: readyReplicas=${ready:-0}" >&2
  exit 1
fi
scene "workload-normalized"
echo "[demo] artifacts=${ARTIFACT_DIR}"
