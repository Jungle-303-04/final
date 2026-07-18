# AWS 기반 인프라 기준

이 디렉터리는 서울 리전의 신규 blue/green 기반만 정의한다. 앱 배포는
`scripts/aws-up.sh`와 Dev Deploy workflow가 담당한다.

## 적용 금지 상태

현재 AWS의 세 클러스터는 eksctl/CloudFormation으로 생성됐고 이 디렉터리에는
Terraform state가 없다. 따라서 아래 조건이 모두 충족되기 전에는
`terraform apply`와 `terraform destroy`를 실행하지 않는다.

1. 원격 S3 state와 DynamoDB lock을 생성하고 backend를 활성화한다.
2. 기존 eksctl 리소스를 Terraform에 import할지, 신규 green만 Terraform이
   소유할지 결정한다.
3. `terraform plan`에서 기존 blue 리소스 변경·삭제가 0건임을 확인한다.
4. `eks_public_access_cidrs`에 승인된 운영자 또는 CI CIDR만 입력한다.
5. 관리면의 PostgreSQL·NATS·MinIO EBS snapshot이 완료·암호화 상태인지
   검증한다.

현재 코드의 기본값은 실행 명령이 아니라 검토 가능한 canonical 설계값이다.

## canonical 이름

| 역할 | EKS/Kubernetes slug | 제품 표시명 | node group |
| --- | --- | --- | --- |
| 관리면 | `management-server` | `메니지먼트` | `r6i.xlarge`, ON_DEMAND, 2대 |
| 게임 | `game-server` | `게임 서버` | `t3.large` 계열, SPOT, 1~3대 |
| YAML 검증 | `demo-server` | `데모 서버` | `t3.large` 계열, SPOT, 1~2대 |

EKS 물리 이름은 생성 후 변경할 수 없고 한글을 사용할 수 없다. 한글 이름은
EKS/EC2 태그와 제품 클러스터 등록의 `DisplayName`으로만 사용한다.

모든 클러스터는 Kubernetes 1.34, OIDC, EBS CSI와 control-plane 로그
`api/audit/authenticator/controllerManager/scheduler`를 사용한다. public endpoint는
GitHub-hosted runner 때문에 필요할 수 있지만 `0.0.0.0/0`와 `::/0`는 validation으로
거부한다. 가능하면 VPC 안의 self-hosted runner를 사용하고 public endpoint를
비활성화한다. GitHub-hosted runner를 유지한다면 배포 직전
[GitHub Meta API](https://api.github.com/meta)의 `actions` CIDR을 검토해 tfvars에
명시하고 변경을 정기적으로 동기화한다.

예시 tfvars:

```hcl
eks_public_access_cidrs = [
  "203.0.113.10/32",
]
```

위 주소는 형식 예시일 뿐 실제 적용값이 아니다.

## blue/green 순서

1. `management-server`, `game-server`, `demo-server` green을 생성한다.
2. green 관리면에 새 PostgreSQL/NATS/MinIO 볼륨을 생성하고 migration을 실행한다.
   이번 초기화에서는 blue DB를 green DB에 복원하지 않는다.
3. 고정 관리자와 실제 workspace만 bootstrap한다.
4. 게임 workload는 `game-server`, YAML/GitOps 검증 workload는 `demo-server`에
   배포한다.
5. 두 target에 outbound cluster-agent를 설치하고 관리면에서 heartbeat,
   inventory, API discovery, RBAC, metrics 수집을 확인한다.
6. Cloudflare tunnel과 `agent-api` DNS를 green으로 전환한다.
7. 인증된 주요 경로, 게임 연결, YAML dry-run/apply/receipt를 검증한다.
8. `DESTROY_MODE=retire-blue` 안전 게이트에 실행 시점의 blue 이름을 명시해 target부터
   제거한다. 기존 이름은 저장소에 기록하지 않는다.

blue와 green은 같은 ECR 이미지를 사용하므로 blue 제거 중 ECR을 삭제하지 않는다.

## Terraform 준비

```bash
cd infra
terraform init
terraform fmt -check
terraform validate
terraform plan -var-file=approved.tfvars
```

원격 backend가 활성화되고 plan이 승인되기 전까지 `apply`는 금지다.
