# infra — Terraform 1단계 (기반 인프라)

이 디렉토리는 **1층(기반 시설)만** 코드화한다: VPC, EKS 클러스터 3개(mgmt·target-a·target-b), ECR 저장소 2개.
**2층(앱 배포)** — 이미지 빌드와 kubectl/helm 적용 — 은 여기서 하지 않는다. 운영자가 AWS credential chain으로 `scripts/aws-up.sh`를 실행한다.

기본값(`variables.tf`)은 `scripts/aws-up.sh` 의 현행 이름과 동일하다: `kubeheal-mgmt`, `kubeheal-target-a`, `kubeheal-target-b`, `kubeheal-service`, `kubeheal-console`, `us-east-1`.

## 처음 쓰는 팀원

```bash
cd infra
terraform init
terraform plan    # 디프 미리보기 — 뭐가 만들어지는지 적용 전에 보여줌
terraform apply   # 승인 입력 후 생성 (EKS 3개 ≈ 15~20분, AWS 자체 소요시간)
terraform output  # kubeconfig 연결 명령·ECR 주소 출력
```

전부 정리(비용 차단):

```bash
terraform destroy
```

## 상태(state) 백엔드

기본은 로컬 state(`terraform.tfstate`). 팀 공유 시 `versions.tf` 의 S3 backend 주석을 해제하고
그 위 주석의 부트스트랩 명령으로 버킷·잠금 테이블을 먼저 만든 뒤 `terraform init -migrate-state`.

## 이미 eksctl 로 만든 클러스터가 있다면

두 가지 중 선택:

1. **신규 생성(권장, 단순)** — 기존 클러스터는 `scripts/aws-down.sh` 로 정리하고 Terraform 으로 재생성.
2. **import** — 기존 리소스를 state 로 흡수: `terraform import 'module.eks["mgmt"].aws_eks_cluster.this[0]' kubeheal-mgmt` 식으로 리소스별 진행(모듈 내부 리소스가 많아 손이 감).

## aws-up.sh 와의 관계

Terraform 적용 후 `aws-up.sh`는 `CREATE_CLUSTERS=0`을 명시해 실행한다.
클러스터 생성 단계를 건너뛰고 이미지 빌드·매니페스트 적용·타겟 등록만 수행한다.
