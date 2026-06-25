#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-service:local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build -f "${ROOT_DIR}/services/Dockerfile" -t "${IMAGE_NAME}" "${ROOT_DIR}"
