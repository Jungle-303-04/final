#!/usr/bin/env bash
# Outbox exactly-once 크래시 테스트.
#
# N 개의 webhook 을 쏘는 동안 gitops 워커 pod 를 강제로 죽여(크래시) NATS 재배달을
# 유발한다. 크래시·재배달에도 outbox+ledger 덕에 webhook(=correlation_id)당 PR 이
# "정확히 1개"여야 한다.
#
# 사전: make up (클러스터 + 게이트웨이 18080) 이 떠 있어야 함.
# 사용: bash scripts/crash_test.sh   (N=6 기본, 환경변수로 조절)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:18080}"
CTX="${MGMT_CONTEXT:-kind-management}"
NS="${MGMT_NS:-management}"
N="${N:-6}"
KILL_TARGETS=(manifest-render-worker diff-worker diff-analyze-worker repo-gateway-worker)

psql_q() {
  kubectl --context "$CTX" -n "$NS" exec statefulset/postgresql -- \
    env PGPASSWORD=service psql -U service -d service -tA -c "$1" 2>/dev/null | tr -d '[:space:]'
}

kill_workers() {
  for app in "${KILL_TARGETS[@]}"; do
    kubectl --context "$CTX" -n "$NS" delete pod -l "app=${app}" \
      --grace-period=0 --force >/dev/null 2>&1 || true
  done
}

echo "==> ${N} 개 webhook 발사 + 처리 중 워커 강제 종료(크래시 주입)"
corr_ids=()
for i in $(seq 1 "$N"); do
  resp="$(curl -fsS -X POST "${BASE_URL}/github/webhook" \
    -H "content-type: application/json" \
    -d "{\"commit_sha\":\"crash${i}\",\"image\":\"ghcr.io/project/checkout-api:crash${i}\",\"replicas\":2}")"
  cid="$(printf "%s" "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["correlation_id"])')"
  corr_ids+=("$cid")
  echo "  webhook ${i}: correlation_id=${cid}"
  # 절반은 발사 직후 워커를 죽여 in-flight 크래시를 노린다.
  if [ $((i % 2)) -eq 0 ]; then
    sleep 1
    kill_workers
    echo "  -> 워커 강제 종료(크래시)"
  fi
done

# correlation_id IN (...) 리스트
list="$(printf "'%s'," "${corr_ids[@]}")"
list="${list%,}"

echo "==> 재배달 + 안정화 대기 (PR 수가 멈출 때까지)"
last="-1"; stable=0
for _ in $(seq 1 36); do
  sleep 5
  cur="$(psql_q "select count(*) from pull_requests where correlation_id in (${list})")"
  cur="${cur:-0}"
  echo "  pr_count(this run)=${cur}"
  if [ "$cur" = "$last" ]; then stable=$((stable + 1)); else stable=0; fi
  last="$cur"
  [ "$stable" -ge 3 ] && break
done

total="$(psql_q "select count(*) from pull_requests where correlation_id in (${list})")"
maxper="$(psql_q "select coalesce(max(c),0) from (select count(*) c from pull_requests where correlation_id in (${list}) group by correlation_id) t")"
total="${total:-0}"; maxper="${maxper:-0}"

echo "==> 결과: webhook=${N}, 생성된 PR=${total}, correlation 당 최대 PR=${maxper}"
if [ "$total" -eq "$N" ] && [ "$maxper" -eq 1 ]; then
  echo "EXACTLY-ONCE OK ✅ — 크래시·재배달에도 webhook 당 PR 정확히 1개"
else
  echo "FAIL ❌ — PR 중복(>1) 또는 유실. total=${total}(기대 ${N}), maxper=${maxper}(기대 1)" >&2
  echo "    중복이면 outbox/ledger dedup 문제, 유실이면 트랜잭션/재배달 문제." >&2
  exit 1
fi
