#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-final-api:local}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

docker build -t "${IMAGE_NAME}" -f "${ROOT_DIR}/deploy/docker/Dockerfile" "${ROOT_DIR}"
