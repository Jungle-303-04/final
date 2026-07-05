#!/usr/bin/env bash
# README 구조 블록 ↔ 실제 src/services 트리 드리프트 검사.
# 서비스 추가/삭제 시 README 미갱신이면 CI 실패.
set -euo pipefail
cd "$(dirname "$0")/.."

# entrypoint(app.py) 없는 라이브러리 폴더 — README에는 있어도 find에는 안 잡힘
NO_ENTRYPOINT_ALLOWLIST="ai/agent"

actual=$(find src/services -mindepth 3 -maxdepth 3 -name app.py \
  | sed 's|^src/services/||; s|/app.py$||' | sort)

listed=$(awk '/^src\/services$/{flag=1; next} /^src\/domains$/{flag=0} flag' README.md \
  | sed 's/^  //; s/ .*//' | grep -v '^$' | sort)

status=0

while IFS= read -r svc; do
  if ! grep -qx "$svc" <<<"$listed"; then
    echo "README 누락: src/services/$svc (README 구조 블록에 추가 필요)"
    status=1
  fi
done <<<"$actual"

while IFS= read -r svc; do
  if grep -qx "$svc" <<<"$NO_ENTRYPOINT_ALLOWLIST"; then
    continue
  fi
  if ! grep -qx "$svc" <<<"$actual"; then
    echo "README 잔재: $svc 는 src/services 에 없음 (README에서 제거 필요)"
    status=1
  fi
done <<<"$listed"

if [ "$status" -eq 0 ]; then
  echo "README 구조와 src/services 트리 일치 ($(wc -l <<<"$actual" | tr -d ' ')개 서비스)"
fi
exit "$status"
