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
