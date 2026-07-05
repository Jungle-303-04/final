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

## EKS가 활성인데도 URL이 안 열리는 이유

AWS Console의 EKS cluster 상태가 `활성`이면 Kubernetes control plane이 살아 있다는 뜻이다.
그 상태만으로 `https://k8s.woonyong.org/healthz`가 열린다는 뜻은 아니다.
서비스 URL이 열리려면 아래 단계가 모두 끝나야 한다.

1. `scripts/aws-up.sh`가 management manifest를 적용한다.
2. `api-gateway`, worker, `nats`, `postgresql` rollout이 끝난다.
3. `api-gateway` Service가 `LoadBalancer`로 patch된다.
4. AWS LoadBalancer hostname이 생긴다.
5. Cloudflare DNS record가 그 LoadBalancer hostname을 origin으로 가리킨다.
6. Bruno나 `curl`이 custom domain 또는 LoadBalancer URL로 `/healthz`를 호출한다.

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
| `MANIFEST_PATH` | repository variable, 기본 `src/samples/smoke/deploy.yaml` | smoke가 GitHub webhook에 넣고 `manifest-render-worker`가 원격 repository에서 읽는 앱 배포 manifest |
| `SMOKE_GATEWAY_ATTEMPTS` | env, 기본 `60` | LoadBalancer DNS/health가 준비될 때까지 smoke가 `/healthz`를 확인하는 횟수 |
| `SMOKE_GATEWAY_INTERVAL_SECONDS` | env, 기본 `5` | smoke gateway health 재시도 간격 |
| `MGMT_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Management` | dashboard/API 표시 이름 |
| `TARGET_1_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Target A` | target 1 표시 이름 |
| `TARGET_2_DISPLAY_NAME` | repository variable, workflow 기본 `KubeHeal Target B` | target 2 표시 이름 |
| `ECR_REPO` | repository variable, workflow 기본 `kubeheal-service` | 서비스 container image repository |
| `AWS_AUTO_DEPLOY` | `1` | `main` push 때 AWS CD 배포 허용 |
| `AWS_CREATE_CLUSTERS` | `0` | 기본은 기존 EKS cluster 사용 |
| `AWS_ENSURE_EBS_CSI` | `0` | 기본은 기존 EBS CSI 설정 사용 |
| `AWS_BOOTSTRAP_ADMIN` | `0` | 기본은 기존 admin 계정 유지 |
| `AWS_REGISTER_TARGETS` | `0` | 기본은 기존 target 등록 유지 |
| `AWS_RUN_SMOKE` | `0` | 자동 main 배포는 smoke를 기본 실행하지 않는다. smoke가 필요하면 workflow input으로 켠다. |
| `SKIP_LB_HEALTH_WAIT` | `1` | 현재 테스트 환경에서 LoadBalancer wait를 짧게 운용한다. |
| `CUSTOM_DOMAIN` | repository variable, 기본 없음 | DNS 연결을 켤 때 사용할 도메인 |
| `CONFIGURE_ROUTE53` | `0` | Route53 변경 기본 비활성 |
| `CONFIGURE_CLOUDFLARE` | `0` | Cloudflare 변경 기본 비활성 |
| `CLOUDFLARE_PROXIED` | `1` | Cloudflare가 HTTPS를 받고 origin LoadBalancer로 프록시하도록 기본 활성화 |
| `AWS_ROLE_ARN` | GitHub environment secret `aws-test` | GitHub OIDC가 assume할 AWS role |
| `AUTH_EMAIL` | GitHub environment secret `aws-test` | admin bootstrap/smoke login 계정 |
| `AUTH_PASSWORD` | GitHub environment secret `aws-test` | admin bootstrap/smoke login 비밀번호 |
| `GH_APP_TOKEN` | GitHub environment secret `aws-test` | private repo manifest read, Safe PR 같은 GitHub write 작업. 없으면 AWS CD smoke 중에는 `github.token`을 임시 read token으로 쓴다. |
| `CLOUDFLARE_API_TOKEN` | GitHub environment secret `aws-test` | `CONFIGURE_CLOUDFLARE=1`일 때 `k8s.woonyong.org` CNAME을 AWS LoadBalancer로 갱신 |

## Cloudflare DNS가 1016이면 먼저 볼 것

`curl -i https://k8s.woonyong.org/healthz`가 `HTTP/2 530`과 `error code: 1016`을 반환하면
Bruno나 Gateway 문제가 아니라 Cloudflare가 origin DNS record를 찾지 못하는 상태다.

1. AWS LoadBalancer가 살아 있는지 먼저 확인한다.

```bash
LB_HOST="$(kubectl --context kubernetes-ops -n management get svc api-gateway \
  -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')"

curl -i "http://${LB_HOST}/healthz"
```

2. GitHub environment `aws-test`에 `CLOUDFLARE_API_TOKEN` secret이 있는지 확인한다.

```bash
gh secret list --repo Jungle-303-04/final --env aws-test
```

3. 1Password shell plugin 때문에 `gh secret set`이 아래처럼 실패하면 GitHub CLI 절대 경로를 사용한다.

```text
"... isn't an item in the ... vault. To no longer use this item, run 'op plugin clear gh'"
```

```bash
/opt/homebrew/bin/gh secret set CLOUDFLARE_API_TOKEN \
  --repo Jungle-303-04/final \
  --env aws-test
```

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
단, `https://k8s.woonyong.org/healthz`는 올바른 Cloudflare token으로 DNS record가 만들어지기 전까지
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

`run_smoke=true`에서는 `scripts/smoke.sh`가 먼저 `${BASE_URL}/healthz`를 확인한다.
AWS LoadBalancer hostname은 service에 붙은 직후 몇 분 동안 runner DNS에서 아직 resolve되지 않을 수 있다.
그래서 smoke는 기본적으로 `SMOKE_GATEWAY_ATTEMPTS=60`, `SMOKE_GATEWAY_INTERVAL_SECONDS=5` 기준으로
최대 5분까지 기다린 뒤 로그인, webhook, event flow 검증으로 넘어간다.

`manifest-render-worker`는 `git.changed`를 처리하면서 원격 repository에서 `MANIFEST_PATH` manifest를 읽는다.
AWS smoke 기본값은 `src/samples/smoke/deploy.yaml`이다. 이 파일은 `apps/v1 Deployment`라서
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
| RCA/dispatch -> Command or PR | `command.requested` 또는 `safe_pr.requested` | `command-worker`, `scm-worker/GithubScmProvider` | 실제 target 실행과 GitHub PR 생성을 분리한다. |
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
