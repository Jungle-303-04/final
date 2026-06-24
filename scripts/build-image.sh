#!/usr/bin/env bash
set -euo pipefail

IMAGE_NAME="${IMAGE_NAME:-final-api:local}"

docker build -t "${IMAGE_NAME}" .
