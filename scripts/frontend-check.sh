#!/usr/bin/env bash
# 프론트엔드 배포 게이트 — 디자인 시스템 가드·타입·린트·테스트·프로덕션 빌드가 전부 통과해야 한다.
# CI/CD 는 이 스크립트가 실패하면 배포를 거부한다(화면이 깨진 채 반영되는 사고 차단).
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}/frontend"

echo "[frontend-check] design-system guard"
feature_css_files="$(find src/features -type f -name '*.css' -print)"
if [[ -n "${feature_css_files}" ]]; then
  echo "feature 코드에 새 CSS 파일을 추가할 수 없습니다:" >&2
  printf '%s\n' "${feature_css_files}" >&2
  exit 1
fi

if rg -n --glob 'src/features/**/*.{ts,tsx}' 'style\s*=' src/features; then
  echo "feature 코드에서 inline style= 사용은 금지입니다. src/ui 프리미티브와 Tailwind semantic token을 사용하세요." >&2
  exit 1
fi

if rg -n --glob 'src/features/**/*.{ts,tsx}' '#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?([0-9a-fA-F]{2})?\b' src/features; then
  echo "feature 코드에서 raw hex 색상 사용은 금지입니다. src/ui/theme.css semantic token을 사용하세요." >&2
  exit 1
fi

echo "[frontend-check] npm ci"
npm ci --include=dev --no-audit --no-fund

echo "[frontend-check] typecheck (tsc --noEmit)"
npx tsc --noEmit

echo "[frontend-check] eslint (경고 0 강제)"
npx eslint src/ --max-warnings 0

echo "[frontend-check] unit tests"
npm test

echo "[frontend-check] production build"
npx vite build --logLevel error

# 빌드 산출물 최소 무결성 — index.html 과 JS 번들이 실제로 존재해야 한다.
test -s dist/index.html
ls dist/assets/*.js >/dev/null

echo "[frontend-check] OK"
