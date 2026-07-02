# 2026-07-01 Dashboard Demo 장애/복구 기록

이 문서는 2026-07-01 데모 준비 중 발생한 대시보드, Gateway, GitHub, Kubernetes, worker, 프론트 UI 문제를 증상, 원인, 조치, 남은 위험으로 정리한 기록이다.

민감한 GitHub 토큰 값은 기록하지 않는다. 아래에서 말하는 토큰은 로컬 `gh auth token` 또는 Kubernetes Secret `management-runtime-secret/GITHUB_TOKEN`에 들어가는 값을 의미한다.

## 바로 시연 전 체크

아래가 모두 만족되어야 시연 화면이 정상적으로 뜬다.

```bash
cd ~/workspace/Krafton-Jungle/SW_AI_W17-21-final

# 1. 프론트 서버
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -fsS --max-time 5 http://localhost:5173/ >/dev/null

# 2. Gateway 포트포워드
lsof -nP -iTCP:18080 -sTCP:LISTEN
curl -fsS --max-time 5 http://localhost:18080/readyz
curl -fsS --max-time 5 http://localhost:5173/gateway/readyz

# 3. Gateway / worker
kubectl --context kind-management -n management get deploy \
  -o custom-columns=NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas

# 4. Gateway Service endpoint
kubectl --context kind-management -n management get endpoints api-gateway -o wide

# 5. GitHub token 존재 여부
kubectl --context kind-management -n management get secret management-runtime-secret \
  -o jsonpath='{.data.GITHUB_TOKEN}' | wc -c

# 6. state API
cookie=$(mktemp)
curl -fsS --max-time 10 -c "$cookie" \
  -H 'content-type: application/json' \
  -X POST http://localhost:5173/gateway/auth/login \
  --data '{"email":"temp24qw@example.com","password":"temp24qw"}'
curl -fsS --max-time 20 -b "$cookie" \
  http://localhost:5173/gateway/fleet-console/state
```

시연 중 브라우저가 `ERR_CONNECTION_REFUSED`를 보이면 대부분 `5173` Vite 서버가 죽은 것이다. `screen`으로 다시 띄운다.

```bash
screen -S fleet-dashboard -X quit >/dev/null 2>&1 || true
screen -dmS fleet-dashboard zsh -lc \
  'cd ~/workspace/Krafton-Jungle/SW_AI_W17-21-final-dashboard/dashboard && npm run dev -- --host 0.0.0.0'
```

`/gateway/*`만 500 또는 timeout이면 `18080` 포트포워드를 다시 잡는다.

```bash
pkill -f 'kubectl.*port-forward.*api-gateway.*18080' || true
kubectl --context kind-management -n management port-forward svc/api-gateway 18080:8000
```

## 최종 확인된 상태

- Vite dev server는 `localhost:5173`에서 떠야 한다.
- Gateway 직접 포트포워드는 `localhost:18080`이다.
- Vite proxy는 `/gateway/*`를 `localhost:18080`으로 넘긴다.
- `api-gateway` Deployment는 `READY 1/1`이어야 한다.
- 주요 worker Deployment는 모두 `DESIRED 1` 유지가 목표다.
- `github-poll-worker`는 Deployment가 아니라 CronJob/Job이다. 실패한 과거 Job 카드가 UI에 남을 수 있다.
- `management-cluster` 캔버스는 Gateway ServiceAccount RBAC와 `/fleet-console/state`의 `metrics.management` 데이터에 의존한다.

## 핵심 장애 요약

가장 크게 문제가 된 축은 7개였다.

1. GitHub 토큰 placeholder가 실제 Secret에 들어가 GitHub API 헤더 생성 시 500을 냈다.
2. 유효한 GitHub 쓰기 토큰이 없어서 manifest push가 409로 막혔다.
3. Gateway ServiceAccount가 잘못되어 management Kubernetes 리소스를 읽지 못했다.
4. EndpointSlice와 port-forward가 stale 상태가 되어 Gateway가 떠 있어도 브라우저가 죽은 endpoint를 물었다.
5. Redis half-open connection과 DB startup/DDL deadlock 때문에 로그인과 Gateway startup이 멈췄다.
6. worker liveness probe가 기본 1초 timeout이라 부하 상황에서 worker가 재시작 폭주했다.
7. Vite dev server가 일반 background 프로세스로 떠 있다가 죽어 `localhost:5173` 자체가 내려갔다.

## 상세 장애 목록

### 1. `GITHUB_TOKEN` placeholder로 인한 manifest 조회 500

증상:

- 매니페스트 편집 패널에서 `500 internal server error`.
- 화면의 푸시 상태 카드에 `500 internal server error`.
- Gateway 로그에 다음 예외가 반복됐다.

```text
UnicodeEncodeError: 'ascii' codec can't encode characters
...
headers["authorization"] = f"Bearer {token}"
```

원인:

- `GITHUB_TOKEN`에 실제 토큰이 아니라 `ghp_여기에실제토큰` 같은 한글 placeholder가 들어갔다.
- HTTP header 값은 ASCII로 normalize되는데 한글이 포함되어 `httpx`가 요청 객체 생성 단계에서 터졌다.
- 이 경우 GitHub까지 요청이 가지도 못하고 Gateway 내부 500이 발생했다.

조치:

- `src/domains/fleet_console/router.py`에 `usable_github_token()` 방어를 추가했다.
- 빈 토큰, `<TOKEN>` 형태, `ghp_여기...` placeholder, 비ASCII 토큰은 사용하지 않도록 했다.
- public repo manifest 읽기는 토큰 없이 가능하게 했다.
- push처럼 토큰이 필요한 API는 500 대신 409와 명확한 메시지를 반환하게 했다.

재발 방지:

- `scripts/up.sh`가 placeholder/비ASCII 토큰을 Secret에 넣지 않도록 해야 한다.
- `make up` 재실행 시 기존 정상 토큰을 보존해야 한다.
- Secret 주입 전 아래 검사를 통과해야 한다.

```bash
token="$(gh auth token)"
python3 - "$token" <<'PY'
import sys
t = sys.argv[1]
assert t and "<" not in t and ">" not in t
t.encode("ascii")
print("ok")
PY
```

### 2. manifest push 409: 유효한 GitHub 쓰기 토큰 없음

증상:

```text
409 GitHub에 푸시하려면 유효한 GITHUB_TOKEN이 필요합니다.
```

원인:

- 위 500을 막기 위해 잘못된 토큰을 제거하자, 읽기는 가능해졌지만 push에는 토큰이 필요했다.
- 로컬 `gh`에는 `woonyong-kr` 계정이 로그인되어 있고 `repo` scope가 있었지만, Kubernetes Secret에는 토큰이 빠져 있었다.

조치:

- `gh auth token`으로 로컬 토큰을 가져와 Secret `management-runtime-secret/GITHUB_TOKEN`에 주입했다.
- 값 자체는 출력하거나 문서에 기록하지 않았다.

검증해야 할 명령:

```bash
kubectl --context kind-management -n management get secret management-runtime-secret \
  -o jsonpath='{.data.GITHUB_TOKEN}' | wc -c
```

정상이라면 0보다 큰 값이 나온다.

주의:

- 토큰이 들어간 뒤에는 Gateway pod가 새 Secret을 읽도록 재시작되어야 한다.
- 이전 Gateway pod가 endpoint로 남아 있으면 여전히 409가 보일 수 있다.

### 3. `payments-api` manifest 409: application 미등록

증상:

`payments-api`를 선택한 상태로 매니페스트를 열면 다음 응답이 나왔다.

```json
{"detail":"application is not registered in workspace: payments-api"}
```

원인:

- Gateway의 manifest API는 현재 workspace에 등록된 Application/DeploymentBinding을 기준으로 context를 찾는다.
- `checkout-api`는 `Jungle-303-04/fleet-demo-checkout` / `deploy.yaml`로 등록되어 정상 조회됐다.
- `payments-api`는 화면에는 보이지만 workspace application registry에는 같은 방식으로 등록되어 있지 않았다.

조치:

- `checkout-api` manifest 조회는 200을 확인했다.
- `payments-api`는 별도 등록 또는 시연에서 선택 앱을 `checkout-api`로 고정해야 한다.

재발 방지:

- 데모 앱 2개를 보여줄 경우 `payments-api`, `checkout-api` 모두 Application, GitRepository, DeploymentBinding, GitWatchTarget이 일관되게 등록되어야 한다.
- 프론트는 등록되지 않은 앱을 manifest edit 대상으로 선택하지 않도록 해야 한다.

### 4. Gateway에 `/fleet-console` router가 연결되지 않음

증상:

- 프론트는 `/gateway/fleet-console/state`, `/gateway/fleet-console/manifest`, `/gateway/fleet-console/stream`을 호출했다.
- 실제 backend Gateway에 해당 router가 없으면 404/500/빈 화면 흐름으로 이어질 수 있었다.

원인:

- dashboard repo 쪽에는 `fleet_console` 도메인 router가 있었지만, 실제 runtime backend repo의 Gateway 조립에는 포함되지 않았다.

조치:

- `src/domains/fleet_console/`을 backend repo로 가져왔다.
- `src/services/gateway/api-gateway/gateway.py`에서 `fleet_console_router`를 include했다.

재발 방지:

- 프론트 API surface와 Gateway route registration을 E2E smoke test로 묶어야 한다.
- 최소 체크:

```bash
curl -fsS http://localhost:5173/gateway/fleet-console/state
curl -fsS http://localhost:5173/gateway/fleet-console/manifest?application=checkout-api\&cluster=target-cluster-01\&namespace=sandbox\&branch=main
```

### 5. management canvas 0/0: ServiceAccount 불일치

증상:

- 관리 클러스터 캔버스가 `0/0개 Pod 실행 중`.
- 화면 오른쪽에 `서비스 계정 대기`.
- Gateway 로그에 Kubernetes API 403이 찍혔다.

```text
GET /apis/apps/v1/namespaces/management/deployments 403 Forbidden
```

원인:

- `ClusterRoleBinding api-gateway-management-viewer`는 `management:api-gateway` ServiceAccount에 묶여 있었다.
- 실제 `api-gateway` Deployment는 `serviceAccountName`이 없어서 `management:default`로 실행 중이었다.
- 권한 리소스가 있어도 pod가 다른 ServiceAccount로 떠서 권한이 없었다.

조치:

- `deploy/management/rbac.yaml`을 추가했다.
- `deploy/management/services.yaml`의 `api-gateway` Deployment에 `serviceAccountName: api-gateway`를 추가했다.
- runtime에서도 patch하여 `can-i`가 모두 yes가 되게 했다.

검증:

```bash
kubectl --context kind-management auth can-i list deployments -n management \
  --as=system:serviceaccount:management:api-gateway
kubectl --context kind-management auth can-i list pods -n management \
  --as=system:serviceaccount:management:api-gateway
kubectl --context kind-management auth can-i list nodes \
  --as=system:serviceaccount:management:api-gateway
```

### 6. EndpointSlice stale: Gateway는 Ready인데 Service endpoint가 비거나 과거 IP를 가리킴

증상:

- `api-gateway` pod는 `1/1 Running`.
- `kubectl get endpoints api-gateway`는 `<none>` 또는 이전 IP를 표시.
- 브라우저/Vite proxy는 500, reset, timeout을 반복했다.

원인:

- 강제 pod 삭제, 여러 ReplicaSet 동시 존재, control-plane 부하가 겹치면서 EndpointSlice가 stale 상태가 되었다.
- Service selector와 pod label은 맞는데 EndpointSlice의 `endpoints`가 null인 상황도 있었다.

조치:

```bash
kubectl --context kind-management -n management delete endpointslice \
  -l kubernetes.io/service-name=api-gateway
```

EndpointSlice를 지우면 controller가 새 endpoint를 재생성했다.

검증:

```bash
kubectl --context kind-management -n management get endpoints api-gateway -o wide
```

정상 예:

```text
api-gateway   10.244.0.87:8000
```

### 7. port-forward stale: Gateway는 살아 있는데 `localhost:18080`이 reset

증상:

- Cluster 안 endpoint는 정상.
- `curl http://localhost:18080/readyz`는 `Connection reset by peer`.
- `localhost:5173/gateway/*`는 Vite proxy를 거쳐 500 또는 timeout.

원인:

- 기존 `kubectl port-forward svc/api-gateway 18080:8000` 프로세스가 stale connection을 들고 있거나 죽어 있었다.
- Vite proxy는 `localhost:18080`을 target으로 보고 있어서 Gateway가 살아도 브라우저 요청이 실패했다.

조치:

```bash
pkill -f 'kubectl.*port-forward.*api-gateway.*18080' || true
kubectl --context kind-management -n management port-forward svc/api-gateway 18080:8000
```

발표용으로는 별도 터미널 또는 `screen`에 고정해야 한다.

### 8. Vite dev server 종료: `localhost:5173` 자체가 연결 거부

증상:

- 브라우저가 `ERR_CONNECTION_REFUSED`.
- `lsof -iTCP:5173`에 listener가 없었다.

원인:

- `nohup npm run dev ... &`를 `exec_command` 세션 안에서 띄웠지만, 일부 경우 셸 종료와 함께 프로세스도 죽었다.
- 또는 기존 Vite 프로세스를 kill한 뒤 새 프로세스가 유지되지 않았다.

조치:

`screen` 세션으로 Vite를 띄웠다.

```bash
screen -S fleet-dashboard -X quit >/dev/null 2>&1 || true
screen -dmS fleet-dashboard zsh -lc \
  'cd ~/workspace/Krafton-Jungle/SW_AI_W17-21-final-dashboard/dashboard && npm run dev -- --host 0.0.0.0'
```

검증:

```bash
screen -ls
lsof -nP -iTCP:5173 -sTCP:LISTEN
curl -I http://localhost:5173/
```

### 9. Redis half-open connection으로 로그인 무한 대기

증상:

- 로그인 요청이 끝나지 않음.
- DB 조회와 password verify는 통과한 것으로 보이지만 session create 단계에서 멈춤.
- `redis-cli ping`은 새 연결이라 `PONG`을 반환했다.

원인:

- Gateway가 들고 있던 Redis connection이 control-plane restart 또는 endpoint churn 후 half-open 상태가 되었다.
- 기존 Redis client에는 socket timeout이 없어서 `setex`/`get`이 무한 대기할 수 있었다.

조치:

- `src/packages/storage/sessions.py`에 Redis timeout, connect timeout, health check interval, keepalive, retry 설정을 넣었다.

재발 방지:

- Redis session store는 모든 command에 timeout이 있어야 한다.
- 로그인 API는 session store 실패 시 500이 아니라 명확한 503/timeout을 반환해야 한다.

### 10. PostgreSQL PG17 cast 문제로 Gateway startup 실패

증상:

- Gateway가 `Application startup`에서 멈추거나 readiness가 실패했다.
- DB init/migration 구간에서 실패했다.

원인:

- PG17에서 `name[] = text[]` 비교가 실패하는 migration/DDL 구문이 있었다.

조치:

- `src/packages/storage/engine.py`에서 PG17 호환 cast를 적용했다.

재발 방지:

- PostgreSQL 버전별 migration smoke test가 필요하다.

### 11. 여러 worker/Gateway가 동시에 `db.init()`를 실행해 deadlock

증상:

- Gateway 새 pod가 `Waiting for application startup`에서 오래 멈춤.
- PostgreSQL 로그에 deadlock이 찍혔다.

```text
deadlock detected
alter table user_accounts alter column role set default 'member'
```

원인:

- worker들을 한꺼번에 1로 올리면서 여러 프로세스가 동시에 startup DDL을 실행했다.
- 같은 table에 `ALTER TABLE`을 동시에 잡으면서 AccessExclusiveLock deadlock이 발생했다.

임시 조치:

- worker를 순차로 올리거나, Gateway를 우선 안정화한 뒤 worker를 올렸다.
- idle transaction을 확인하고 필요 시 종료했다.

재발 방지:

- 모든 서비스 startup에서 DDL을 실행하면 안 된다.
- DB migration/init는 단일 Job 또는 init-migration 전용 프로세스만 수행해야 한다.
- worker/Gateway는 schema가 준비되었는지만 확인하고 시작해야 한다.

### 12. worker liveness probe 1초 timeout으로 재시작 폭주

증상:

- worker가 실제로 동작 중인데 liveness probe timeout으로 재시작됐다.
- 이벤트에 다음이 반복됐다.

```text
Liveness probe failed: command timed out ... timed out after 1s
```

원인:

- `timeoutSeconds`를 명시하지 않아 Kubernetes 기본값 1초가 적용되었다.
- management control-plane CPU가 높을 때 Python heartbeat check가 1초 안에 못 끝났다.

조치:

- runtime patch로 worker liveness `timeoutSeconds: 10`, `failureThreshold: 6`을 적용했다.
- `deploy/management/services.yaml`에도 동일 설정을 반영했다.

재발 방지:

- heartbeat 파일 검사 같은 liveness probe는 timeout을 5~10초 이상으로 둔다.
- demo 환경에서는 liveness보다 readiness를 우선하고, restart 폭주를 피해야 한다.

### 13. worker를 0으로 내린 부작용

증상:

- UI에 `git-pull-worker 0/0`, `manifest-render-worker 0/0` 등이 보였다.
- 사용자는 "worker 있는데/없는데 왜 안 되냐"로 혼란을 겪었다.

원인:

- control-plane 과부하를 줄이려고 일시적으로 worker들을 0으로 내렸다.
- 데모 요구사항은 worker가 1로 유지되는 것이었다.

조치:

- 주요 worker를 모두 `DESIRED 1`로 복구했다.

최종 요구:

- 발표 중에는 worker Deployment를 절대 0으로 내리지 않는다.
- 문제가 있어도 worker 1 유지 조건에서 Gateway/port-forward/UI만 복구한다.

### 14. `github-poll-worker` 실패 Job 카드가 UI에 남음

증상:

- 화면에 `github-poll-worker-... 실패 · 재시작 0회` 카드가 여러 개 보였다.

원인:

- `github-poll-worker`는 Deployment가 아니라 CronJob이 생성하는 Job/Pod다.
- 실패한 과거 Job/Pod가 남아 UI가 이를 장애처럼 보여줬다.
- CronJob은 한때 잘못된 GitHub token/config 상태에서 실행되어 실패 기록을 만들었다.

조치:

- 실패한 `github-poll-worker-*` Job/Pod 기록을 삭제했다.
- 필요 시 CronJob을 잠시 suspend했다.

주의:

- CronJob을 suspend하면 "Git commit 후 polling 감지" 시나리오는 동작하지 않는다.
- 발표에서 polling을 보여줘야 하면 suspend를 풀고, 한 번 성공 로그를 확인해야 한다.

검증:

```bash
kubectl --context kind-management -n management get cronjob github-poll-worker
kubectl --context kind-management -n management get jobs,pods | grep github-poll
```

### 15. control-plane 과부하

증상:

- `docker stats`에서 `management-control-plane` 또는 `target-control-plane` CPU가 수백 퍼센트까지 올라갔다.
- Kubernetes API 응답이 느려지고, readiness/port-forward/Vite proxy가 흔들렸다.

원인:

- management worker 전체, GitHub poller, target telemetry stack, Gateway SSE/state polling이 동시에 부하를 만들었다.
- target 쪽 Prometheus/Loki 계열도 한때 높은 부하를 만들었다.

조치:

- target telemetry stack 일부를 축소했다.
- worker liveness timeout을 늘렸다.
- SSE 60fps keepalive를 제거/축소하는 패치를 준비했다.

재발 방지:

- 데모 환경에서는 heavy telemetry를 제한한다.
- UI animation은 브라우저에서 60fps로 만들고, 서버 SSE는 1초 단위 state push로 충분하다.

### 16. SSE 60fps 설계 문제

증상:

- 서버가 `/fleet-console/stream`에서 60fps 주석 frame을 계속 보냈다.
- 사용자는 FPS 표시 같은 서비스와 무관한 지표를 싫어했다.
- 서버 이벤트 루프와 Vite proxy에도 부담이 되었다.

원인:

- "빠르게 갱신" 요구를 서버 SSE frame 60fps로 해석했다.
- 실제 운영 대시보드는 서버가 60fps로 데이터를 보내는 구조가 아니라, 서버는 낮은 빈도의 state/event를 보내고 클라이언트가 transition/animation으로 생동감을 만든다.

조치:

- `STREAM_TARGET_FPS`를 1로 낮추고, 의미 없는 frame comment emit을 제거하는 패치를 준비했다.

재발 방지:

- "60fps"는 UI animation/rendering 목표로 해석한다.
- 서버 state stream은 1초 또는 이벤트 발생 기반으로 보낸다.

### 17. management canvas가 0으로 보이는 프론트 매핑/캐시 문제

증상:

- API state는 `management-cluster 17 Healthy`를 반환했다.
- 화면의 관리 클러스터 캔버스는 `0/0개 Pod 실행 중`, `서비스 계정 대기`로 보였다.

원인 후보:

- 프론트가 오래된 SSE/state cache를 들고 있었다.
- `metrics.management` 구조를 컴포넌트가 기대하는 형태로 못 받았거나, 이전 빈 state가 유지되었다.
- EventSource 재연결 실패 후 `refresh()`가 UI에 반영되지 않았을 가능성이 있다.

현재 확인:

- 백엔드 `query_state()`는 `metrics: { ..., "management": management_snapshot }`를 내려주도록 되어 있다.
- 프론트 `ClustersPage`는 `metrics.management.summary/deployments/pods/nodes`를 사용한다.

필요 조치:

- 프론트에서 state refresh 버튼 또는 페이지 진입 시 `refresh()` 강제 호출.
- `metrics.management`가 비어 있으면 `clusters`의 management 요약을 fallback으로 보여주기.
- SSE reconnect 실패 시 polling fallback을 켜기.

### 18. Application 중복 key 오류

증상:

PostgreSQL 로그에 다음이 반복됐다.

```text
duplicate key value violates unique constraint "applications_workspace_id_repository_id_name_key"
Key (workspace_id, repository_id, name)=(default, ..., checkout-api) already exists.
```

원인:

- Application upsert가 `application_id` conflict만 처리한다.
- 실제 unique constraint는 `(workspace_id, repository_id, name)`에도 걸려 있다.
- 같은 앱 이름/레포를 다른 `application_id`로 insert하려 할 때 중복 오류가 난다.

조치 필요:

- Application upsert 기준을 `application_id`만 보지 말고 `(workspace_id, repository_id, name)` 충돌도 처리해야 한다.
- 데모 seed/poller가 매번 새 ID를 만들지 않게 고정 ID를 써야 한다.

### 19. UI/제품 요구사항 불일치

발생했던 주요 지적:

- `ReleaseGraph` 명칭이 남아 있었다. 요구사항은 Plural 기반 UI이며 ReleaseGraph 명칭 제거.
- 로그인 화면에 `Plural` 제목/불필요한 설명 문구가 있었다.
- dark mode가 남아 있었다. 요구사항은 light mode.
- hash/암호화된 듯한 문자열이 그대로 노출되어 dummy처럼 보였다.
- 카드 UI가 너무 단순했고, 사용자는 canvas node를 선호했다.
- 버튼 hover/click/진행 피드백이 부족했다.
- progress bar, graph, 실시간 수치가 정지해 보였다.
- `checkout-api`라는 이름을 API처럼 말해 혼란을 줬다. 화면/설명에서는 Kubernetes Deployment라고 명확히 해야 한다.
- `octocat/Hello-World` 같은 외부 dummy repo는 데모 신뢰도를 떨어뜨렸다.
- 데모 레포는 `Jungle-303-04/fleet-demo-checkout`, `Jungle-303-04/fleet-demo-payments` 같은 팀 레포를 사용해야 한다.

필요 조치:

- 페이지 이름/문구/상태를 모두 한국어로 정리.
- "서비스 소개" 문구 제거.
- Plural frontend 느낌은 살리되 우리 서비스의 실제 데이터/액션 중심으로 표시.
- canvas node에 Deployment, Pod, Node, Workflow, Git repo, Command 상태를 직접 연결.
- 진행 중/성공/실패/대기 상태를 버튼, toast, progress, graph로 즉시 표현.

## 권장 복구 순서

장애가 다시 나면 아래 순서로 복구한다.

1. `localhost:5173`부터 살린다.
2. `localhost:18080/readyz`를 살린다.
3. `api-gateway` Service endpoint를 확인한다.
4. `api-gateway` pod가 `1/1`인지 확인한다.
5. `GITHUB_TOKEN` Secret이 있는지 확인한다.
6. 로그인 API를 확인한다.
7. `/fleet-console/state`를 확인한다.
8. manifest read를 확인한다.
9. manifest push를 확인한다.
10. GitHub poller는 마지막에 켠다.

## 발표 중 피해야 할 행동

- `make up` 전체 재실행.
- worker Deployment를 0으로 내리기.
- GitHub token을 placeholder로 넣기.
- 여러 worker와 Gateway를 동시에 반복 재시작하기.
- EndpointSlice/port-forward/Vite server 확인 없이 브라우저만 계속 새로고침하기.
- `github-poll-worker` 실패 Job을 실시간 worker 장애로 해석하기.

## 발표 중 최소 안전 명령

프론트만 죽었을 때:

```bash
screen -S fleet-dashboard -X quit >/dev/null 2>&1 || true
screen -dmS fleet-dashboard zsh -lc \
  'cd ~/workspace/Krafton-Jungle/SW_AI_W17-21-final-dashboard/dashboard && npm run dev -- --host 0.0.0.0'
```

Gateway port-forward만 죽었을 때:

```bash
pkill -f 'kubectl.*port-forward.*api-gateway.*18080' || true
kubectl --context kind-management -n management port-forward svc/api-gateway 18080:8000
```

Gateway endpoint가 stale일 때:

```bash
kubectl --context kind-management -n management delete endpointslice \
  -l kubernetes.io/service-name=api-gateway
```

GitHub token을 다시 넣을 때:

```bash
token="$(gh auth token)"
b64="$(printf '%s' "$token" | base64 | tr -d '\n')"
kubectl --context kind-management -n management patch secret management-runtime-secret \
  --type=merge -p "{\"data\":{\"GITHUB_TOKEN\":\"$b64\"}}"
kubectl --context kind-management -n management rollout restart deploy/api-gateway
```

실패 poller 기록만 지울 때:

```bash
kubectl --context kind-management -n management delete job \
  $(kubectl --context kind-management -n management get jobs -o name | grep github-poll-worker | sed 's#job.batch/##') \
  --ignore-not-found
```

## 장기 수정 TODO

1. DB migration을 runtime service startup에서 제거하고 단일 migration Job으로 분리.
2. Application upsert conflict 기준 수정.
3. `github-poll-worker` 실패 원인/결과를 UI에서 과거 기록과 현재 장애로 분리.
4. Gateway `/fleet-console/state` 응답을 더 가볍게 만들고 timeout fallback 추가.
5. SSE는 이벤트 기반/1초 state push로 낮추고, UI animation은 client에서 처리.
6. management canvas fallback 추가.
7. Vite/port-forward를 `make demo` 같은 단일 명령으로 관리.
8. demo health check script 작성.
9. GitHub token placeholder 검사를 모든 실행 스크립트에 추가.
10. Plural 기반 UI와 실제 backend mapping을 E2E test로 묶기.
