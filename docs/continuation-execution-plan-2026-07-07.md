# Continuation Execution Plan — 2026-07-07

이 문서는 대화 맥락이 완전히 사라져도 다음 AI/개발자가 같은 작업을 이어가기 위한 단일 실행 문서다.
이 문서가 최신 상태인지 먼저 보고, 더 최신 내용은 repo root의 `HANDOVER.md` 상단을 확인한다.

## 0. 절대 원칙

1. 운영 코드, 운영 화면, API 응답, DB 복구/초기화 절차에 mock/fake/hardcoded production data를 넣지 않는다.
2. 테스트 내부의 fake/stub은 허용되지만 운영 경로에 연결하면 안 된다.
3. 라이브 화면 수치와 drilldown은 실제 DB/API/클러스터 관측값만 사용한다.
4. DB 초기화는 최종 안정화 완료 후 1회만 한다.
5. DB 초기화 전에 반드시 백업/스냅샷을 만든다.
6. 사용자가 만든 변경을 되돌리지 않는다. `git reset --hard`, `git checkout -- <file>` 금지.
7. 커밋은 최소 단위로 나누고, 각 단위마다 테스트 → 커밋 → 푸시 → 배포 확인 → HANDOVER 갱신을 닫는다.
8. `/console/`은 데모 보존 대상이고, 실제 서비스는 `/`다.

## 1. 현재 상태 요약

### 브랜치와 커밋

- 작업 브랜치: `dev`.
- 이 문서 작성 직전 production-code baseline local/dev 및 origin/dev: `b013b431d5c766ea4c2b37f75ce31db974d98efe`
  - 커밋 메시지: `docs: target preflight route 상수 정합성`
- 최신 origin/main: `f2b7d43c0c5eba7afb5d5a6a92e4cfb837db6d11`
  - dev를 main에 자동 merge한 merge commit.
- 이 문서 자체 또는 이후 HANDOVER 문서 커밋 때문에 origin/dev가 더 앞서 있을 수 있다. 항상 `git rev-parse HEAD origin/dev origin/main`으로 실제 최신 SHA를 먼저 확인한다.
- `git status --short --branch` 기준 추적 파일은 깨끗해야 한다.
- 현재 untracked로 남아 있을 수 있는 파일:
  - `.e2e-tmp-sweep.py`
  - `report_desktop.json`
  - `report_mobile.json`
- 위 untracked 파일은 자동 E2E 산출물/임시 파일로 보인다. 내용을 확인하기 전에는 커밋하지 않는다.

### 최근 완료한 안정화 커밋

1. `001bd278 fix: 정상 샘플 / RCA 표시 / 운영 원칙`
   - 정상 `incident.detected` 중 `detected != true`를 dashboard projection/read model에서 제외.
   - 전체 테스트 통과 당시 `672 passed, 3 skipped`.
2. `9d919082 fix: 실가입 인증 / 부트스트랩 / 메일 링크`
   - 로그인 rate limit, 비밀번호 검증 전 pending 정보 노출 방지.
   - `PUBLIC_BASE_URL`/`PUBLIC_API_BASE_URL` 기반 email verification URL.
   - AWS bootstrap이 `Database.upsert_admin_account()` 사용.
   - 전체 테스트 통과 당시 `674 passed, 3 skipped`.
3. `6a27d95f fix: 로그인 smoke 재시도 보강`
   - `scripts/lib/auth.sh` login smoke retry 보강.
   - AWS workflow 관련 테스트 14 passed.
4. `8ebca771 fix: provider 등록 권한 경계 정렬`
   - provider catalog/discovery/validate를 admin 전용으로 변경.
   - 비관리자에게 cluster 등록 CTA를 숨김.
   - cluster registration 문서가 `cluster-discovery -> preflight -> targets -> connection-status` 흐름과 일치하도록 정렬.
5. `b013b431 docs: target preflight route 상수 정합성`
   - contracts 문서의 target preflight route 상수명을 실제 코드와 맞춤.

### 최신 검증 결과

`8ebca771` 커밋 전 로컬에서 다음을 통과했고, `b013b431`은 문서 상수 정합성만 변경했다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_provider_registry.py tests/test_bruno_collection.py
# 15 passed

ruff format --check src scripts tests
ruff check src scripts tests
git diff --check
# all passed

cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run build
# all passed, Vite large chunk warning only

PYTHONPATH=src .venv/bin/python -m pytest -q
# 675 passed, 3 skipped
```

GitHub Actions `dev` 기준:

- CI run `28847540798`: success.
- Promote Dev To Main run `28847540802`: success.
- AWS CD dev push run `28847540852`: success.

GitHub Actions `main` 기준:

- AWS CD run `28847747039`: 최신 main deploy run.
- 이 문서를 갱신할 당시 상태: `Test before deploy` success, `Deploy to AWS EKS` in progress.
- 이전 main run `28847597545`와 `28847358844`는 더 최신 run 때문에 cancel됨. 실패로 보지 않는다.

라이브 health check:

```bash
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
# {"status":"ok","service":"api-gateway"}
```

## 2. 가장 먼저 실행할 재개 절차

새 AI가 이어받으면 바로 아래 순서대로 현재 상태를 확인한다.

```bash
cd /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final

git status --short --branch
git log --oneline -5
git ls-remote origin refs/heads/dev refs/heads/main

gh run list --repo Jungle-303-04/final --branch dev --limit 6
gh run list --repo Jungle-303-04/final --branch main --limit 8
gh run view 28847747039 --repo Jungle-303-04/final --json status,conclusion,headSha,jobs

curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
```

판단 규칙:

- 최신 main run이 `28847747039`가 아니면 `gh run list --branch main`의 가장 최신 AWS CD run을 기준으로 이어간다.
- run이 `cancelled`이고 더 최신 run이 있으면 최신 run을 추적한다.
- run이 `failure`면 `gh run view <run-id> --log-failed`로 원인 로그를 먼저 본다.
- healthz가 일시 502면 CD rollout 중일 수 있다. 1~2분 간격으로 재확인하고, CD가 끝났는데도 502면 AWS/kubectl 상태 확인으로 전환한다.

## 3. 현재 작업 항목과 완료 기준

### A. 인시던트/followup/projection 폭증 차단

상태: 코드 완료, 배포 검증 중.

완료 기준:

- 최신 main AWS CD success.
- 라이브 DB에서 신규 `rca.followup.required`가 정상 snapshot 10초 주기로 계속 증가하지 않는다.
- dashboard open incident count가 `detected=false` 과거 row 때문에 부풀지 않는다.
- DLQ 신규 증가가 멈추거나 원인이 신규 코드가 아닌 과거 stale 이벤트로 확인된다.

필요 확인:

```bash
gh run list --repo Jungle-303-04/final --branch main --limit 8
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
```

DB 직접 확인은 AWS/kubectl 인증이 필요하다. 현재 로컬 `kubectl`은 AWS SSO 세션 만료로 다음 오류가 날 수 있다.

```text
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
```

이 경우 로컬에서 AWS SSO를 재인증하거나, GitHub Actions의 AWS CD/smoke 결과를 우선 신뢰한다. 로컬에서 인증이 가능해지면 Postgres pod나 pgbouncer를 통해 최근 row 증가율을 확인한다.

### B. 실가입 인증/로그인/session

상태: 코드 완료, 배포 검증 중.

완료 기준:

- live `/api/auth/login`이 실제 admin credential로 성공.
- `GET /api/auth/session`이 로그인 쿠키로 현재 사용자/role을 반환.
- `POST /api/auth/session/refresh`가 2시간 sliding session 의도대로 동작.
- 잘못된 비밀번호에서 pending 상태를 누설하지 않음.
- email verify URL이 `/api/auth/verify-email` 경로로 실제 token 소비.

실행 기준:

- credential은 환경변수나 GitHub/AWS secret에서만 사용한다.
- secret 값을 로그/문서/커밋에 쓰지 않는다.

### C. provider/cluster 등록 권한 경계

상태: 코드 완료, dev/main 배포 진행 중.

변경 파일:

- `src/domains/providers/router.py`
- `tests/test_provider_registry.py`
- `frontend/src/features/console/pages/HomePage.tsx`
- `frontend/src/features/cluster/ClusterListView.tsx`
- `frontend/src/features/metrics/MetricsView.tsx`
- `frontend/src/features/resources/ConnectRepoWizard.tsx`
- `docs/api/01-providers/*`
- `docs/api/README.md`
- `docs/spec/domains/providers.md`
- `docs/spec/domains/target.md`
- `docs/spec/frontend/*`
- `docs/fd/*`
- `HANDOVER.md`

완료 기준:

- 비로그인 상태에서 `/api/providers/catalog`, `/api/providers/cluster-discovery`, `/api/providers/validate`는 401.
- 일반 user session에서 같은 endpoint는 403.
- admin session에서 200.
- UI에서 non-admin은 `+ 클러스터 등록` CTA를 보지 않는다.
- admin은 cluster discovery/preflight/register flow를 진행할 수 있다.

라이브 확인 예:

```bash
curl -i --max-time 8 https://k8s.woonyong.org/api/providers/cluster-discovery
# 401 expected when no session cookie
```

admin 확인은 로그인 cookie jar를 사용한다. secret 출력 금지.

### D. 레포 등록 동적화

상태: 기본 동적 flow 구현됨. GitHub poller DB watch target 순회는 코드 구현/로컬 검증 완료, 배포 대기.

이미 구현된 것:

- repo URL/ref 입력.
- 실제 GitHub API 기반 probe.
- branch list 동적 선택.
- manifest candidate list 동적 선택.
- validation/resource count.
- application + deployment 생성.

주요 파일:

- `frontend/src/features/resources/ConnectRepoWizard.tsx`
- `frontend/src/features/repo/api.ts`
- `src/domains/gitops/repository_discovery.py`
- `src/domains/applications/router.py`
- GitHub poller 관련 파일은 `rg "github-poll|poller|GITHUB_REPO|manifest_path" src scripts -n`로 찾는다.

남은 생산화 gap:

1. GitHub poller DB target 순회 — 구현 완료. `list_active_github_poll_targets`가 DB의 active repo/application/binding/watch target을 읽고, poller는 DB target을 우선 사용하며 env target은 fallback으로만 유지한다.
2. `/applications` deployment 생성은 `register_watch_target` 후 `register_deployment_binding` 순서로 한 트랜잭션에서 처리한다.
3. 남은 gap: Helm/Kustomize validation이 placeholder라면 실제 render/validate로 바꾼다.

병렬 explorer 결과:

- Agent nickname: `Banach`
- Agent id: `019f3b5e-8f4b-74a0-a447-56a1e0bfd325`
- 상태: read-only 분석 완료. 파일 수정 없음.

정확한 구현 seam:

- `src/services/gitops/github-poll-worker/poller.py`
  - `GitHubPoller.__init__`, `poll_once`, `latest_commit_sha`, `emit_webhook`, `_github_headers`.
  - 현재 poller가 env에서 단일 target을 `self`에 저장하고 `poll_once()`가 대상 인자 없이 한 repo만 polling한다.
- `src/services/gitops/github-poll-worker/settings.py`
  - 현재 env target: `GITHUB_REPO`, `GITHUB_BRANCH`, `WATCH_TARGET_ID`, `DEPLOYMENT_BINDING_ID`, `TARGET_CLUSTER_ID`, `MANIFEST_PATH`.
- `src/domains/gitops/models.py`
  - 이미 존재하는 테이블: `git_repositories`, `git_watch_targets`, `deployment_bindings`, `applications`.
- `src/domains/gitops/repository.py`
  - DB target 조회 method를 추가할 적정 위치. 이 repository가 등록과 watch state method를 이미 소유한다.
- `src/domains/applications/router.py`
  - app/deployment 등록 경로. 현재 repository/application/binding은 만들지만 deployment 생성 시 watch target row를 만들지 않는다.
- `src/services/gitops/git-pull-worker/app.py`
  - downstream dedupe는 `get_watch_last_seen_commit_sha`를 사용한다.
- `src/services/gitops/manifest-render-worker/app.py`
  - downstream은 `git_watch_targets.last_seen_commit_sha`를 갱신한다.

구현 전 동작:

- poller는 `GET /repos/{repo}/commits?per_page=1&sha={branch}`로 env 단일 repo의 최신 commit을 가져온다.
- poller는 `/github/webhook`으로 단일 webhook body를 보낸다.
- `tests/test_github_poller.py`는 이 env 단일 대상 동작을 고정하고 있다.
- DB에는 필요한 shape가 이미 있다.
  - `git_repositories.credential_ref`
  - `git_watch_targets.branch`, `manifest_path`, `last_seen_commit_sha`
  - `deployment_bindings.cluster_id`, `environment`
  - `applications.application_id`

안전한 최소 구현 계획:

1. `src/domains/gitops/repository.py`
   - `list_active_github_poll_targets(...)` 추가.
   - active GitHub repo, active application, active deployment binding, watch target을 join한다.
   - 실제 `git_watch_targets` row를 우선하고, 기존 row 호환을 위해 binding/application/repository 필드 fallback을 둔다.
   - 반환 필드: `credential_ref`, `application_id`, `repository_id`, `repo_ref`, `branch`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `manifest_path`, `last_seen_commit_sha`.
2. `src/domains/applications/router.py`
   - deployment 생성 시 `branch=application["default_branch"]`를 body에 포함한다.
   - `db.register_watch_target(body)`를 `db.register_deployment_binding(body)`보다 먼저 호출한다.
   - normal binding path와 global binding path 모두 같은 계약으로 처리한다.
3. `src/services/gitops/github-poll-worker/poller.py`
   - `GitHubPollTarget` dataclass를 둔다.
   - `latest_commit_sha(target)`와 `emit_webhook(target, sha)` 형태로 대상 인자를 받게 한다.
   - `poll_once()`는 DB target을 먼저 조회하고, target별로 실제 webhook을 낸다.
   - DB target이 없고 `GITHUB_REPO`가 명시된 경우에만 env fallback을 사용한다.
4. `src/services/gitops/github-poll-worker/app.py`
   - `DATABASE_URL`이 있으면 `Database`/`AsyncDb`를 poller에 주입한다.
   - `build_token_vault()`로 `credential_ref`를 해석한다.
   - 기존 `GITHUB_TOKEN_REF`/`GITHUB_TOKEN` fallback은 유지한다.

필요 테스트:

- `tests/test_github_poller.py`
  - DB target mode가 DB의 `application_id`, `repository_id`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `branch`, `manifest_path`를 webhook body에 싣는지 확인.
  - DB target이 있으면 `GITHUB_REPO` 없이도 poll 되는지 확인.
  - `credential_ref`가 token vault를 거쳐 GitHub `Authorization` header에 반영되는지 확인.
  - DB target이 없으면 기존 env fallback이 유지되는지 확인.
- `tests/test_database_unit.py`
  - `list_active_github_poll_targets` SQL join/filter compile 또는 결과 검증.
- `tests/test_applications_router.py`
  - deployment 생성이 `register_watch_target`을 application `default_branch`와 함께 호출한 뒤 binding을 생성하는지 확인.

운영 리스크:

- schema migration은 필요 없을 가능성이 높다. 필요한 table/column이 이미 있다.
- 기존 deployment binding에는 `git_watch_targets` row가 없을 수 있다. 따라서 query fallback을 먼저 넣고, 실제 row 관찰 후 필요하면 one-time backfill을 별도 작업으로 둔다.
- GitHub API 호출량은 env 한 repo에서 등록된 watch target 수만큼 늘어난다. 가능하면 `(repo_ref, branch, credential_ref)` 단위로 묶거나, access error는 기존처럼 soft-skip한다.
- `credential_ref=k8s-secret:...`를 poller CronJob이 읽으려면 service account/RBAC가 필요할 수 있다. env/AWS ref는 manifest 변경 없이 가능하다.

구현 결과:

- `src/domains/gitops/repository.py`
  - `list_active_github_poll_targets(workspace_id=None, limit=500)` 추가.
  - active GitHub repo, active application, active deployment binding, optional watch target을 join한다.
  - 기존 binding에 watch target row가 없어도 binding의 derived watch_target_id/manifest_path로 fallback한다.
- `src/domains/applications/router.py`
  - deployment 생성 시 application default branch를 body에 넣고, watch target을 먼저 upsert한 뒤 deployment binding을 upsert한다.
- `src/services/gitops/github-poll-worker/poller.py`
  - `GitHubPollTarget` dataclass 추가.
  - DB target을 우선 순회, DB target이 없고 `GITHUB_REPO`가 있을 때만 env fallback.
  - target별 `_last_sha_by_target`/`_etag_by_target` 유지.
  - DB `credential_ref` 또는 env `GITHUB_TOKEN_REF`를 token vault로 해석해 GitHub Authorization header에 반영.
  - webhook body에 실제 `application_id`와 `environment`까지 포함한다.
- `src/services/gitops/github-poll-worker/app.py`
  - `DATABASE_URL`이 있으면 `Database()`를 poller에 주입한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_github_poller.py tests/test_applications_router.py tests/test_database_unit.py` → 56 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.

### E. 클러스터 등록 동적화

상태: 기본 dynamic flow 구현됨, 생산화 gap 남음.

이미 구현된 것:

- provider catalog/discovery.
- env-derived import candidate.
- target preflight.
- target registration.
- connection polling.

주요 파일:

- `frontend/src/features/resources/RegisterClusterWizard.tsx`
- `src/domains/providers/catalog.py`
- `src/domains/providers/router.py`
- `src/domains/target/router.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`

남은 생산화 gap:

1. env-derived 후보를 넘어 실제 외부 콘솔 API/kubeconfig discovery 확장.
2. preflight에서 실제 Kubernetes 연결성 검증.
3. `kube-context` direct apply 후보와 backend allowlist 정책이 UI/서버에서 완전히 같은 기준인지 확인.

### F. 프론트 폴리싱/E2E

상태: 주요 build/lint/typecheck 통과. live visual/E2E 반복 필요.

완료 기준:

- `/`, `/clusters`, `/clusters/:id`, `/metrics`, `/incidents/:id`, `/repos`, `/settings/*`, `/login`, `/signup`, `/verify-email` smoke.
- desktop/mobile 화면에서 overflow, text overlap, broken empty/loading/error state 없음.
- 로딩 skeleton, 에러 메시지, 빈 상태가 실제 권한/데이터 상태와 맞음.
- `/console/` 데모 보존 정책과 `/` 실제 서비스 정책이 충돌하지 않음.

주의:

- 기존 untracked `report_desktop.json`, `report_mobile.json`이 E2E 산출물일 수 있다. 재사용하려면 내용을 확인하고, 아니면 커밋하지 않는다.

### G. DB 초기화 준비

상태: 아직 실행 금지. 계획/백업 절차부터 준비.

초기화는 모든 기능 배포/검증 후 마지막 1회만 한다.

현재 알려진 운영 DB 구조:

- Namespace: `management`
- Postgres StatefulSet: `postgresql`
- Service: `postgresql`
- Secret: `postgresql-secret`
- PVC 예: `data-postgresql-0`
- PgBouncer Deployment: `pgbouncer`
- PgBouncer Secret: `pgbouncer-config`
- Runtime ConfigMap/Secret:
  - `management-runtime-config`
  - `management-runtime-secret`

금지:

- 백업 없이 DB drop/truncate/delete.
- 전체 `scripts/aws-up.sh`를 DB reset 도구처럼 실행.
- secret 값을 로그/문서에 남김.
- mock seed로 운영 화면 채우기.

필수 백업:

1. Postgres logical dump.
2. PVC/EBS snapshot.
3. Kubernetes Secrets/ConfigMaps backup.
4. 현재 deployment image/tag와 env 기록.

DB schema/init 공식 경로:

- `Database().init()`
- admin bootstrap: `Database.upsert_admin_account()`

### H. DB 초기화 실행

상태: 대기.

게이트:

- 최신 main AWS CD success.
- live healthz ok.
- provider/admin/auth smoke 통과.
- incident/DLQ 신규 증가 원인 확인.
- DB backup artifact 위치 기록.
- 사용자에게 "이제 DB 초기화를 실행한다"는 상태 업데이트를 남긴 뒤 실행.

초기화 후 복구 순서:

1. schema/init.
2. admin bootstrap.
3. `cluster-1`, `cluster-2` 실제 target 재등록.
4. 실제 repo/app 재등록.
5. target agent 연결 확인.
6. inventory/evidence/fleet data 재수집.
7. `/`, `/clusters`, `/metrics`, `/incidents`, `/repos` live smoke.

### I. 최종 커밋/푸시/HANDOVER

완료 기준:

- 각 변경 단위가 commit/push됨.
- main AWS CD success.
- live smoke 통과.
- DB reset 결과와 백업 위치가 문서화됨.
- `HANDOVER.md` 최상단에 최종 상태, 남은 위험, 재개 명령이 있음.

## 4. GitHub Actions 운영 메모

자주 쓰는 명령:

```bash
gh run list --repo Jungle-303-04/final --branch dev --limit 8
gh run list --repo Jungle-303-04/final --branch main --limit 8
gh run view <run-id> --repo Jungle-303-04/final --json status,conclusion,headSha,jobs
gh run view <run-id> --repo Jungle-303-04/final --log-failed
```

workflow 해석:

- `dev` push 후 `CI`, `Promote Dev To Main`, `AWS CD`가 돈다.
- Promote가 성공하면 main merge commit이 생성되고 main AWS CD workflow_dispatch가 추가로 뜬다.
- AWS CD는 concurrency 때문에 이전 run을 cancel할 수 있다. 최신 run이 성공하면 이전 cancel은 정상이다.

## 5. 로컬 AWS/kubectl 메모

현재 로컬에서 `kubectl` 조회 시 AWS SSO 만료가 발생할 수 있다.

```text
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
Unable to connect to the server: getting credentials: exec: executable aws failed with exit code 255
```

이 상태에서 할 일:

1. GitHub Actions CD/smoke 결과를 우선 확인한다.
2. 로컬 AWS 환경변수나 SSO 재인증이 가능하면 재인증 후 `kubectl`을 사용한다.
3. secret 값은 절대 출력하지 않는다.

확인 명령 예:

```bash
kubectl config current-context
kubectl -n management get deploy
kubectl -n management get pods
kubectl -n management rollout status deploy/api-gateway --timeout=180s
kubectl -n management rollout status deploy/console --timeout=180s
```

## 6. 라이브 smoke 체크리스트

최신 main AWS CD가 끝난 뒤 수행한다.

```bash
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
curl --max-time 8 -fsS https://k8s.woonyong.org/ >/tmp/k8s-root.html
curl -i --max-time 8 https://k8s.woonyong.org/api/providers/cluster-discovery
```

기대:

- healthz 200.
- `/` 200.
- provider cluster-discovery 비로그인 호출은 401.

로그인 smoke는 cookie jar로 수행한다. 예시는 형태만 남긴다.

```bash
cookie_jar="$(mktemp)"
curl -sS -c "$cookie_jar" -H 'content-type: application/json' \
  -H 'x-service-csrf: same-origin' \
  -d '{"email":"<env AUTH_EMAIL>","password":"<env AUTH_PASSWORD>"}' \
  https://k8s.woonyong.org/api/auth/login

curl -sS -b "$cookie_jar" https://k8s.woonyong.org/api/auth/session
curl -sS -b "$cookie_jar" https://k8s.woonyong.org/api/providers/cluster-discovery
```

문서나 로그에 실제 email/password/token을 쓰지 않는다.

## 7. 다음 구현 후보 우선순위

1. 최신 main AWS CD 완료 확인.
2. provider admin live smoke.
3. incident/DLQ 증가율 live 확인.
4. GitOps poller DB watch target 순회 구현.
5. Helm/Kustomize render validation 실제화.
6. cluster preflight Kubernetes 연결성 검증.
7. 프론트 live E2E와 responsive polish.
8. DB backup/snapshot 절차 구현 또는 런북 확정.
9. 최종 DB reset.
10. 클러스터/레포 재등록 및 데이터 재수집.

## 8. 파일 소유권과 예상 write set

### GitOps poller DB watch target

예상 write set은 explorer 결과를 확인한 뒤 확정한다. 후보:

- GitHub poller worker 파일.
- GitOps repository/application DB access 파일.
- application/watch target 생성 로직.
- 관련 tests.
- `HANDOVER.md`.

주의:

- env fallback은 local/dev bootstrap 호환용으로 남겨도 되지만, production path는 DB registered watch target을 우선해야 한다.
- DB migration 파일이 없다면 기존 `Database().init()` schema와 repository method를 맞춰야 한다.

### DB reset/runbook

예상 write set:

- `docs/aws-testing-runbook.md` 또는 별도 ops 문서.
- 필요하면 `scripts/` 아래 안전한 backup/reset helper.
- helper를 만들면 dry-run/default-safe 옵션 필수.
- `HANDOVER.md`.

주의:

- destructive command는 dry-run 없이 기본 실행되면 안 된다.
- full `aws-up.sh` 재사용 금지. 필요한 함수만 격리한다.

## 9. 장애 대응 판단 기준

### healthz 502

1. 최신 AWS CD deploy 중이면 1~2분 재시도.
2. deploy 종료 후에도 502면 `gh run view --log-failed`.
3. CD success인데 502면 kubectl로 api-gateway/console rollout, service endpoints, ingress/load balancer를 확인.

### 신규 incident 증가

1. 신규 row의 event type/body를 확인한다.
2. `incident.detected`의 `detected=false`가 projection/read model에 보이면 regression.
3. `rca.followup.required`가 정상 snapshot만으로 계속 생기면 incident-worker/feedback-worker regression.
4. 실제 crash/alert 기반이면 정상 incident일 수 있으므로 원인 분류 후 조치.

### DLQ 증가

1. worker/source/error message별 group count를 본다.
2. 같은 stale schema error가 과거 timestamp라면 archive 후보.
3. 최신 timestamp와 동일 worker가 계속 실패하면 코드/contract mismatch를 먼저 수정.
4. replay는 idempotency와 side effect 확인 전 실행하지 않는다.

## 10. 문서 갱신 규칙

매 반복마다 다음을 갱신한다.

1. `HANDOVER.md` 최상단 최신 업데이트.
2. 이 문서의 "현재 상태 요약" 또는 새 결과.
3. 관련 spec/API/FD 문서.
4. 검증 명령과 결과.
5. 남은 위험과 다음 명령.

커밋 전 확인:

```bash
git status --short
git diff --check
```

가능하면 문서 링크 체크 또는 docs 관련 테스트도 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_docs_index.py tests/test_fd_docs_links.py
```
