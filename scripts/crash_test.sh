#!/usr/bin/env bash
# Outbox exactly-once crash test.
#
# Fires N webhooks and force-kills gitops workers mid-flight to trigger NATS
# redelivery. With the transactional outbox + ledger dedup, each webhook
# (correlation_id) must yield exactly one pull request despite the crashes.
#
# Requires: make up (cluster + gateway on 18080) running.
# Usage: bash scripts/crash_test.sh   (N defaults to 6, override via env)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:18080}"
CTX="${MGMT_CONTEXT:-kind-management}"
NS="${MGMT_NS:-management}"
N="${N:-6}"
POLL_TIMEOUT="${POLL_TIMEOUT:-300}"
KILL_APPS=(manifest-render-worker repo-gateway-worker)

log() { printf '%s [crash-test] %s\n' "$(date +%T)" "$*"; }

psql_q() {
  kubectl --context "$CTX" -n "$NS" exec statefulset/postgresql -- \
    env PGPASSWORD=service psql -U service -d service -tA -c "$1" 2>/dev/null | tr -d '[:space:]'
}

kill_workers() {
  for app in "${KILL_APPS[@]}"; do
    kubectl --context "$CTX" -n "$NS" delete pod -l "app=${app}" \
      --grace-period=0 --force >/dev/null 2>&1 || true
  done
}

wait_ready() {
  for app in "${KILL_APPS[@]}"; do
    log "waiting for ${app} to roll out"
    if ! kubectl --context "$CTX" -n "$NS" rollout status "deploy/${app}" --timeout=180s; then
      log "warning: ${app} rollout not confirmed within timeout, continuing to poll"
    fi
  done
}

log "starting crash test: ${N} webhooks, kill targets ${KILL_APPS[*]}"
corr_ids=()
for i in $(seq 1 "$N"); do
  resp="$(curl -fsS -X POST "${BASE_URL}/github/webhook" \
    -H "content-type: application/json" \
    -d "{\"commit_sha\":\"crash${i}\",\"image\":\"ghcr.io/project/checkout-api:crash${i}\",\"replicas\":2}")"
  cid="$(printf "%s" "$resp" | python3 -c 'import json,sys; print(json.load(sys.stdin)["correlation_id"])')"
  corr_ids+=("$cid")
  log "webhook ${i} accepted correlation_id=${cid}"
  if [ $((i % 3)) -eq 0 ]; then
    sleep 1
    kill_workers
    log "force-killed workers mid-flight: ${KILL_APPS[*]}"
  fi
done

log "waiting for crashed workers to become ready again"
wait_ready
log "workers ready, waiting for redelivery and reprocessing"

list="$(printf "'%s'," "${corr_ids[@]}")"
list="${list%,}"
count_sql="select count(*) from pull_requests where correlation_id in (${list})"
maxper_sql="select coalesce(max(c),0) from (select count(*) c from pull_requests where correlation_id in (${list}) group by correlation_id) t"

deadline=$(( $(date +%s) + POLL_TIMEOUT ))
total=0
maxper=0
while [ "$(date +%s)" -lt "$deadline" ]; do
  total="$(psql_q "$count_sql")"; total="${total:-0}"
  maxper="$(psql_q "$maxper_sql")"; maxper="${maxper:-0}"
  log "observed pull_requests=${total}/${N} max_per_correlation=${maxper}"
  [ "$maxper" -gt 1 ] && break
  [ "$total" -ge "$N" ] && break
  sleep 6
done

log "result total=${total} expected=${N} max_per_correlation=${maxper}"
if [ "$total" -eq "$N" ] && [ "$maxper" -eq 1 ]; then
  log "exactly-once verified: each webhook produced one pull request despite crashes"
  exit 0
fi
if [ "$maxper" -gt 1 ]; then
  log "failure: duplicate pull requests for a correlation_id, ledger dedup not effective"
else
  log "failure: observed ${total} pull requests, expected ${N} (possible loss or still recovering)"
fi
exit 1
