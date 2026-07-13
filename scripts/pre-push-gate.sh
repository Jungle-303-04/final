#!/usr/bin/env bash
set -euo pipefail

# pre-commit은 hook 실행 중 부모 저장소의 GIT_INDEX_FILE 등 로컬 환경을 주입한다.
# 전체 게이트의 테스트가 만드는 임시 Git 저장소로 이 값이 새지 않도록 제거한다.
while IFS= read -r variable; do
  unset "${variable}"
done < <(git rev-parse --local-env-vars)

# 외부 Git template이 임시 저장소에 hook을 복제해도 config 부재는 테스트 실패가 아니다.
export PRE_COMMIT_ALLOW_NO_CONFIG=1

if (( $# == 0 )); then
  set -- make gate-fast
fi
exec "$@"
