#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

MANAGEMENT_MANIFEST="${TMP_DIR}/management.yaml"
TARGET_MANIFEST="${TMP_DIR}/target.yaml"

kubectl kustomize "${ROOT_DIR}/deploy/management" > "${MANAGEMENT_MANIFEST}"
sed 's#__MANAGEMENT_BASE_URL__#http://api-gateway.management:8000#g' \
  "${ROOT_DIR}/deploy/target/target.yaml" > "${TARGET_MANIFEST}"

kubectl create --dry-run=client --validate=false \
  -f "${MANAGEMENT_MANIFEST}" -o name > "${TMP_DIR}/management.objects"
kubectl create --dry-run=client --validate=false \
  -f "${TARGET_MANIFEST}" -o name > "${TMP_DIR}/target.objects"

test -s "${TMP_DIR}/management.objects"
test -s "${TMP_DIR}/target.objects"

echo "management manifest objects: $(wc -l < "${TMP_DIR}/management.objects" | tr -d ' ')"
echo "target manifest objects: $(wc -l < "${TMP_DIR}/target.objects" | tr -d ' ')"
