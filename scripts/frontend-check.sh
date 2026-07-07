#!/usr/bin/env bash
# 프론트엔드 배포 게이트 — 타입·린트·프로덕션 빌드가 전부 통과해야 한다.
# CI/CD 는 이 스크립트가 실패하면 배포를 거부한다(화면이 깨진 채 반영되는 사고 차단).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/frontend"

echo "[frontend-check] npm ci"
npm ci --include=dev --no-audit --no-fund

echo "[frontend-check] typecheck (tsc --noEmit)"
npx tsc --noEmit

echo "[frontend-check] eslint (경고 0 강제)"
npx eslint src/ --max-warnings 0

echo "[frontend-check] production build"
npx vite build --logLevel error

# 빌드 산출물 최소 무결성 — index.html 과 JS 번들이 실제로 존재해야 한다.
test -s dist/index.html
ls dist/assets/*.js >/dev/null

echo "[frontend-check] OK"
