# AWS CI/CD

이 레포의 기본 검증은 `.github/workflows/ci.yml`이 담당하고, 실제 서비스 통합 테스트와
AWS 배포는 `.github/workflows/aws-cd.yml`이 담당한다.

자세한 실행 순서는 [AWS 테스트 실행 기준](aws-testing-runbook.md)을 따른다.

## 인증

AWS CD는 장기 access key 대신 GitHub OIDC를 사용한다. GitHub workflow가 AWS role을
assume할 수 있도록 AWS IAM OIDC provider와 role trust policy를 먼저 만든 뒤, role ARN을
GitHub environment secret에 저장한다.

필수 secret:

- `AWS_ROLE_ARN`

권장 secret:

- `AUTH_EMAIL`
- `AUTH_PASSWORD`
- `POSTGRES_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- `GH_WEBHOOK_SECRET`
- `GH_APP_TOKEN`: private repo manifest read와 Safe PR write용. 없으면 AWS CD smoke는 `github.token`으로 읽기만 임시 수행한다.
- `CLOUDFLARE_API_TOKEN` if `CONFIGURE_CLOUDFLARE=1`. AWS CD는 `environment: aws-test`에서 실행되므로 이 secret은 `aws-test` environment secret에 넣는 것이 기준이다.

선택 secret:

- `LLM_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_COMPATIBLE_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

## 기본 리소스 이름

기본값은 공개 저장소와 데모 계정에서도 바로 이해되는 앱형 이름을 사용한다.
GitHub repository variables나 로컬 env로 덮어쓸 수 있다.

- app/resource prefix: `kubeheal`
- AWS region: repository variable `AWS_REGION`, 기본 `us-east-1`
- management EKS cluster: repository variable `MGMT_CLUSTER`, 기본 `kubeheal-mgmt`
- target EKS cluster 1: repository variable `TARGET_CLUSTER_1`, 기본 `kubeheal-target-a`
- target EKS cluster 2: repository variable `TARGET_CLUSTER_2`, 기본 `kubeheal-target-b`
- target id 1: repository variable `TARGET_CLUSTER_ID_1`, 기본 `TARGET_CLUSTER_1`
- target id 2: repository variable `TARGET_CLUSTER_ID_2`, 기본 `TARGET_CLUSTER_2`
- smoke target id: repository variable `SMOKE_CLUSTER_ID`, 기본 `TARGET_CLUSTER_ID_1`
- service ECR repository: repository variable `ECR_REPO`, 기본 `kubeheal-service`
- console ECR repository: repository variable `CONSOLE_ECR_REPO`, 기본 `kubeheal-console`
- display names: repository variables `MGMT_DISPLAY_NAME`, `TARGET_1_DISPLAY_NAME`, `TARGET_2_DISPLAY_NAME`
- dashboard/API domain: 기본 없음. `CUSTOM_DOMAIN`과 DNS zone을 설정한 경우에만 연결

기본 노드 스펙:

- management: `t3.xlarge` x 2, node volume 50GiB
- target 1: `t3.large` x 2, node volume 50GiB
- target 2: `t3.large` x 2, node volume 50GiB

## 배포 방식

`dev` push는 먼저 `Promote Dev To Main` workflow에서 `scripts/test.sh`를 실행한다.
통과하면 `dev`를 `main`에 merge하고, AWS CD를 `run_smoke=true`로 dispatch한다.

실제 AWS 배포는 아래 둘 중 하나일 때 실행된다.

- GitHub Actions에서 `AWS CD` workflow를 수동 실행
- `main` push. 필요하면 repository variable `AWS_AUTO_DEPLOY=0`으로 자동 배포를 끈다.

배포 job의 기본값은 기존 EKS 클러스터가 있다고 가정한다.

- service/console container image build
- service/console ECR push
- management runtime ConfigMap/Secret upsert
- management manifests apply
- `api-gateway` LoadBalancer health check
- Route53 CNAME upsert when `CONFIGURE_ROUTE53=1`, `CUSTOM_DOMAIN`, `ROUTE53_ZONE_NAME` are set
- Cloudflare CNAME upsert when `CONFIGURE_CLOUDFLARE=1`, `CUSTOM_DOMAIN`, `CLOUDFLARE_ZONE_NAME`, `CLOUDFLARE_API_TOKEN` are set

`workflow_dispatch`에서 아래 입력을 켜면 더 넓은 작업도 수행한다.

- `create_clusters`: EKS cluster 생성
- `ensure_ebs_csi`: EBS CSI add-on과 gp3 StorageClass 확인
- `bootstrap_admin`: `AUTH_EMAIL`/`AUTH_PASSWORD`로 admin 계정 부트스트랩
- `register_targets`: 새 이미지로 target 2개 재등록
- `run_smoke`: 배포 후 `scripts/smoke.sh` 실행

권장 repository variables:

- `PROJECT_SLUG`: 리소스 접두사. 기본 `kubeheal`
- `AWS_REGION`: 기본 `us-east-1`
- `MGMT_CLUSTER`: 기본 `kubeheal-mgmt`
- `TARGET_CLUSTER_1`: 기본 `kubeheal-target-a`
- `TARGET_CLUSTER_2`: 기본 `kubeheal-target-b`
- `ECR_REPO`: 기본 `kubeheal-service`
- `CONSOLE_ECR_REPO`: 기본 `kubeheal-console`
- `AUTO_PROMOTE_DEV_TO_MAIN`: `0`이면 dev 자동 main 승격 비활성화
- `AWS_AUTO_DEPLOY`: `0`이면 main push 자동 AWS 배포 비활성화
- `GIT_CHECKOUT_CACHE_ENABLED`: 기본 AWS CD `1`
- `GIT_CHECKOUT_CACHE_REQUIRED`: 기본 `0`. cache 실패 시 GitHub Contents API fallback 허용
- `MANIFEST_PATH`: 운영 배포에서는 필수 repository variable. AWS smoke 전용 기본 manifest는 `SMOKE_MANIFEST_PATH`가 없을 때만 `src/samples/smoke/deploy.yaml`를 사용한다.
- `COMMAND_JANITOR_INTERVAL_SECONDS`: 기본 `15`
- `CUSTOM_DOMAIN`, `ROUTE53_ZONE_NAME`, `CLOUDFLARE_ZONE_NAME`: DNS를 쓸 때만 설정
- `CONFIGURE_CLOUDFLARE`: 현재 AWS 테스트 도메인 `https://k8s.woonyong.org/`를 쓰려면 `1`로 둔다.
- `CLOUDFLARE_PROXIED`: 기본 `1`. `https://k8s.woonyong.org/`처럼 Cloudflare가 HTTPS를 받게 하려면 켜 둔다.
- `TARGET_CLUSTER_ID_1`, `TARGET_CLUSTER_ID_2`, `SMOKE_CLUSTER_ID`: target 등록과 smoke body에 들어가는 cluster id. 비워 두면 첫 번째 target 이름을 smoke 기본값으로 쓴다.

`AUTH_PASSWORD`가 비어 있으면 배포 스크립트가 임시 비밀번호를 생성한다. CI 로그 유출을 막기 위해
생성된 값은 기본적으로 출력하지 않는다. 로컬 디버그에서만
`PRINT_GENERATED_ADMIN_PASSWORD=1 make aws-up`으로 확인한다.

## AWS smoke 실행

서비스 수준 테스트는 AWS CD에서 실행한다. GitHub CLI가 준비되어 있으면 아래를 실행한다.

```bash
make aws-smoke
```

직접 workflow를 호출하려면 아래와 같이 실행한다.

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

로컬 클러스터 기반 smoke는 현재 팀 테스트 기준으로 사용하지 않는다.
