# AWS CI/CD

이 레포의 CI는 기존 `.github/workflows/ci.yml`이 담당하고, AWS 배포는
`.github/workflows/aws-cd.yml`이 담당한다.

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
- `GH_APP_TOKEN`
- `CLOUDFLARE_API_TOKEN` if `k8s.woonyong.org` is managed in Cloudflare

선택 secret:

- `LLM_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_COMPATIBLE_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`
- `GOOGLE_API_KEY`

## 기본 리소스 이름

- management EKS cluster: `kubernetes-ops`
- target EKS cluster 1: `cluster-1`
- target EKS cluster 2: `cluster-2`
- ECR repository: `kubernetes-ops-service`
- dashboard/API domain: `k8s.woonyong.org`

기본 노드 스펙:

- management: `t3.xlarge` x 2, node volume 50GiB
- target 1: `t3.large` x 2, node volume 50GiB
- target 2: `t3.large` x 2, node volume 50GiB

## 배포 방식

기본 push 배포는 기존 EKS 클러스터가 있다고 가정한다.

- Docker image build
- ECR push
- management runtime ConfigMap/Secret upsert
- management manifests apply
- `api-gateway` LoadBalancer health check
- Route53 `k8s.woonyong.org` CNAME upsert when hosted zone exists
- Cloudflare `k8s.woonyong.org` CNAME upsert when `CLOUDFLARE_API_TOKEN` exists

`workflow_dispatch`에서 아래 입력을 켜면 더 넓은 작업도 수행한다.

- `create_clusters`: EKS cluster 생성
- `ensure_ebs_csi`: EBS CSI add-on과 gp3 StorageClass 확인
- `bootstrap_admin`: `AUTH_EMAIL`/`AUTH_PASSWORD`로 admin 계정 부트스트랩
- `register_targets`: 새 이미지로 target 2개 재등록
- `run_smoke`: 배포 후 `scripts/smoke.sh` 실행

`AUTH_PASSWORD`가 비어 있으면 배포 스크립트가 임시 비밀번호를 생성한다. CI 로그 유출을 막기 위해
생성된 값은 기본적으로 출력하지 않는다. 로컬 디버그에서만
`PRINT_GENERATED_ADMIN_PASSWORD=1 make aws-up`으로 확인한다.

## 로컬 실행

AWS credentials가 준비된 로컬에서는 같은 로직을 직접 실행할 수 있다.

```bash
make aws-up
```

정리:

```bash
make aws-down
```
