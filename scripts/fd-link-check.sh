#!/usr/bin/env bash
# docs/fd 마크다운 상대 링크 무결성 검사 — 대상 파일 존재 여부
set -euo pipefail
cd "$(dirname "$0")/.."
status=0
while IFS=: read -r file link; do
  target="${link%%#*}"
  [ -z "$target" ] && continue
  case "$target" in
    http*|/*) continue ;;
  esac
  if [ ! -e "$(dirname "$file")/$target" ]; then
    echo "깨진 링크: $file → $link"
    status=1
  fi
done < <(grep -RhoE '' /dev/null; grep -RnoE '\]\([^)]+\.md(#[^)]*)?\)' docs/fd --include='*.md' \
  | sed -E 's/^([^:]+):[0-9]+:\]\(([^)]*)\)$/\1:\2/')
if [ "$status" -eq 0 ]; then
  echo "docs/fd 링크 무결성 통과"
fi
exit "$status"
