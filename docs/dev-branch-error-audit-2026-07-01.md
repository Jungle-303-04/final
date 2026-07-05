# dev branch 오류 감사 기록 - 2026-07-01

이 문서는 `docs/demo-recovery-2026-07-01.md`를 읽은 뒤, 현재 로컬 `dev`
브랜치와 연결된 대시보드 데모 런타임을 분석해 찾은 오류/위험을 정리한다.

## 기준 상태

- 백엔드 repo: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final`
- 현재 브랜치: `dev`
- 원격 기준: `origin/dev`보다 3커밋 ahead
- 추가 미커밋 변경:
  - `deploy/management/kustomization.yaml`
  - `deploy/management/services.yaml`
  - `scripts/up.sh`
  - `src/packages/config/constants.py`
  - `src/services/gateway/api-gateway/gateway.py`
  - `deploy/management/rbac.yaml` untracked
  - `src/domains/fleet_console/` untracked
  - `docs/demo-recovery-2026-07-01.md` untracked
- 대시보드 repo: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final-dashboard`
- 대시보드 브랜치: `demo/v1`
- 대시보드 미커밋 변경: `dashboard/index.html`

검증 결과:

- `uv run ruff check src tests`: 통과
- `uv run python -m compileall -q src`: 통과
- `uv run pytest -q`: 211 passed
- `npm run build` in dashboard: 실패. Volta가 Yarn을 제공하지 않음.
- 현재 Docker daemon: 내려가 있음. `kind get clusters`와 `docker ps`가 Docker socket
  연결 실패.
- 현재 `kind-management` kubeconfig endpoint: `https://127.0.0.1:52465`, API
  연결 실패.

## P0 - 반드시 먼저 처리할 오류

### 1. 데모 복구 핵심 코드가 dev에 완전히 반영되지 않았다

증거:

- `src/domains/fleet_console/`가 untracked다.
- `deploy/management/rbac.yaml`가 untracked다.
- `gateway.py`는 `domains.fleet_console.router`를 import하도록 수정되어 있지만,
  해당 패키지는 Git에 추적되지 않는다.
- `deploy/management/kustomization.yaml`은 `rbac.yaml`을 참조하지만,
  `rbac.yaml`은 untracked다.

영향:

- 다른 AI/팀원이 `origin/dev`만 받아서 실행하면 `/fleet-console/*` API가 없거나,
  Gateway import가 깨지거나, management canvas RBAC가 빠진다.
- 현재 로컬에서만 일부 복구된 상태라 재현성이 없다.

우선 조치:

- `src/domains/fleet_console/`, `deploy/management/rbac.yaml`, 관련 gateway/kustomize
  변경을 한 단위로 커밋하거나, dev 기준에서 제거할지 결정해야 한다.
- 다른 AI에게 넘길 때는 "origin/dev"가 아니라 "로컬 dev + untracked 파일 포함"임을
  명시해야 한다.

### 2. 모든 서비스/워커가 startup 때 DB DDL을 동시에 실행한다

증거:

- `src/packages/storage/database.py`의 `wait_for_database()`는 `db.init()`을 호출한다.
- Gateway는 lifespan에서 `wait_for_database(self.db)`를 호출한다.
- WorkerRuntime도 run 시작 시 `wait_for_database(self.db)`를 호출한다.
- `src/packages/storage/engine.py`의 `Database.init()`은
  `metadata.create_all()`과 `ensure_compatible_schema()`를 실행한다.
- `ensure_compatible_schema()`는 여러 `alter table`, `update`, `create index`,
  backfill을 매 startup마다 실행한다.

영향:

- Gateway와 13개 이상의 worker가 동시에 재시작되면 Postgres DDL lock 경합,
  startup 지연, rollout timeout, liveness restart cascade가 발생한다.
- 문서에 기록된 "Gateway startup 멈춤", "worker 동시 흔들림", "control-plane
  부하"와 직접 연결된다.

우선 조치:

- 서비스 startup에서는 `SELECT 1` 또는 schema version 확인만 수행한다.
- DDL/마이그레이션은 단일 Job, advisory lock, 또는 명시적 migration command로 분리한다.
- `wait_for_database()` 이름도 실제 역할에 맞게 `wait_for_ready_database()`와
  `migrate_database_once()`로 분리한다.

### 3. GitHub 토큰 방어가 fleet_console API에만 있고 poll/render worker에는 없다

증거:

- `src/domains/fleet_console/router.py`에는 `usable_github_token()`이 있어 `<TOKEN>`,
  한글 placeholder, non-ASCII 토큰을 버린다.
- `src/services/gitops/github-poll-worker/poller.py`의 `_github_headers()`는
  `self.token`이 있으면 그대로 `Authorization: Bearer ...`를 만든다.
- `src/services/gitops/manifest-render-worker/app.py`도 `GITHUB_TOKEN`이 있으면
  그대로 `Authorization` 헤더에 넣는다.

영향:

- UI manifest fetch 500은 줄어도, CronJob poller나 manifest-render-worker는 같은
  placeholder 토큰으로 계속 실패할 수 있다.
- GitHub API 요청 생성 단계에서 non-ASCII header 예외가 발생할 수 있다.
- 화면에는 `github-poll-worker-* 실패` Job이 계속 남는다.

우선 조치:

- 토큰 검증 함수를 공용 모듈로 옮긴다.
- Gateway, poll-worker, manifest-render-worker, scripts/up.sh가 모두 같은 검증을
  쓰도록 만든다.
- 잘못된 토큰은 Secret에서 제거하고, worker에는 "무토큰 public read" 또는 명확한
  access denied 상태를 기록하게 한다.

### 4. 현재 런타임은 Docker/kind가 내려가 있어 실제 클러스터 데이터가 뜰 수 없다

증거:

- `docker ps`: Docker socket 연결 실패.
- `kind get clusters`: Docker API 연결 실패.
- `kubectl --context kind-management ...`: `127.0.0.1:52465 connection refused`.

영향:

- management cluster canvas가 `0/0`으로 보이거나 서비스 계정 대기로 보일 수 있다.
- worker 상태, GitHub poll job, Gateway 로그를 더 이상 신뢰할 수 없다.
- 발표/시연 흐름은 프론트 문제가 아니라 런타임 기반이 내려간 상태에서 시작된다.

우선 조치:

- Docker Desktop을 먼저 올린다.
- `kind get clusters`가 정상인지 확인한다.
- kubeconfig endpoint가 살아 있는지 확인한다.
- 그 다음 `make up` 또는 최소 `kubectl rollout status`를 수행한다.

### 5. UI 워크플로우 실행이 실제 Git commit SHA가 아닌 가짜 ref를 만든다

증거:

- `src/domains/fleet_console/router.py`의 `accept_gitops_change()`는
  `commit_sha=f"fleet-console-{uuid4().hex}"`를 넣는다.
- `manifest-render-worker`는 GitHub contents API를 호출할 때 `commit_sha`를 `ref`로
  사용한다.
- `GIT_REMOTE_MANIFEST_REQUIRED=1`이면 해당 ref가 GitHub에 존재하지 않을 때
  `ManifestSourceError`가 발생한다.

영향:

- UI에서 "워크플로우 실행" 또는 "변경 비교 생성"을 눌러도 실제 GitHub ref가 아니므로
  remote manifest render가 실패할 수 있다.
- 사용자는 버튼이 눌린 것처럼 보지만 GitOps pipeline은 invalid config로 빠진다.

우선 조치:

- UI initiated diff/workflow는 현재 branch HEAD SHA를 먼저 조회해서 넣는다.
- 또는 manifest content를 이벤트 payload에 포함해 render-worker가 GitHub ref 조회 없이
  렌더하도록 별도 경로를 둔다.
- 가짜 commit id는 demo UI 표시용으로만 쓰고 GitOps event contract에는 넣지 않는다.

## P1 - 데모 품질과 안정성을 깨는 오류

### 6. Application upsert conflict target과 event identity가 충돌했다

증거:

- `applications` 테이블 unique constraint는 `(workspace_id, repository_id, name)`이다.
- 과거 `git.webhook.received`와 `git.changed`가 같은 repo/app 이름을 서로 다른
  `application_id`로 만들 수 있었다.
- 그 상태에서 `upsert_application()`이 `application_id` conflict만 처리하면
  `(workspace_id, repository_id, name)` duplicate key 오류가 났다.

영향:

- 같은 repo/app 이름이 반복 이벤트로 들어올 때 workflow-controller가 DLQ로 빠졌다.
- dashboard/read model에는 같은 앱 흐름이 끊긴 것처럼 보일 수 있었다.

현재 조치:

- `derive_application_id()`가 `name/app_name`이 없으면 `repo_ref`의 repo 이름을 app 이름
  힌트로 사용한다.
- `RepoChangeRepository.upsert_application()`은 먼저
  `(workspace_id, repository_id, name)`으로 기존 앱을 찾고, 있으면 그
  `application_id`를 canonical 값으로 반환한다.
- workflow-controller는 `upsert_application()`이 반환한 canonical `application_id`로
  `workflow_run_id`를 다시 계산한다.
- 관련 검증은 `tests/test_database_unit.py`, `tests/test_git_pull_worker.py`,
  `tests/test_workflow_controller.py`에 있다.

### 7. demo repo/application 기본값이 여러 곳에서 불일치한다

증거:

- `scripts/up.sh` 기본값은 `Jungle-303-04/final`, branch `dev`,
  manifest `dashboard/config/kubernetes/desired-manifest.yaml`.
- 계약 기본값은 `octocat/Hello-World`, branch `main`, manifest `deploy.yaml`.
- target registration은 `checkout-api` Deployment를 하드코딩한다.
- 사용자는 `Jungle-303-04` 데모 repo 2개, 선택/전환, pod 수 변경 감지를 요구했다.

영향:

- 화면에는 `checkout-api`, `payments-api`, `Jungle-303-04/fleet-demo-*`,
  `octocat/Hello-World`, `Jungle-303-04/final`이 섞일 수 있다.
- manifest edit와 poll-worker가 서로 다른 repo/path를 바라볼 수 있다.

우선 조치:

- demo workspace seed를 하나 만들고 repo 2개, app 2개, binding 2개, watch target 2개를
  같은 source of truth에서 생성한다.
- 계약 기본값은 demo 흐름에 직접 노출되지 않게 한다.

### 8. `payments-api`는 화면에 보이지만 manifest context가 등록되지 않을 수 있다

증거:

- 문서에 `payments-api` manifest 조회 시
  `application is not registered in workspace: payments-api`가 기록되어 있다.
- `resolve_deployment_context()`는 binding, application, repository 순서로 찾고,
  application이 없으면 409를 반환한다.

영향:

- 사용자가 앱 선택을 바꾸면 manifest panel이 바로 409/500처럼 보인다.
- 데모 repo 2개 선택 시나리오가 끊긴다.

우선 조치:

- UI에 노출되는 앱은 반드시 Application/GitRepository/DeploymentBinding/GitWatchTarget이
  모두 등록되어야 한다.
- 등록되지 않은 앱은 선택 불가로 표시하거나 seed에서 제거한다.

### 9. `resolve_deployment_context()`가 watch target 누락을 실패로 처리하지 않는다

증거:

- `resolve_deployment_context()`는 `GitWatchTarget`을 조회하지만, 없으면
  `watch_target_id`를 빈 문자열로 반환할 수 있다.

영향:

- 이후 GitOps event가 빈 watch target으로 흘러 downstream dedup, last seen commit,
  poll state가 꼬일 수 있다.
- 화면에는 이벤트가 들어간 것처럼 보이지만 30초 polling 감지/반영 설명과 맞지 않는다.

우선 조치:

- binding에 watch_target_id가 없고 matching watch target도 없으면 409로 막는다.
- app/repo/binding/watch target을 함께 upsert하는 registration API를 만든다.

### 10. SSE 실패 시 frontend가 fallback polling을 하지 않는다

증거:

- `FleetConsoleContext.tsx`는 EventSource error에서 `isStreaming=false`만 설정한다.
- 최초 `refresh()` 이후 stream이 끊기면 주기적 polling으로 회복하지 않는다.

영향:

- 백엔드가 복구되어도 화면의 progress bar, pod count, graph가 멈춘 것처럼 보인다.
- 사용자가 "백엔드는 움직였는데 UI 피드백이 없다"고 느끼는 원인이다.

우선 조치:

- SSE error 상태에서는 1~2초 간격 fallback polling을 돌린다.
- SSE open 시 fallback을 중지한다.
- action 요청 후에는 optimistic state와 서버 확정 state를 분리해서 보여준다.

### 11. 60fps SSE 요구는 현재 서버 구현과 맞지 않는다

증거:

- `src/domains/fleet_console/router.py`의 `STREAM_TARGET_FPS`는 1이고 interval도 1초다.
- 과거 60fps 요구는 DB/Kubernetes/GitHub 조회를 직접 매 frame 수행하면 컨트롤 플레인을
  망가뜨릴 수 있어 현재 낮춰져 있다.

영향:

- UI가 "실시간"처럼 보이지 않는 문제와 연결된다.
- 반대로 60fps로 서버 snapshot을 보내면 DB/Kubernetes API에 과부하가 난다.

우선 조치:

- 서버 SSE는 state delta를 1~2Hz로 보내고, 프론트 animation/progress만 60fps로 보간한다.
- 서버가 `frame`을 보내더라도 실제 데이터 조회는 throttle/cache한다.

### 12. CronJob 기반 github-poll-worker는 30초 시나리오와 맞지 않는다

증거:

- `deploy/management/github-poll-worker.yaml` schedule은 `*/1 * * * *`다.
- 주석에도 CronJob 최소 granularity가 1분이라고 되어 있다.
- settings의 poll interval 30초는 daemon mode에서만 의미가 있다.

영향:

- "커밋하면 30초 뒤 polling 반영" 시나리오와 실제 CronJob 설정이 모순된다.

우선 조치:

- 시연용은 Deployment daemon mode로 전환하거나, 문구를 1분으로 고친다.
- 빠른 시연 버튼은 poller 직접 트리거 API/Job create를 별도로 제공한다.

### 13. GitHub poll 실패 Job이 UI에 그대로 노출된다

증거:

- CronJob은 `failedJobsHistoryLimit: 3`으로 실패 Job을 남긴다.
- 사용자가 캔버스에서 `github-poll-worker-* 실패` 카드를 확인했다.

영향:

- 과거 실패가 현재 장애처럼 보인다.
- 데모 중에는 "아직 고장"으로 보인다.

우선 조치:

- UI에서 Job은 Deployment/Pod와 별도 lane으로 분리한다.
- 과거 failed Job은 "최근 실패 이력"으로 접고, 현재 active Job과 구분한다.
- 데모 복구 후 과거 실패 Job을 정리한다.

### 14. Gateway readiness는 runtime patch보다 약한 값으로 파일에 남아 있다

증거:

- `deploy/management/services.yaml`의 api-gateway readiness는 timeout 5초, failure 6이다.
- 문서에는 runtime에서 더 넓힌 probe가 필요했던 흐름이 기록되어 있다.

영향:

- control-plane이 느릴 때 api-gateway가 준비되기 전에 rollout timeout 또는 endpoint churn이
  다시 생길 수 있다.

우선 조치:

- Gateway readiness도 worker liveness와 같은 데모 안정성 기준으로 정리한다.
- 더 중요한 것은 startup DDL 제거다.

### 15. `scripts/up.sh`가 모든 worker를 동시에 rollout restart한다

증거:

- `scripts/up.sh`는 api-gateway부터 모든 worker를 한 번에 `rollout restart`한다.
- startup은 아직 DB init/DDL을 포함한다.

영향:

- DB lock, NATS reconnect, EndpointSlice churn, liveness timeout이 동시에 발생한다.
- 문서에 기록된 stale endpoint/rollout timeout이 재현될 수 있다.

우선 조치:

- migration 분리 후에도 rollout 순서를 Gateway, core dependencies, worker batch로 나눈다.
- worker는 2~3개씩 순차 restart하거나 readiness/health 확인 후 진행한다.

## P2 - 제품/UI 완성도를 떨어뜨리는 오류

### 16. frontend build 환경이 고정되어 있지 않다

증거:

- `npm run build`는 내부에서 `yarn design-system:build`를 호출한다.
- 현재 Volta 환경은 Node는 있지만 Yarn default가 없어 실패한다.
- `packageManager`는 `yarn@3.6.0`이다.

영향:

- 다른 사람 환경에서 프론트 빌드가 바로 실패한다.

우선 조치:

- repo에 Corepack 사용 절차를 명시하거나, `volta pin yarn@3.6.0` 또는 package manager
  bootstrap을 스크립트화한다.
- `make dashboard-build` 같은 단일 명령을 제공한다.

### 17. action 버튼이 비동기 중복 실행을 막지 않는다

증거:

- cluster canvas의 Pod 1/Pod 3/배포/이미지/삭제 버튼은 onClick에서 바로 async action을
  호출하지만, per-button pending/disabled 상태가 없다.
- Provider의 `runAction()`은 전역 lastAction만 바꾼다.

영향:

- 같은 버튼을 여러 번 누르면 command/event가 중복 생성될 수 있다.
- 진행 중 피드백이 전역 문구 하나뿐이라 사용자가 어떤 노드가 바뀌는지 알기 어렵다.

우선 조치:

- application/action별 pending key를 둔다.
- 버튼 disabled, node-level spinner, request id, accepted event id를 표시한다.

### 18. cluster/action canvas가 빈 상태를 설명하지 않는다

증거:

- ManagementCanvas는 nodes/deployments/pods가 비어 있으면 빈 column만 렌더링한다.
- 사용자는 "캔버스 어디있어", "관리 서버가 안뜬다"라고 보고했다.

영향:

- RBAC 문제인지 Docker/kind 문제인지, 데이터가 없는 것인지 구분되지 않는다.

우선 조치:

- empty state에 원인(`management.available`, `reason`, Docker/kind/Gateway 상태)을 노출한다.
- "서비스 계정 대기" 같은 추상 문구 대신 실제 실패 이유를 짧게 보여준다.

### 19. product naming과 데모 naming이 섞여 있다

증거:

- frontend package name은 `plural-fleet-console`.
- backend manifest label은 `managed-by: plural-fleet-console`.
- user-facing 요구는 Plural frontend 활용이지만, 화면 상단의 불필요한 Plural 제목은 제거해야
  한다는 요구가 있었다.

영향:

- "Plural 소스 활용"과 "우리 서비스로 보이기"가 섞여 데모 메시지가 흔들린다.

우선 조치:

- 내부 패키지명과 사용자 표시명을 구분한다.
- 화면 표시명은 우리 서비스 이름/기능명으로 고정하고, Plural 관련 표시는 코드 provenance로만
  남긴다.

## 다른 AI에게 바로 넘길 디버그 순서

1. Docker Desktop을 올리고 `docker ps`, `kind get clusters`를 먼저 정상화한다.
2. 백엔드 repo에서 untracked 핵심 파일 포함 여부를 확인한다.
3. `src/domains/fleet_console/`와 `deploy/management/rbac.yaml`을 커밋 대상에 포함한다.
4. `GITHUB_TOKEN` Secret 값을 검증한다. placeholder, 한글, `<TOKEN>`은 모두 제거한다.
5. poll-worker와 manifest-render-worker에도 동일한 token sanitizer를 적용한다.
6. `wait_for_database()`에서 DDL을 제거하고 migration을 단일 실행으로 분리한다.
7. demo workspace seed를 만들어 checkout/payments 또는 A/B repo가 모두 등록되게 한다.
8. UI SSE fallback polling과 per-action pending feedback을 추가한다.
9. `npm run build`가 되도록 Yarn/Corepack/Volta 설정을 고정한다.
10. 마지막에 `make up`, `uv run pytest -q`, dashboard build, 로그인, manifest fetch/push,
    pod scale 시나리오를 순서대로 E2E 검증한다.
