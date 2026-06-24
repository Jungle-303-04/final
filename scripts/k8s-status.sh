#!/usr/bin/env bash
set -euo pipefail

CLUSTER_NAME="${CLUSTER_NAME:-final-kubernetes}"
kubectl config use-context "kind-${CLUSTER_NAME}" >/dev/null 2>&1 || true

echo "==> Context"
kubectl config current-context 2>/dev/null || true

echo
echo "==> Pods"
kubectl -n final-app get deploy,svc,pod -o wide 2>/dev/null || true

cat <<EOF

URLs:
- API: http://localhost:18090
- Docs: http://localhost:18090/docs
- Health: http://localhost:18090/healthz
EOF
