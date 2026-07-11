# AWS 테스트 실행 기준

이제 팀 통합 테스트 기준은 로컬 클러스터가 아니라 GitHub Actions의 AWS CD smoke다.
로컬에서는 코드 정적 검증과 단위 테스트만 돌리고, 서비스가 실제로 붙는지는 AWS EKS에서 확인한다.

## 언제 무엇을 돌리는가

| 상황 | 실행 | 왜 이렇게 하는가 |
| --- | --- | --- |
| 내 코드가 깨졌는지 빠르게 확인 | `bash scripts/test.sh` | Python lint, import boundary, compile, pytest를 Docker 없이 확인한다. |
| Kubernetes manifest가 렌더되는지 확인 | `make manifest-check` | management/target manifest를 렌더하고 `kubectl` client dry-run으로 파싱한다. |
| PR/커밋 전 기본 확인 | `make check` | `scripts/test.sh`와 manifest check를 함께 돌린다. Docker daemon은 필요 없다. |
| 실제 서비스 통합 smoke | `make aws-smoke` | GitHub Actions `AWS CD` workflow를 `run_smoke=true`로 실행한다. |
| GitHub 화면에서 직접 실행 | Actions -> `Integration Smoke` -> Run workflow | 이 workflow가 다시 `AWS CD`를 `run_smoke=true`로 호출하고 결과를 기다린다. |

로컬 cluster context 기반 확인은 현재 팀 테스트 기준에서 사용하지 않는다. 서비스 수준 검증은 AWS EKS에 올라간 management/target cluster를 기준으로 한다.

## 선택 실행: 실제 인프라 E2E 파이프라인 스크립트

`scripts/e2e_test.py`는 기본 PR 검증이나 팀 공통 smoke가 아니다.
이미 AWS 배포와 target agent 연결이 끝난 뒤, 운영자가 실제 Kubernetes 리소스 변경까지 한 번에 확인하고 싶을 때만 수동으로 실행한다.
이 스크립트는 API 응답만 확인하지 않고 target cluster의 `sandbox` namespace에 테스트 Deployment를 만들고, restart/scale command가 agent를 거쳐 실제 리소스에 반영되는지 확인한 뒤 삭제한다.

실행 전에 아래 값을 명시한다.

```bash
export BASE_URL="https://k8s.woonyong.org"
export AUTH_EMAIL="<aws-test admin email>"
export AUTH_PASSWORD="<aws-test admin password>"
export SMOKE_CLUSTER_ID="<target cluster id>"
export MGMT_CONTEXT="<management EKS kubeconfig context>"
export TARGET_CONTEXT="<target EKS kubeconfig context>"
```

그다음 실행한다.

```bash
uv run python scripts/e2e_test.py
```

이 스크립트가 실패하면 먼저 실패한 category를 본다.
`등록` 또는 `에이전트`가 실패하면 target registration과 agent rollout을 본다.
`메트릭` 또는 `인벤토리`가 실패하면 node collector, inventory snapshot, agent inventory report를 본다.
`NATS` 또는 `상태전이`가 실패하면 management namespace의 NATS, outbox relay, command-worker, workflow-controller 로그를 본다.
`커맨드`가 실패하면 `sandbox` namespace에 Deployment를 만들 권한이 있는지와 agent command handler가 실행됐는지 확인한다.

## EKS가 활성인데도 URL이 안 열리는 이유

AWS Console의 EKS cluster 상태가 `활성`이면 Kubernetes control plane이 살아 있다는 뜻이다.
그 상태만으로 `https://k8s.woonyong.org/api/healthz`가 열린다는 뜻은 아니다.
서비스 URL이 열리려면 아래 단계가 모두 끝나야 한다.

1. `scripts/aws-up.sh`가 management manifest를 적용한다.
2. `console`, `api-gateway`, worker, `nats`, `postgresql` rollout이 끝난다.
3. `console` Service가 public `LoadBalancer`가 된다. `api-gateway`는 console nginx의 `/api/*` 프록시 뒤에 둔다.
4. AWS LoadBalancer hostname이 생긴다.
5. Cloudflare DNS record가 그 LoadBalancer hostname을 origin으로 가리킨다.
6. Bruno나 `curl`이 custom domain 또는 LoadBalancer URL로 `/api/healthz`를 호출한다.

이번에 본 `TLS handshake timeout`은 2번 단계에서 GitHub Actions runner가 EKS API에
상태 조회를 하던 중 네트워크가 한 번 끊긴 상황이다. cluster가 죽은 것이 아니라
`kubectl rollout status` 조회가 실패한 것이다. 그래서 `scripts/aws-up.sh`는
management rollout 대상 목록 조회와 각 rollout status를 3번 재시도한다.
3번 모두 실패하면 해당 resource의 `get -o wide`와 `describe`를 로그에 남겨
실제 Pod/Replica 문제인지, API 연결 문제인지 바로 구분한다.

## 현재 AWS/GitHub 설정값

비밀값 원문은 문서에 쓰지 않는다. 팀원이 확인해야 하는 것은 이름과 쓰임이다.

| 이름 | 값 또는 위치 | 어디에 쓰는가 |
| --- | --- | --- |
| `AWS_REGION` | repository variable, workflow 기본 `us-east-1` | AWS CD가 EKS/ECR/API를 호출할 region |
| `PROJECT_SLUG` | repository variable, workflow 기본 `kubeheal` | AWS resource prefix |
| `MGMT_CLUSTER` | repository variable, workflow 기본 `kubeheal-mgmt` | management EKS cluster context/name |
| `TARGET_CLUSTER_1` | repository variable, workflow 기본 `kubeheal-target-a` | 첫 번째 target EKS cluster |
| `TARGET_CLUSTER_2` | repository variable, workflow 기본 `kubeheal-target-b` | 두 번째 target EKS cluster |
| `TARGET_CLUSTER_ID_1` | repository variable, 기본 `TARGET_CLUSTER_1` | target 등록과 smoke에서 쓰는 첫 번째 cluster id |
| `TARGET_CLUSTER_ID_2` | repository variable, 기본 `TARGET_CLUSTER_2` | target 등록에서 쓰는 두 번째 cluster id |
| `SMOKE_CLUSTER_ID` | repository variable, 기본 `TARGET_CLUSTER_ID_1` | smoke가 GitHub webhook/command body에 넣는 cluster id |
| `MANIFEST_PATH` | repository variable, 운영 배포 필수 | GitHub webhook에 넣고 `manifest-render-worker`가 원격 repository에서 읽는 앱 배포 manifest |
| `SMOKE_MANIFEST_PATH` | repository variable, 기본 `src/samples/smoke/deploy.yaml` | `run_smoke=true`인데 `MANIFEST_PATH`가 비어 있을 때만 쓰는 smoke 전용 manifest |
| `SMOKE_GATEWAY_ATTEMPTS` | env, 기본 `60` | LoadBalancer DNS/health가 준비될 때까지 smoke가 `/api/healthz` 또는 raw gateway `/healthz`를 확인하는 횟수 |
| `SMOKE_GATEWAY_INTERVAL_SECONDS` | env, 기본 `5` | smoke gateway health 재시도 간격 |
| `AUTH_LOGIN_ATTEMPTS` | env, 기본 `12` | rollout 직후 연결 리셋 같은 일시 오류가 있어도 smoke login을 재시도하는 횟수 |
| `AUTH_LOGIN_RETRY_INTERVAL_SECONDS` | env, 기본 `5` | smoke login 재시도 간격 |
| `MGMT_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Management` | dashboard/API 표시 이름 |
| `TARGET_1_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Target A` | target 1 표시 이름 |
| `TARGET_2_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Target B` | target 2 표시 이름 |
| `ECR_REPO` | repository variable, workflow 기본 `kubeheal-service` | 서비스 container image repository |
| `CONSOLE_ECR_REPO` | repository variable, workflow 기본 `kubeheal-console` | `frontend/` 운영 콘솔 container image repository |
| `AWS_AUTO_DEPLOY` | `1` | `main` push 때 AWS CD 배포 허용 |
| `AWS_CREATE_CLUSTERS` | `0` | 기본은 기존 EKS cluster 사용 |
| `AWS_ENSURE_EBS_CSI` | `0` | 기본은 기존 EBS CSI 설정 사용 |
| `AWS_BOOTSTRAP_ADMIN` | `0` | 기본은 기존 admin 계정 유지 |
| `AWS_REGISTER_TARGETS` | `0` | 기본은 기존 target 등록 유지 |
| `AWS_RUN_SMOKE` | `0` | 자동 main 배포는 smoke를 기본 실행하지 않는다. smoke가 필요하면 workflow input으로 켠다. |
| `SKIP_LB_HEALTH_WAIT` | `1` | 현재 테스트 환경에서 LoadBalancer wait를 짧게 운용한다. |
| `CUSTOM_DOMAIN` | repository variable, 기본 없음 | DNS 연결을 켤 때 사용할 도메인 |
| `CONFIGURE_ROUTE53` | `0` | Route53 변경 기본 비활성 |
| `CONFIGURE_CLOUDFLARE` | repository variable, 현재 테스트 환경 `1` | Cloudflare CNAME을 AWS LoadBalancer로 갱신할지 정한다. `1`이면 `CUSTOM_DOMAIN`, `CLOUDFLARE_ZONE_NAME`, `CLOUDFLARE_API_TOKEN`이 필요하다. |
| `CLOUDFLARE_PROXIED` | `1` | Cloudflare가 HTTPS를 받고 origin LoadBalancer로 프록시하도록 기본 활성화 |
| `AWS_ROLE_ARN` | GitHub environment secret `aws-test` | GitHub OIDC가 assume할 AWS role |
| `AUTH_EMAIL` | GitHub environment secret `aws-test` | admin bootstrap/smoke login 계정 |
| `AUTH_PASSWORD` | GitHub environment secret `aws-test` | admin bootstrap/smoke login 비밀번호 |
| `GH_APP_TOKEN` | GitHub environment secret `aws-test` | private repo manifest read, Safe PR 같은 GitHub write 작업. 없으면 AWS CD smoke 중에는 `github.token`을 임시 read token으로 쓴다. |
| `CLOUDFLARE_API_TOKEN` | GitHub environment secret `aws-test` | `CONFIGURE_CLOUDFLARE=1`일 때 `k8s.woonyong.org` CNAME을 AWS LoadBalancer로 갱신. 같은 이름의 repository secret을 fallback으로 둘 수 있지만, `environment: aws-test` job에서는 environment secret이 우선이다. |

## Cloudflare DNS가 1016이면 먼저 볼 것

`curl -i https://k8s.woonyong.org/api/healthz`가 `HTTP/2 530`과 `error code: 1016`을 반환하면
Bruno나 Gateway 문제가 아니라 Cloudflare가 origin DNS record를 찾지 못하는 상태다.

1. AWS LoadBalancer가 살아 있는지 먼저 확인한다.

```bash
MGMT_CLUSTER="${MGMT_CLUSTER:-kubeheal-mgmt}"
LB_HOST="$(kubectl --context "${MGMT_CLUSTER}" -n management get svc console \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"

curl -i "http://${LB_HOST}/api/healthz"
```

2. GitHub environment `aws-test`에 `CLOUDFLARE_API_TOKEN` secret이 있는지 확인한다.

```bash
gh secret list --repo Jungle-303-04/final --env aws-test
```

목록에 이름이 있어도 값이 빈 값이면 AWS CD log에는 `Cloudflare API token is not set`이 나온다.
그 경우에는 "secret이 있다"고 보고 넘어가면 안 된다. 아래처럼 실제 token 값을 다시 넣는다.

3. 1Password shell plugin 때문에 `gh secret set`이 아래처럼 실패하면 GitHub CLI 절대 경로를 사용한다.

```text
"... isn't an item in the ... vault. To no longer use this item, run 'op plugin clear gh'"
```

```bash
/opt/homebrew/bin/gh secret set CLOUDFLARE_API_TOKEN \
  --repo Jungle-303-04/final \
  --env aws-test
```

프롬프트 입력이 꼬였거나 빈 값으로 들어간 것 같으면 아래처럼 `--body`로 다시 넣는다.
토큰은 화면에 남기지 않기 위해 `read -s`로 받는다.

```bash
stty -echo
printf 'Cloudflare token: ' >&2
IFS= read -r CF_TOKEN
stty echo
printf '\n' >&2

/opt/homebrew/bin/gh secret set CLOUDFLARE_API_TOKEN \
  --repo Jungle-303-04/final \
  --env aws-test \
  --body "$CF_TOKEN"

unset CF_TOKEN
```

필요하면 repository secret에도 같은 이름을 fallback으로 둘 수 있다.
그래도 `aws-test` environment secret이 비어 있으면 environment 값이 우선이라 repo fallback이 대신 쓰이지 않는다.
그래서 정상화 기준은 반드시 `aws-test` environment secret을 다시 넣은 뒤 AWS CD log에서 Cloudflare upsert 문구를 보는 것이다.

토큰은 채팅이나 문서에 쓰지 않는다. Cloudflare에서 `woonyong.org` zone에 대해
`Zone:Read`, `DNS:Edit` 권한이 있는 API token을 만든 뒤 위 명령 프롬프트에 붙여 넣는다.
가장 좋은 값은 순수 API token 문자열이다. 실수로 `Bearer ...`,
`Authorization: Bearer ...`, `CLOUDFLARE_API_TOKEN=...`처럼 붙여 넣어도
`scripts/aws-up.sh`가 배포 중 순수 토큰만 뽑아서
`Authorization: Bearer <token>` 형태로 정규화한다.
그래도 token 형태가 아니면 AWS CD log에 실제 토큰 값은 숨기고
`raw_length`, `normalized_length`, `allowed_bearer_charset`만 출력한다.
이 메시지가 나오면 GitHub secret에 Cloudflare 화면의 raw API token만 다시 넣는다.
잘못된 토큰 때문에 Cloudflare DNS를 갱신할 수 없어도 AWS/EKS 배포 자체는 실패시키지 않는다.
이 경우 log에 `skipping Cloudflare DNS ... AWS LoadBalancer remains available`가 남고,
smoke와 상태 확인은 AWS LoadBalancer URL로 계속 진행한다.
단, `https://k8s.woonyong.org/api/healthz`는 올바른 Cloudflare token으로 DNS record가 만들어지기 전까지
`error code: 1016`이 계속 날 수 있다.

4. secret을 넣은 뒤 AWS CD를 다시 실행한다.

```bash
/opt/homebrew/bin/gh workflow run aws-cd.yml \
  --repo Jungle-303-04/final \
  --ref main \
  -f create_clusters=false \
  -f ensure_ebs_csi=false \
  -f bootstrap_admin=false \
  -f register_targets=false \
  -f run_smoke=true
```

이 실행에서 deploy log에 `updating Cloudflare record k8s.woonyong.org -> ...elb.amazonaws.com`
또는 `creating Cloudflare record ...`가 보여야 한다.
그 로그가 보이지 않으면 도메인 연결은 아직 끝난 것이 아니다.

정상 연결은 아래처럼 직접 확인한다.

```bash
curl -i https://k8s.woonyong.org/api/healthz
```

정상 응답 기준은 `HTTP/2 200`과 아래 JSON이다.

```json
{"status":"ok","service":"api-gateway"}
```

`CLOUDFLARE_PROXIED=1`일 때 Cloudflare DNS record TTL은 자동값으로 보낸다.
Cloudflare API에서 자동 TTL은 `1`이고, 프록시를 끈 경우에만 일반 TTL `60`을 쓴다.
Cloudflare가 record 생성을 거절하면 AWS CD log에 Cloudflare error code와 message가 같이 출력되어야 한다.

## AWS smoke를 직접 실행하는 법

로컬에서 GitHub CLI가 로그인되어 있으면 아래 한 줄로 실행한다.

```bash
make aws-smoke
```

같은 일을 풀어서 쓰면 아래와 같다.

```bash
gh workflow run aws-cd.yml \
  --repo Jungle-303-04/final \
  --ref main \
  -f create_clusters=false \
  -f ensure_ebs_csi=false \
  -f bootstrap_admin=false \
  -f register_targets=false \
  -f run_smoke=true
```

방금 시작한 run은 이렇게 확인한다.

```bash
RUN_ID="$(gh run list \
  --repo Jungle-303-04/final \
  --workflow aws-cd.yml \
  --branch main \
  --event workflow_dispatch \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')"

gh run watch "$RUN_ID" --repo Jungle-303-04/final --exit-status
```

`run_smoke=true`에서는 `scripts/smoke.sh`가 먼저 `${BASE_URL}/api/healthz`를 확인한다. `BASE_URL`이 raw gateway origin이면 자동으로 `${BASE_URL}/healthz`를 사용한다.
AWS LoadBalancer hostname은 service에 붙은 직후 몇 분 동안 runner DNS에서 아직 resolve되지 않을 수 있다.
그래서 smoke는 기본적으로 `SMOKE_GATEWAY_ATTEMPTS=60`, `SMOKE_GATEWAY_INTERVAL_SECONDS=5` 기준으로
최대 5분까지 기다린 뒤 로그인, webhook, event flow 검증으로 넘어간다.
게이트웨이 health가 막 정상으로 바뀐 직후에는 LoadBalancer 또는 새 gateway pod 전환 타이밍 때문에
로그인 요청만 연결 리셋될 수 있다. 이 경우 `AUTH_LOGIN_ATTEMPTS=12`,
`AUTH_LOGIN_RETRY_INTERVAL_SECONDS=5` 기준으로 login 단계도 재시도한다.

`manifest-render-worker`는 `git.changed`를 처리하면서 원격 repository에서 `MANIFEST_PATH` manifest를 읽는다.
AWS smoke 전용 기본값은 `SMOKE_MANIFEST_PATH=src/samples/smoke/deploy.yaml`이다. 이 파일은 `apps/v1 Deployment`라서
`manifest.rendered -> desired.diff.detected -> diff.analyzed`까지 이어지는 앱 배포 흐름을 검증한다.
`deploy/target/target.yaml`은 target agent 설치 참고본이고 `Namespace`, RBAC 같은 플랫폼 리소스를 포함하므로
GitOps smoke 입력으로 쓰지 않는다.

이 원격 read 경로 때문에 runtime image 안에는 `git`이 들어 있어야 하고,
private repo라면 `GITHUB_TOKEN`도 필요하다.
AWS CD workflow는 `GH_APP_TOKEN` secret이 있으면 그 값을 쓰고, 없으면 해당 workflow run 안에서만 유효한
`github.token`을 read token으로 넘긴다. 실제 운영에서 Safe PR까지 이어가려면 `GH_APP_TOKEN`을 별도 secret으로 넣는다.

AWS smoke webhook body에는 `force: true`를 넣는다.
일반 webhook은 같은 watch target의 같은 commit이면 `git-pull-worker`가 중복으로 보고 조용히 skip한다.
그런데 smoke는 이미 poller가 최신 commit을 처리한 직후에도 같은 흐름을 다시 검증해야 하므로,
`force: true`일 때만 같은 commit이어도 `git.changed`를 다시 발행한다.

## AWS CD가 실제로 넘기는 값

| 단계 | 넘기는 값 | 받는 곳 | 왜 필요한가 |
| --- | --- | --- | --- |
| GitHub Actions -> AWS | `AWS_ROLE_ARN`, `AWS_REGION` | `aws-actions/configure-aws-credentials` | 장기 access key 없이 EKS/ECR 권한을 얻기 위해 필요하다. |
| Workflow env -> deploy script | `PROJECT_SLUG`, `MGMT_CLUSTER`, `TARGET_CLUSTER_1`, `TARGET_CLUSTER_2`, `ECR_REPO`, `IMAGE_TAG` | `scripts/aws-up.sh` | 어느 cluster에 어떤 image와 이름으로 배포할지 정한다. |
| Deploy script -> management manifests | runtime ConfigMap/Secret, DB/Redis/NATS/Object store env, auth secret | `deploy/management/*` | gateway와 worker가 같은 store/event bus를 바라보게 한다. |
| Deploy script -> target registration | `MANAGEMENT_BASE_URL`, `cluster_id`, agent token, target display name | target agent manifest/API | target agent가 management로 outbound polling과 evidence result 전송을 하기 위해 필요하다. |
| Target agent -> Gateway | `x-agent-token`, command/evidence job result body | `/agent/commands/*`, `/agent/evidence/jobs/*` | agent identity를 확인하고 workspace/cluster 위조를 막는다. |
| Evidence job -> RCA chain | `workspace_id`, `cluster_id`, `evidence_key`, `kubernetes`, `metrics`, `logs`, `traces` | `cluster.evidence.received` | 가인이 RCA 입력으로 쓸 수 있는 window 단위 evidence 묶음이다. |
| RCA/dispatch -> Command or PR | `command.requested` 또는 `safe_pr.requested` | `command-worker`, `safe-pr-worker`, `ai-diff-worker`, `scm-worker/GithubScmProvider` | 실제 target 실행과 GitHub PR 생성을 분리한다. |
| Dashboard projection | `cluster.evidence.received`, `rca.*`, `command.*`, `safe_pr.*` | `dashboard-worker` | 찬빈 화면이 raw event bus가 아니라 read model/API를 읽게 한다. |

## 역할별로 봐야 하는 결과

| 팀원 | AWS smoke에서 확인할 것 | 실패하면 먼저 볼 곳 |
| --- | --- | --- |
| 민정 | target agent가 command/evidence job을 poll하고, `cluster.evidence.received`가 생기는지 | `src/services/target/cluster-agent`, `src/domains/target/router.py`, `scripts/aws-up.sh` |
| 가인 | evidence 이후 `rca.completed` 또는 `rca.action_required`, `safe_pr.requested`가 이어지는지 | `src/services/ai/*-worker`, `src/domains/rca/events.py` |
| 찬빈 | `/dashboard/rca/timeline`에서 권한 필터가 적용된 timeline row가 보이는지 | `src/domains/dashboard/router.py`, `dashboard-worker`, identity repository |

## 통과 기준

- `AWS CD / Test before deploy`가 통과한다.
- `AWS CD / Deploy to AWS EKS`가 통과한다.
- `run_smoke=true` 실행에서 `scripts/smoke.sh`가 성공한다.
- management namespace에 api-gateway와 worker pod가 준비 상태다.
- target cluster agent가 management API로 evidence를 보낸다.
- event/DLQ/outbox 상태에 처리되지 않은 오류가 남지 않는다.

이 기준을 만족하면 문서에서 설명하는 command, target evidence, RCA, Safe PR, dashboard 연결을 실제 AWS 환경에서 검증한 것으로 본다.
