#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5175}"
BACKEND_ORIGIN="${BACKEND_ORIGIN:-https://k8s.woonyong.org}"

if [[ "${BACKEND_ORIGIN}" != https://* ]]; then
  echo "BACKEND_ORIGIN must use https: ${BACKEND_ORIGIN}" >&2
  exit 2
fi

curl --max-time 8 --fail --silent --show-error \
  "${BACKEND_ORIGIN%/}/api/healthz" >/dev/null

export VITE_BACKEND_ORIGIN="${BACKEND_ORIGIN%/}"
echo "Kyro dev frontend: http://${HOST}:${PORT}"
echo "Live backend: ${VITE_BACKEND_ORIGIN}"

cd "${ROOT_DIR}/frontend"
exec npm exec -- vite \
  --host "${HOST}" \
  --port "${PORT}" \
  --strictPort
