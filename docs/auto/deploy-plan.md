---
title: Opsia 백엔드 배포 계획 — migration-first 단계적 절차
status: p0-foundation-in-progress
date: 2026-07-14
owner: 백엔드 운영자
canonical: origin/dev
---

# Opsia 백엔드 배포 계획

## 1. 목적과 권한 경계

이 문서는 `origin/dev`의 백엔드 변경을 기존 management·target 클러스터에 적용하는
운영 절차다. 적용 순서는 **DB 마이그레이션 → 소비자·워커 → target agent → realtime
gateway → API gateway**로 고정한다. 모든 이미지와 증거는 전체 canonical SHA와 image
digest로 식별한다.

이 문서 작성은 배포 승인이 아니다. 실제 `docker push`, `kubectl apply`,
`alembic upgrade`, rollout, rollback은 backend pipeline J단계의 사람 GO 이후에만
실행한다. production DB에서 임의 `alembic stamp`, `alembic downgrade`, schema restore를
실행하지 않는다.

현재 stateful component와 대부분의 worker가 1 replica이고 worker strategy가
`Recreate`이므로 인프라 수준의 완전한 무중단을 보장할 수 없다. 이 계획은 API 2 replica
rolling update와 durable event backlog를 이용해 사용자 영향과 event 처리 공백을 줄인다.
J단계 승인자는 §3의 blocker와 §13의 단일 replica 위험을 명시적으로 수용하거나 해소해야
한다.

## 2. 이번 release의 변경 범위

서비스 이미지는 `src/services/Dockerfile` 하나를 공유한다. 따라서 특정 worker만 새
이미지로 바꾸면 공통 event envelope와 contract가 혼재한다. 아래 service-image workload
전체를 같은 digest로 수렴시킨다.

- 신규 workload: `change-correlation-worker`, `auto-revert-worker`.
- tenancy·projection 핵심: `outbox-relay`, `audit-worker`, `dashboard-worker`,
  `dead-letter-monitor`.
- GitOps·recovery 핵심: `workflow-controller`, `target-reconcile-worker`,
  `git-pull-worker`, `manifest-render-worker`, `diff-worker`, `diff-analyze-worker`,
  `safe-pr-worker`, `scm-worker`, `drift-worker`, `release-flow-worker`,
  `github-poll-worker`.
- command·RCA worker: `command-worker`, `command-janitor`, `rca-worker`,
  `rca-timeline-janitor`, `alert-worker`, `mail-worker`.
- AI worker: `ai-chat-worker`, `evidence-worker`, `incident-worker`, `plan-worker`,
  `analyze-worker`, `recovery-worker`, `select-worker`, `dispatch-worker`,
  `backlog-worker`, `ai-diff-worker`, `rollout-worker`, `approval-worker`,
  `ai-fallback-worker`, `rca-feedback-worker`.
- agent·gateway: management의 `cluster-agent`, 각 target의 `cluster-agent`,
  `realtime-gateway`, `api-gateway`.

`console`, `console-dev`, `agent-api-proxy`, `cloudflared`, PostgreSQL, PgBouncer, NATS,
Redis, MinIO는 backend service image 대상이 아니다. 이 release에서 해당 image나 stateful
manifest를 함께 변경하지 않는다. frontend image는 검증된 기존 digest를 유지한다.

DB revision 적용 범위는 단일 head `20260713_2350`까지다.

- `20260713_0140`: `audit_log.causation_id`,
  `ix_audit_log_correlation_id_created_at`.
- `20260713_0655`: outbox/audit workspace tenancy,
  `ix_audit_log_workspace_id_correlation_id_created_at`.
- `20260713_0750`: evidence workspace/correlation/cluster index.
- `20260713_0820`: change projection tables, `audit_log.event_created_at`, incident index.
- `20260713_2215`: inventory filter projection tables와 조회 인덱스.
- `20260713_2340`: Issues filter nullable projection columns.
- `20260713_2350`: Issues filter concurrent 조회·GIN 인덱스.

### 2.1 versioned migration 실행 기반의 안전 경계

서비스 이미지에는 Alembic runtime·`alembic.ini`·revision directory를 포함하고, image build가
단일 head `20260713_2350`을 검증한다. `deploy/management/migration-job.yaml`은 PgBouncer가
아닌 direct PostgreSQL URL을 사용하며, schema bootstrap과 같은 advisory lock을 session 범위로
획득한다.

이 Job은 `alembic_version`이 없거나 비어 있는 DB를 **절대 채택하지 않는다**. 현재 legacy AWS
DB처럼 `create_all`로 만들어진 unversioned schema는 Job을 AWS 적용 경로에 연결하기 전에 별도
baseline 전환을 완료해야 한다. `c704729c1b` 이미지가 당시 revision 파일을 포함했다는 사실은
DB가 해당 revision과 동등하다는 증거가 아니다. `create_all`은 migration-only index와 data
backfill을 보장하지 않기 때문이다.

문자 그대로 version marker 기록이 금지되는 정책에서는 기존 DB를 현재 lineage에 직접 연결하지
않는다. 완전한 versioned schema를 가진 새 DB를 만들고 data-only 이관·catalog/data invariant·
복구 rehearsal을 통과한 뒤 connection cutover한다. 임의 `alembic stamp`나 수동
`alembic_version` INSERT로 이 단계를 우회하지 않는다.

새 DB bootstrap은 `alembic/baselines/20260708_pre_alembic.sql`만 사용한다. 이 snapshot은
첫 revision 직전 commit `017b2485b2c408c2f7e928379ebf6541526d32ab`의 `Database.init()`을
PostgreSQL 17에서 schema-only로 추출했고 SHA-256을 코드에 고정했다. 대상 DB에 user table이
하나라도 있거나 source commit·empty-target 확인 문자열이 다르면 실행을 거부한다. 성공 경로는
snapshot 설치 후 `alembic upgrade head`이며 `stamp`를 호출하지 않는다.

```bash
# DBA가 만든 격리된 빈 target DB에만 실행한다. URL 값은 로그에 출력하지 않는다.
export BASELINE_TARGET_DATABASE_URL="<new-versioned-db-url>"
export BASELINE_CONFIRM_SOURCE_COMMIT="017b2485b2c408c2f7e928379ebf6541526d32ab"
export BASELINE_CONFIRM_EMPTY_TARGET="isolated-empty-database"
export MIGRATION_EXPECTED_HEAD="20260713_2350"
python -m packages.storage.baseline bootstrap
```

이 단계만으로 cutover하지 않는다. data-only 이관, 공통 컬럼 checksum·row count, FK·sequence,
catalog fingerprint, backup restore rehearsal과 DBA 승인이 다음 필수 단계다. bootstrap target은
그 검증 전까지 application secret과 migration Job에 연결하지 않는다.

## 3. J단계 진입 blocker

다음 항목 중 하나라도 남아 있으면 배포 명령을 실행하지 않는다.

1. GitHub Actions의 `dev` 최신 SHA가 green임을 증명하지 못했다.
2. integration smoke가 꺼져 있다. `scripts/aws-up.sh`의 `RUN_SMOKE` 기본값은 `0`이며,
   배포 승인에는 별도 `scripts/smoke.sh` 실행 계획과 credential이 필요하다.
3. live 환경에서 RemediationBundle API와 신규 audit/recent-change API가 배포·실측되지
   않았다. §11의 실제 fixture 200 응답이 필요하다.
4. DB의 `alembic_version`이 없거나 revision이 repository history와 일치하지 않는다.
   기존 AWS bootstrap은 `Database.init(); verify_schema()`이고 Alembic baseline을 만들지
   않으므로 이 경우 임의 stamp로 우회하지 않는다.
5. service image와 versioned-only migration Job은 준비됐지만 legacy DB의 안전한 baseline
   전환과 live rehearsal이 끝나지 않았다. Job은 이 조건에서 fail-closed하며 AWS 경로에 아직
   배선하지 않는다.
6. backup artifact와 이전 immutable image digest를 확보하지 못했다.
7. §13의 1-replica 위험에 대한 운영자 승인과 low-traffic window가 없다.
8. `deploy/management/services.yaml`의 base manifest는 `DEV_AUTH_BYPASS=1`이다.
   production에 raw manifest를 적용하지 않는다. §8의 overlay가 값을 `0`으로 강제하고,
   렌더 결과와 live Deployment가 모두 `0`임을 증명해야 한다.
9. 등록된 target context 전체를 열거하지 못했거나 target별 agent rollback image와
   outstanding command 상태를 확인하지 못했다. 일부 target만 새 protocol/image로 두는
   partial rollout은 허용하지 않는다.

## 4. release 변수와 증거 디렉터리

아래 값은 placeholder를 운영 환경 값으로 바꾼다. secret 값은 terminal 출력이나
night-log에 기록하지 않는다.

```bash
set -euo pipefail

export REPO_ROOT="/absolute/path/to/opsia"
cd "$REPO_ROOT"

git fetch origin
export DEPLOY_SHA="$(git rev-parse origin/dev)"
test "$(git rev-parse HEAD)" = "$DEPLOY_SHA"
test -z "$(git status --short)"

export MGMT_CONTEXT="<management-kube-context>"
export MGMT_NS="management"
export AWS_REGION="<region>"
export CURRENT_DEPLOY_SHA="<현재 live backend가 빌드된 origin/dev SHA>"
export ECR_REPOSITORY="opsia-service"
export SERVICE_IMAGE_REPO="<account>.dkr.ecr.<region>.amazonaws.com/opsia-service"
export RELEASE_TAG="${SERVICE_IMAGE_REPO}:${DEPLOY_SHA}"
export RELEASE_EVIDENCE="${HOME}/.opsia/release-evidence/${DEPLOY_SHA}"
mkdir -p "$RELEASE_EVIDENCE"
chmod 700 "$RELEASE_EVIDENCE"

git cat-file -e "${CURRENT_DEPLOY_SHA}^{commit}"
git merge-base --is-ancestor "$CURRENT_DEPLOY_SHA" "$DEPLOY_SHA"
```

먼저 remote canonical을 고정하고 증거에 남긴다.

```bash
git ls-remote origin refs/heads/dev | tee "$RELEASE_EVIDENCE/origin-dev.txt"
test "$(cut -f1 "$RELEASE_EVIDENCE/origin-dev.txt")" = "$DEPLOY_SHA"
bash scripts/test.sh 2>&1 | tee "$RELEASE_EVIDENCE/test.log"
make manifest-check 2>&1 | tee "$RELEASE_EVIDENCE/manifest-check.log"
uv run alembic heads | tee "$RELEASE_EVIDENCE/alembic-heads.txt"
test "$(grep -c '20260713_0820 (head)' "$RELEASE_EVIDENCE/alembic-heads.txt")" = 1
```

CI는 별도 권위값으로 확인한다. GitHub CLI를 쓰는 경우 예시는 다음과 같다.

```bash
gh run list --branch dev --commit "$DEPLOY_SHA" --limit 20 \
  --json databaseId,workflowName,status,conclusion,url \
  > "$RELEASE_EVIDENCE/github-actions.json"
```

필수 workflow가 하나라도 누락되거나 `completed/success`가 아니면 중단한다.

## 5. 기존 상태·rollback 기준점 고정

배포 시작 전 현재 object, image, replica, event backlog를 저장한다.

```bash
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get deployment -o json \
  > "$RELEASE_EVIDENCE/deployments.before.json"
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get statefulset -o json \
  > "$RELEASE_EVIDENCE/statefulsets.before.json"
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get pods -o wide \
  > "$RELEASE_EVIDENCE/pods.before.txt"
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get events \
  --sort-by=.lastTimestamp > "$RELEASE_EVIDENCE/events.before.txt"

python3 - "$RELEASE_EVIDENCE/deployments.before.json" \
  > "$RELEASE_EVIDENCE/deployment-images.before.tsv" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    data = json.load(handle)
for item in data["items"]:
    name = item["metadata"]["name"]
    for container in item["spec"]["template"]["spec"]["containers"]:
        print(name, container["name"], container["image"], sep="\t")
PY
```

`deployment-images.before.tsv`의 각 image가 tag가 아니라 digest로 복구 가능한지 확인한다.
mutable tag뿐이면 registry에서 해당 manifest digest를 조회해 별도 기록하고, 조회에 실패하면
중단한다.

DB logical backup을 암호화된 운영 저장소로 이동하기 전 로컬 권한을 제한한다.

```bash
export DB_BACKUP="$RELEASE_EVIDENCE/postgresql-${DEPLOY_SHA}.dump"
umask 077
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" exec statefulset/postgresql -- \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "$DB_BACKUP"
test -s "$DB_BACKUP"
sha256sum "$DB_BACKUP" > "$DB_BACKUP.sha256"
```

backup restore는 일반 application rollback 절차가 아니다. restore가 필요하면 쓰기 중단,
복원 시점 확정, 별도 DBA 승인과 maintenance window를 먼저 확보한다.

## 6. immutable backend image build·push

repository의 기존 build script를 사용하되 full canonical SHA로 tag한다.

```bash
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "${SERVICE_IMAGE_REPO%%/*}"

IMAGE_NAME="$RELEASE_TAG" bash scripts/build-image.sh \
  2>&1 | tee "$RELEASE_EVIDENCE/image-build.log"
docker push "$RELEASE_TAG" 2>&1 | tee "$RELEASE_EVIDENCE/image-push.log"

export RELEASE_DIGEST_SHA="$(aws ecr describe-images \
  --region "$AWS_REGION" \
  --repository-name "$ECR_REPOSITORY" \
  --image-ids "imageTag=${DEPLOY_SHA}" \
  --query 'imageDetails[0].imageDigest' \
  --output text)"
export RELEASE_DIGEST="${SERVICE_IMAGE_REPO}@${RELEASE_DIGEST_SHA}"
case "$RELEASE_DIGEST" in
  "${SERVICE_IMAGE_REPO}"@sha256:*) ;;
  *) echo "immutable image digest를 얻지 못함" >&2; exit 1 ;;
esac
printf '%s\n' "$RELEASE_DIGEST" > "$RELEASE_EVIDENCE/release-image.txt"
```

동일 tag를 다시 push하지 않는다. 이후 모든 workload에는 `RELEASE_DIGEST`를 넣는다.

## 7. migration-first 실행

### 7.1 baseline과 index 사전 검사

DB query는 PostgreSQL pod 안에서 실행해 credential을 출력하지 않는다.

```bash
db_query() {
  kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" exec statefulset/postgresql -- \
    sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "$1"' \
    sh "$1"
}

db_query "SELECT to_regclass('public.alembic_version');" \
  | tee "$RELEASE_EVIDENCE/alembic-version-table.txt"
db_query "SELECT version_num FROM alembic_version;" \
  | tee "$RELEASE_EVIDENCE/db-revision.before.txt"
```

`alembic_version`이 없거나 값이 비어 있으면 즉시 중단한다. 기존 `create_all` schema가
어느 revision과 동등한지 별도 비교·승인을 거쳐야 하며, 배포 중 `stamp`로 해결하지 않는다.
값이 repository의 migration history에 없거나 DB가 더 앞선 경우도 중단한다.

0140 이전 revision에서는 partial failure 흔적도 함께 검사한다.

```sql
SELECT
    EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'audit_log'
          AND column_name = 'causation_id'
    ) AS causation_column_exists,
    to_regclass('public.ix_audit_log_correlation_id_created_at') AS causation_index;
```

DB revision은 0140 이전인데 column이나 index가 이미 존재하면 0140 실행이 중간 commit된
상태일 수 있다. `op.add_column`이 다시 실행되면 duplicate column로 실패하므로 맹목적으로
`upgrade head`를 재시도하지 않는다. 현재 revision·column·index DDL을 보존하고 DBA가
forward repair와 revision 정합 절차를 승인할 때까지 중단한다.

다음 catalog query를 migration 전후에 실행한다.

```sql
SELECT
    n.nspname,
    c.relname,
    i.indisvalid,
    i.indisready,
    i.indislive
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indexrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = current_schema()
  AND c.relname IN (
      'ix_audit_log_correlation_id_created_at',
      'ix_audit_log_workspace_id_correlation_id_created_at',
      'ix_evidence_windows_workspace_correlation_cluster',
      'ix_rca_timeline_workspace_incident'
  )
ORDER BY c.relname;
```

BQ-002 index인 `ix_audit_log_correlation_id_created_at`가 존재하면서
`indisvalid`, `indisready`, `indislive` 중 하나라도 false이면 다음처럼 판정한다.

- DB revision이 `20260713_0140`보다 이전이면 transaction 밖에서 해당 INVALID index를
  `DROP INDEX CONCURRENTLY IF EXISTS`로 제거한 뒤 migration을 실행한다. 0140 revision이
  정상 index를 다시 만든다.
- DB revision이 `20260713_0140` 이상이면 migration은 다시 실행되지 않는다. 임의 drop은
  정상 index 부재를 만들므로 중단하고 DBA repair 승인을 받는다. 승인된 repair는 별도
  autocommit session에서 drop/create를 수행하고 세 catalog flag가 모두 true인지 확인한다.
- 0655·0750·0820 revision은 자기 index의 이전 실패 잔재를 drop한 뒤 다시 만들지만,
  적용 후 catalog 검사는 생략하지 않는다.

### 7.2 direct PostgreSQL runner

PgBouncer transaction pool이 아니라 PostgreSQL에 직접 연결한다. 현재 service image에는
Alembic asset이 없으므로 canonical checkout의 `uv` 환경에서 실행한다.

```bash
export LOCAL_DB_PORT="15432"
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
  port-forward statefulset/postgresql "${LOCAL_DB_PORT}:5432" \
  > "$RELEASE_EVIDENCE/postgres-port-forward.log" 2>&1 &
export PORT_FORWARD_PID=$!
trap 'kill "$PORT_FORWARD_PID" 2>/dev/null || true' EXIT

export POSTGRES_USER="$(kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
  get secret postgresql-secret -o jsonpath='{.data.POSTGRES_USER}' | base64 -d)"
export POSTGRES_PASSWORD="$(kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
  get secret postgresql-secret -o jsonpath='{.data.POSTGRES_PASSWORD}' | base64 -d)"
export POSTGRES_DB="$(kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
  get secret postgresql-secret -o jsonpath='{.data.POSTGRES_DB}' | base64 -d)"

export DATABASE_URL="$(python3 - <<'PY'
import os
from urllib.parse import quote

user = quote(os.environ["POSTGRES_USER"], safe="")
password = quote(os.environ["POSTGRES_PASSWORD"], safe="")
database = quote(os.environ["POSTGRES_DB"], safe="")
port = os.environ["LOCAL_DB_PORT"]
print(f"postgresql://{user}:{password}@127.0.0.1:{port}/{database}")
PY
)"

uv run alembic current 2>&1 | tee "$RELEASE_EVIDENCE/alembic-current.before.txt"
uv run alembic upgrade head 2>&1 | tee "$RELEASE_EVIDENCE/alembic-upgrade.log"
uv run alembic current 2>&1 | tee "$RELEASE_EVIDENCE/alembic-current.after.txt"
grep -q '20260713_0820 (head)' "$RELEASE_EVIDENCE/alembic-current.after.txt"

unset DATABASE_URL POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB
kill "$PORT_FORWARD_PID"
trap - EXIT
```

0140의 `CREATE INDEX CONCURRENTLY`는 Alembic `autocommit_block()`에서 실행된다. upgrade
로그의 COMMIT 경계와 §7.1의 catalog 결과를 보존한다. migration이 중간 실패하면 application
rollout을 시작하지 않는다. autocommit DDL은 부분 반영될 수 있으므로 downgrade나 backup
restore를 즉시 실행하지 말고 현재 revision·column·index 상태를 수집해 forward repair를
결정한다.

## 8. 원하는 manifest 렌더와 삭제 감사

기존 `scripts/aws-up.sh`는 schema bootstrap, 전체 `kubectl apply -k`, 모든 Deployment
restart를 한 번에 수행한다. 이 release의 단계적 적용에는 사용하지 않는다. 임시 Kustomize
overlay로 immutable backend digest를 렌더하고 object별 파일로 나눈다.

```bash
export RENDER_DIR="$(mktemp -d "${REPO_ROOT}/.deploy-render.XXXXXX")"
trap 'rm -rf "$RENDER_DIR"' EXIT
mkdir -p "$RENDER_DIR/overlay" "$RENDER_DIR/objects"

export IMAGE_NEW_NAME="${RELEASE_DIGEST%@sha256:*}"
export IMAGE_DIGEST="sha256:${RELEASE_DIGEST##*@sha256:}"
cat > "$RENDER_DIR/overlay/kustomization.yaml" <<EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
  - ../../deploy/management
images:
  - name: kubeheal-service
    newName: ${IMAGE_NEW_NAME}
    digest: ${IMAGE_DIGEST}
patches:
  - target:
      group: apps
      version: v1
      kind: Deployment
      name: api-gateway
    patch: |-
      apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: api-gateway
      spec:
        template:
          spec:
            containers:
              - name: gateway
                env:
                  - name: DEV_AUTH_BYPASS
                    value: "0"
EOF

kubectl kustomize "$RENDER_DIR/overlay" > "$RENDER_DIR/management.yaml"
cp "$RENDER_DIR/management.yaml" "$RELEASE_EVIDENCE/management.rendered.yaml"

uv run python - "$RENDER_DIR/management.yaml" "$RENDER_DIR/objects" <<'PY'
from pathlib import Path
import sys
import yaml

source = Path(sys.argv[1])
out = Path(sys.argv[2])
for obj in yaml.safe_load_all(source.read_text(encoding="utf-8")):
    if not obj:
        continue
    kind = obj["kind"].lower()
    name = obj["metadata"]["name"]
    path = out / f"{kind}--{name}.yaml"
    path.write_text(yaml.safe_dump(obj, sort_keys=False), encoding="utf-8")
PY
```

렌더 결과의 service-image Deployment가 정확히 39개인지, gateway auth bypass가 꺼졌는지
검증한다.

```bash
uv run python - "$RENDER_DIR/management.yaml" "$RELEASE_DIGEST" <<'PY'
import sys
import yaml

documents = [item for item in yaml.safe_load_all(open(sys.argv[1], encoding="utf-8")) if item]
release_image = sys.argv[2]
deployments = []
for item in documents:
    if item.get("kind") != "Deployment":
        continue
    containers = item["spec"]["template"]["spec"].get("containers", [])
    if any(container.get("image") == release_image for container in containers):
        deployments.append(item)

assert len(deployments) == 39, [item["metadata"]["name"] for item in deployments]
gateway = next(item for item in deployments if item["metadata"]["name"] == "api-gateway")
gateway_container = next(
    item for item in gateway["spec"]["template"]["spec"]["containers"]
    if item["name"] == "gateway"
)
env = {item["name"]: item.get("value") for item in gateway_container.get("env", [])}
assert env.get("DEV_AUTH_BYPASS") == "0", env
PY

git diff --name-status "$CURRENT_DEPLOY_SHA..$DEPLOY_SHA" -- deploy \
  | tee "$RELEASE_EVIDENCE/deploy-source.diff"

for file in "$RENDER_DIR"/objects/deployment--*.yaml; do
  if rg -qF "$RELEASE_DIGEST" "$file"; then
    kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" diff -f "$file" \
      >> "$RELEASE_EVIDENCE/management.diff" || test "$?" = 1
  fi
done
```

허용 범위는 service-image workload 변경, 신규 두 worker, Argo read-only RBAC,
기존 additive manifest뿐이다. storage 삭제, Service selector 변경, secret 값 변경,
replica 감소, frontend image 변경, 소유권 밖 object 삭제가 보이면 중단한다. `kubectl apply
--prune`과 전체 namespace delete는 사용하지 않는다.

## 9. 단계적 workload 적용

아래 함수는 렌더된 단일 object만 적용하고 rollout을 기다린다.

```bash
apply_deployment() {
  local name="$1"
  local file="$RENDER_DIR/objects/deployment--${name}.yaml"
  test -s "$file"
  kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" apply -f "$file"
  kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
    rollout status "deployment/${name}" --timeout=300s
}
```

### 9.1 신규 consumer와 projection

```bash
apply_deployment audit-worker
apply_deployment change-correlation-worker
apply_deployment dashboard-worker
apply_deployment dead-letter-monitor
```

### 9.2 outbox relay와 나머지 worker

새 producer보다 relay를 먼저 올려 workspace metadata 손실 구간을 줄인다.

```bash
apply_deployment outbox-relay

for name in \
  alert-worker mail-worker command-worker command-janitor rca-timeline-janitor \
  workflow-controller target-reconcile-worker rca-worker git-pull-worker \
  manifest-render-worker diff-worker diff-analyze-worker safe-pr-worker scm-worker \
  drift-worker release-flow-worker github-poll-worker auto-revert-worker \
  ai-chat-worker evidence-worker incident-worker plan-worker analyze-worker \
  recovery-worker select-worker dispatch-worker backlog-worker ai-diff-worker \
  rollout-worker approval-worker ai-fallback-worker rca-feedback-worker
do
  apply_deployment "$name"
done
```

각 rollout 사이에 CrashLoopBackOff, liveness failure, NATS consumer error, outbox backlog
증가를 확인한다. 한 workload가 실패하면 다음 단계로 가지 않고 §12의 image rollback을
실행한다.

auto-revert 발화는 기본 off여야 한다.

```bash
test "$(kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
  get deploy auto-revert-worker \
  -o jsonpath='{.spec.template.spec.containers[0].env[?(@.name=="RECOVERY_ENABLE_AUTO_REVERT_PR")].value}')" \
  = "false"
```

### 9.3 target agent

`scripts/register-target.sh`는 target 재등록과 agent credential 회전을 동반하므로 image
rollout 목적으로 실행하지 않는다. `deploy/target/target.yaml` 전체도 runtime ConfigMap·Secret이
없는 정적 참조본이므로 단독 적용하지 않는다. 정적 참조본에서 Argo read-only RBAC 두
object만 추출해 검토하고, 기존 Deployment에는 image와 node-collector image만 한 번에
patch한다.

```bash
uv run python - deploy/target/target.yaml "$RENDER_DIR/target-rbac.yaml" <<'PY'
from pathlib import Path
import sys
import yaml

source = Path(sys.argv[1]).read_text(encoding="utf-8")
selected = []
for item in yaml.safe_load_all(source):
    if not item:
        continue
    key = (item.get("kind"), item.get("metadata", {}).get("name"))
    if key in {
        ("ClusterRole", "cluster-agent-read"),
        ("ClusterRoleBinding", "cluster-agent-read"),
    }:
        selected.append(item)
assert len(selected) == 2, selected
Path(sys.argv[2]).write_text(
    "---\n".join(yaml.safe_dump(item, sort_keys=False) for item in selected),
    encoding="utf-8",
)
PY
```

각 target context에서 다음을 순서대로 실행한다. context별 before object는 rollback 증거에
보존한다.

```bash
export TARGET_CONTEXT="<target-context>"
export TARGET_ID="<registered-cluster-id>"

kubectl --context "$TARGET_CONTEXT" -n target get deploy cluster-agent -o json \
  > "$RELEASE_EVIDENCE/target-${TARGET_ID}-agent.before.json"
kubectl --context "$TARGET_CONTEXT" diff -f "$RENDER_DIR/target-rbac.yaml" \
  > "$RELEASE_EVIDENCE/target-${TARGET_ID}-rbac.diff" || test "$?" = 1
kubectl --context "$TARGET_CONTEXT" apply -f "$RENDER_DIR/target-rbac.yaml"

test "$(kubectl --context "$TARGET_CONTEXT" auth can-i get applications.argoproj.io \
  --as=system:serviceaccount:target:cluster-agent --all-namespaces)" = "yes"
test "$(kubectl --context "$TARGET_CONTEXT" auth can-i get rollouts.argoproj.io \
  --as=system:serviceaccount:target:cluster-agent --all-namespaces)" = "yes"
test "$(kubectl --context "$TARGET_CONTEXT" auth can-i patch applications.argoproj.io \
  --as=system:serviceaccount:target:cluster-agent --all-namespaces)" = "no"
test "$(kubectl --context "$TARGET_CONTEXT" auth can-i patch rollouts.argoproj.io \
  --as=system:serviceaccount:target:cluster-agent --all-namespaces)" = "no"

export AGENT_PATCH="$(RELEASE_DIGEST="$RELEASE_DIGEST" python3 - <<'PY'
import json
import os

image = os.environ["RELEASE_DIGEST"]
print(json.dumps({
    "spec": {
        "template": {
            "spec": {
                "containers": [{
                    "name": "cluster-agent",
                    "image": image,
                    "env": [{"name": "NODE_COLLECTOR_IMAGE", "value": image}],
                }]
            }
        }
    }
}))
PY
)"
kubectl --context "$TARGET_CONTEXT" -n target patch deployment/cluster-agent \
  --type strategic -p "$AGENT_PATCH"
kubectl --context "$TARGET_CONTEXT" -n target \
  rollout status deployment/cluster-agent --timeout=300s
```

agent가 `agent_connected → snapshot_received → ready`로 복귀하고 outstanding command가
없는 것을 확인한 뒤 다음 target으로 진행한다. 동시에 여러 agent를 내리지 않는다.

### 9.4 gateway

worker와 agent가 모두 정상이고 backlog가 감소한 뒤 gateway를 적용한다.

```bash
apply_deployment realtime-gateway
apply_deployment api-gateway

kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get deploy api-gateway \
  -o jsonpath='{.status.readyReplicas}{"/"}{.spec.replicas}{"\n"}'
test "$(kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get deploy api-gateway \
  -o jsonpath='{.spec.template.spec.containers[?(@.name=="gateway")].env[?(@.name=="DEV_AUTH_BYPASS")].value}')" \
  = "0"
```

`api-gateway`는 `2/2`가 아니면 smoke를 시작하지 않는다. 적용 중 모든 ready replica가
0이 된 구간이 있으면 무중단 조건 실패로 기록한다.

## 10. rollout 직후 상태 확인

```bash
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get pods -o wide \
  | tee "$RELEASE_EVIDENCE/pods.after.txt"
kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" get events \
  --sort-by=.lastTimestamp | tee "$RELEASE_EVIDENCE/events.after.txt"

curl -fsS "<public-origin>/api/healthz" \
  | tee "$RELEASE_EVIDENCE/healthz.json"
curl -fsS "<public-origin>/api/readyz" \
  | tee "$RELEASE_EVIDENCE/readyz.json"
```

모든 service-image deployment가 `RELEASE_DIGEST`를 쓰는지 비교하고, 이전 digest가 남으면
mixed-version 상태로 간주해 중단한다. outbox pending, NATS redelivery/DLQ, DB pool saturation,
worker heartbeat age, API 5xx와 latency를 최소 15분 관찰한다.

## 11. integration smoke와 신규 API 실측

먼저 repository의 end-to-end smoke를 반드시 켠 상태로 실행한다.

```bash
BASE_URL="<public-origin>" \
MGMT_CONTEXT="$MGMT_CONTEXT" \
AUTH_EMAIL="<operator-email>" \
AUTH_PASSWORD="<operator-password>" \
SMOKE_CLUSTER_ID="<authorized-live-fixture-cluster>" \
bash scripts/smoke.sh 2>&1 | tee "$RELEASE_EVIDENCE/smoke.log"
```

Bruno 13·14·15는 실제 session과 권한 있는 fixture ID로 실행한다.

```bash
cd docs/api
npx --yes @usebruno/cli@3.5.1 run \
  05-rca-dashboard/13-remediation-bundle.bru \
  05-rca-dashboard/14-audit-timeline.bru \
  05-rca-dashboard/15-recent-changes.bru \
  --env-file environments/aws-test.bru \
  --client-cert-config "${HOME}/.opsia/bruno-client-cert-config.json" \
  --env-var "rca_correlation_id=<real-correlation-id>" \
  --env-var "incident_id=<real-incident-id>" \
  --reporter-skip-all-headers \
  --output "$RELEASE_EVIDENCE/bruno-new-routes.json" \
  --format json
cd "$REPO_ROOT"
```

Bruno 파일 자체는 인증/존재 은닉 응답도 회귀 범위에 포함한다. production acceptance는 더
강하다. 세 요청이 모두 **200**이어야 하며 다음을 직접 확인한다.

- RemediationBundle: `meta`, `diagnosis`, nullable `remediation`; diagnosis의
  `selected_candidate_id`와 remediation의 `selected_action_id`를 합치지 않는다.
- audit timeline: `items`, `has_more`, `next_cursor`; raw `payload`는 없고
  `payload_summary`만 있다.
- recent changes: `incident_id`, `items`; 각 item의 commit/workflow/image/PR reference가
  schema와 맞는다.
- 다른 workspace session으로 같은 correlation/incident를 조회하면 존재를 드러내지 않는
  404여야 한다.

200 응답과 cross-workspace negative 결과를 secret·원문 evidence 없이 증거 파일에 남긴다.

## 12. application rollback

DB migration은 additive이며 0820 downgrade는 projection table의 데이터를 삭제한다.
application 문제 때문에 production schema를 downgrade하지 않는다. 새 schema를 유지한 채
이전 image digest로 되돌린다.

1. 쓰기 오류를 만드는 신규 worker를 먼저 중지한다.

   ```bash
   kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
     scale deploy/change-correlation-worker deploy/auto-revert-worker --replicas=0
   ```

2. `deployment-images.before.tsv`의 deployment/container/image를 사용해 API gateway부터
   이전 digest로 복원하고, worker는 §9의 역순으로 복원한다.

   ```bash
   kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
     set image deployment/<name> <container>=<previous-image-digest>
   kubectl --context "$MGMT_CONTEXT" -n "$MGMT_NS" \
     rollout status deployment/<name> --timeout=300s
   ```

3. target agent도 각 target context에서 이전 digest로 복원하고 rollout을 확인한다.
4. health/ready, 기존 `scripts/smoke.sh`, outbox/NATS/DLQ를 다시 확인한다.
5. 신규 DB column/table은 남긴다. migration 실패로 partially applied 상태라면 DBA가
   revision·catalog를 확인해 forward repair한다.

`kubectl rollout undo`는 mutable history에 의존하므로 감사 가능한 기본 rollback으로 쓰지
않는다. 기록한 이전 digest를 명시한다.

## 13. 단일 replica와 HA 위험

- PostgreSQL, Redis, NATS, MinIO, PgBouncer가 각각 1 replica다. node·volume·process 장애가
  control plane 전체 중단으로 이어질 수 있다.
- `api-gateway`는 2 replica지만 `realtime-gateway`는 1 replica라 WebSocket 연결이 rollout
  중 끊기고 client reconnect가 필요하다.
- 대부분의 worker와 신규 `change-correlation-worker`, `auto-revert-worker`,
  `github-poll-worker`가 1 replica·`Recreate`다. rollout 동안 consumer 공백과 backlog 증가가
  발생한다.
- target `cluster-agent`가 1 replica라 rollout 중 inventory/command 수신이 일시 중단된다.
  runtime SQLite 경로도 `emptyDir`라 pod 교체 시 로컬 command/outbox 상태가 사라질 수
  있으므로 outstanding command가 없는 target부터 한 개씩 교체한다.
- `console`은 1 replica다. `console-dev`, `agent-api-proxy`, `cloudflared`는 2 replica지만
  backend stateful SPOF를 상쇄하지 못한다.
- Redis persistence와 multi-replica broker/storage quorum이 없는 현재 구성에서는 장애 시
  복구 목표를 엄격히 보장할 수 없다.

이 track에서는 HA topology를 바꾸지 않는다. J단계 승인에는 low-traffic window, on-call,
DB backup, backlog 여유, target별 순차 rollout, 즉시 image rollback 권한이 필요하다.

## 14. J단계 승인 체크리스트

- [ ] `DEPLOY_SHA`가 `origin/dev` remote HEAD와 일치한다.
- [ ] full gate와 manifest check가 통과했다.
- [ ] GitHub Actions 필수 workflow가 전부 green이다.
- [ ] 단일 Alembic head와 DB baseline이 확인됐다.
- [ ] concurrent index가 전부 valid/ready/live다.
- [ ] encrypted backup과 이전 image digest가 보존됐다.
- [ ] backend digest가 immutable하고 재사용되지 않았다.
- [ ] manifest diff의 삭제·stateful·frontend 변경이 0건이다.
- [ ] rendered/live `DEV_AUTH_BYPASS=0`이 확인됐다.
- [ ] 신규 두 worker, target agent, gateway의 순차 rollout 담당자가 배정됐다.
- [ ] 모든 등록 target context와 이전 agent digest가 열거됐다.
- [ ] `RECOVERY_ENABLE_AUTO_REVERT_PR=false`가 유지된다.
- [ ] smoke credential과 권한 있는 correlation/incident fixture가 준비됐다.
- [ ] 1-replica 위험과 rollback 기준을 사람이 승인했다.

모든 항목이 충족되기 전에는 GO [J]를 실행 승인으로 해석하지 않는다.
